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
      function invoke(name, args) {
        return new Promise(function (resolve, reject) {
          var id = 'i' + (++cbN);
          pending.set(id, { resolve: resolve, reject: reject });
          post({ kind: 'invoke', id: id, name: name, args: args });
          setTimeout(function () {
            if (pending.has(id)) { pending.delete(id); reject(new Error('bridge timeout: ' + name)); }
          }, 15000);
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
        setAudioActive: function (active) { return invoke('setAudioActive', { active: !!active }); },
        setNowPlaying: function (info) { return invoke('setNowPlaying', { info: info || null }); },
        updatePlayback: function (positionSeconds, rate) {
          return invoke('updatePlayback', { positionSeconds: positionSeconds, rate: rate });
        },
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
      window.__ryosDesktopRemoteCommand = function (command) {};
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
