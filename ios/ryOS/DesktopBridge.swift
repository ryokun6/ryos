import Foundation

/// The injected `window.ryosDesktop` bridge. The web client ships a complete
/// "native shell" contract for the Electron desktop app and detects it via
/// `"ryosDesktop" in window`; the iOS shell implements the same surface over
/// WKScriptMessageHandler, so the web client hands us notification config,
/// state and show-notification requests without any changes to it.
enum DesktopBridge {
    static let injectedJavaScript = """
    (function () {
      if ('ryosDesktop' in window) return;
      var pending = new Map();
      var callbacks = new Map();
      var cbN = 0;
      function post(msg) {
        try { window.webkit.messageHandlers.ryosBridge.postMessage(msg); } catch (e) {}
      }
      function invoke(name, args, timeoutMs) {
        return new Promise(function (resolve, reject) {
          var id = 'i' + (++cbN);
          pending.set(id, { resolve: resolve, reject: reject });
          post({ kind: 'invoke', id: id, name: name, args: args });
          setTimeout(function () {
            if (pending.has(id)) { pending.delete(id); reject(new Error('bridge timeout: ' + name)); }
          }, timeoutMs || 15000);
        });
      }
      window.__ryosReply = function (payload) {
        var p = pending.get(payload && payload.id);
        if (!p) return;
        pending.delete(payload.id);
        if (payload.ok) p.resolve(payload.value);
        else p.reject(new Error(String(payload.value)));
      };
      // A notification tap can arrive before the web client subscribes (cold
      // launch); hold the room until the first open-room listener registers.
      var pendingOpenRoom = { has: false, roomId: null };
      function register(name, cb) {
        var key = name + ':' + (++cbN);
        callbacks.set(key, { name: name, cb: cb });
        if (name === 'openChatRoomFromNotification' && pendingOpenRoom.has) {
          var roomId = pendingOpenRoom.roomId;
          pendingOpenRoom = { has: false, roomId: null };
          setTimeout(function () { try { cb(roomId); } catch (e) {} }, 0);
        }
        return function () { callbacks.delete(key); };
      }
      window.ryosDesktop = {
        platform: 'ios',
        isFullscreen: function () { return invoke('isFullscreen'); },
        onFullscreenChange: function () { return function () {}; },
        toggleMaximize: function () { return invoke('toggleMaximize'); },
        openFile: function (o) { return invoke('openFile', { options: o }); },
        saveFile: function (o) { return invoke('saveFile', { options: o }); },
        getVersion: function () { return invoke('getVersion'); },
        canShowNotifications: function () { return invoke('canShowNotifications'); },
        shouldShowNativeNotification: function () { return invoke('shouldShowNativeNotification'); },
        showNotification: function (options) { return invoke('showNotification', { options: options }); },
        // A sign-in can take minutes; the shell replies whenever the sheet closes.
        openAuthSheet: function (o) {
          return invoke('openAuthSheet', {
            url: o && o.url,
            callback: (o && (o.callback || o.callbackScheme)) || '',
            reason: (o && o.reason) || ''
          }, 600000);
        },
        onAuthPopupStatus: function (cb) { return register('authPopupStatus', cb); },
        configureChatNotifications: function (config, state) {
          return invoke('configureChatNotifications', { config: config, state: state });
        },
        updateChatNotificationState: function (state) {
          return invoke('updateChatNotificationState', { state: state });
        },
        stopChatNotifications: function () { return invoke('stopChatNotifications'); },
        onChatNotificationEvent: function (cb) { return register('chatNotificationEvent', cb); },
        onChatNotificationStatus: function (cb) { return register('chatNotificationStatus', cb); },
        onOpenChatRoomFromNotification: function (cb) {
          return register('openChatRoomFromNotification', cb);
        },
        checkForUpdates: function () { return invoke('checkForUpdates'); },
        quitAndInstall: function () { return invoke('quitAndInstall'); },
        onUpdateStatus: function () { return function () {}; },
        playHaptic: function (pattern) { return invoke('playHaptic', { pattern: pattern }); },
        // Vertical status-bar cluster extent inside a side bar, in CSS px:
        // 0 wherever a vertical bar doesn't exist, the measured extent (150
        // on the iPhone Duo closed outer display) where it does. The iOS
        // shell keeps this current on pose changes via
        // __ryosSetSideStatusBarExtent below, which also fires a
        // `ryos-status-bar-extent` CustomEvent (detail = the new value) so
        // listeners can react without polling.
        sideStatusBarExtent: 0,
      };
      window.__ryosSetSideStatusBarExtent = function (v) {
        v = Number(v) || 0;
        if (window.ryosDesktop.sideStatusBarExtent === v) return;
        window.ryosDesktop.sideStatusBarExtent = v;
        try {
          window.dispatchEvent(new CustomEvent('ryos-status-bar-extent', { detail: v }));
        } catch (e) {}
      };
      window.__ryosEmitOpenRoom = function (roomId) {
        var delivered = false;
        callbacks.forEach(function (entry) {
          if (entry.name === 'openChatRoomFromNotification') {
            delivered = true;
            try { entry.cb(roomId); } catch (e) {}
          }
        });
        if (!delivered) pendingOpenRoom = { has: true, roomId: roomId };
      };
      window.__ryosEmitAuthPopupStatus = function (status) {
        callbacks.forEach(function (entry) {
          if (entry.name === 'authPopupStatus') {
            try { entry.cb(status); } catch (e) {}
          }
        });
      };
      window.__ryosBootPainted = function () { return bootPainted; };
      var bootPainted = false;
      function reportBoot() {
        if (bootPainted) return;
        bootPainted = true;
        post({ kind: 'boot-finished' });
      }
      if (document.readyState === 'complete') setTimeout(reportBoot, 300);
      else window.addEventListener('load', function () { setTimeout(reportBoot, 300); });
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) post({ kind: 'app-active' });
      });
    })();
    """
}
