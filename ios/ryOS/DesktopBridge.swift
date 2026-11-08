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
      // Device battery: seeded at document start (__ryosInitialBattery) and
      // kept current by the shell through __ryosSetBattery below. A missing
      // or unknown battery reads as level 1, charging — the Battery Status
      // API's values for a device without one.
      function normalizeBattery(level, charging, lowPowerMode) {
        level = Number(level);
        if (level !== level) level = 1;
        return {
          level: Math.min(1, Math.max(0, level)),
          charging: charging === undefined ? true : !!charging,
          lowPowerMode: !!lowPowerMode
        };
      }
      var batterySeed = window.__ryosInitialBattery || {};
      var battery = normalizeBattery(
        batterySeed.level === undefined ? 1 : batterySeed.level,
        batterySeed.charging,
        batterySeed.lowPowerMode
      );
      function batterySnapshot() {
        return { level: battery.level, charging: battery.charging, lowPowerMode: battery.lowPowerMode };
      }
      function batteryChargingTime() {
        return battery.charging && battery.level >= 1 ? 0 : Infinity;
      }
      window.ryosDesktop = {
        platform: 'ios',
        isFullscreen: function () { return invoke('isFullscreen'); },
        onFullscreenChange: function () { return function () {}; },
        toggleMaximize: function () { return invoke('toggleMaximize'); },
        openFile: function (o) { return invoke('openFile', { options: o }); },
        // A script message can't carry an ArrayBuffer, so the bytes go as
        // base64, encoded in 3-byte-aligned chunks. The user is picking a
        // location in the save sheet, so the reply can take minutes.
        saveFile: function (o) {
          var d = o && o.data;
          var bytes = !d ? new Uint8Array(0)
            : ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength)
            : new Uint8Array(d);
          var parts = [];
          for (var i = 0; i < bytes.length; i += 24576) {
            parts.push(btoa(String.fromCharCode.apply(null, bytes.subarray(i, i + 24576))));
          }
          return invoke('saveFile', {
            options: {
              title: (o && o.title) || '',
              defaultPath: (o && o.defaultPath) || '',
              filters: (o && o.filters) || []
            },
            data: parts.join('')
          }, 600000);
        },
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
        setStatusBarTone: function (tone) {
          return invoke('setStatusBarTone', { tone: tone === 'dark' ? 'dark' : 'light' });
        },
        // {level 0..1, charging, lowPowerMode}; changes also fire a
        // `ryos-battery` CustomEvent (detail = the same object).
        getBattery: function () { return Promise.resolve(batterySnapshot()); },
        onBatteryChange: function (cb) { return register('batteryChange', cb); },
        // Vertical status-bar cluster extent inside the trailing side bar, in
        // CSS px, and whether the camera dot is part of the cluster: 0/false
        // wherever a vertical bar doesn't exist; on the iPhone Duo poses the
        // bar is the trailing 84pt strip in both poses (probe-confirmed
        // env right = 84 closed and open) and the extent is the cluster's
        // depth in it — 150 with camera (closed), 88 without (open). The iOS
        // shell keeps these current on pose changes via
        // __ryosSetSideStatusBarExtent below, which also fires a
        // `ryos-status-bar-extent` CustomEvent (detail = {extent, hasCamera})
        // so listeners can react without polling.
        sideStatusBarExtent:
          (window.__ryosInitialSideStatusBar &&
            window.__ryosInitialSideStatusBar.extent) || 0,
        sideStatusBarHasCamera:
          !!(window.__ryosInitialSideStatusBar &&
            window.__ryosInitialSideStatusBar.hasCamera),
      };
      window.__ryosSetSideStatusBarExtent = function (v, cam) {
        v = Number(v) || 0;
        cam = !!cam;
        if (window.ryosDesktop.sideStatusBarExtent === v &&
            window.ryosDesktop.sideStatusBarHasCamera === cam) return;
        window.ryosDesktop.sideStatusBarExtent = v;
        window.ryosDesktop.sideStatusBarHasCamera = cam;
        try {
          window.dispatchEvent(new CustomEvent('ryos-status-bar-extent', {
            detail: { extent: v, hasCamera: cam }
          }));
        } catch (e) {}
      };
      // WKWebView has no navigator.getBattery; back one with the shell's
      // values so the web client's Battery Status API code works unchanged.
      // A page that already has one keeps it.
      var batteryManager = null;
      function makeBatteryManager() {
        var manager = null;
        try { manager = new EventTarget(); } catch (e) {}
        if (!manager) {
          var listeners = [];
          manager = {
            addEventListener: function (type, fn) {
              if (!fn) return;
              for (var i = 0; i < listeners.length; i++) {
                if (listeners[i].type === type && listeners[i].fn === fn) return;
              }
              listeners.push({ type: type, fn: fn });
            },
            removeEventListener: function (type, fn) {
              listeners = listeners.filter(function (l) { return !(l.type === type && l.fn === fn); });
            },
            dispatchEvent: function (event) {
              listeners.slice().forEach(function (l) {
                if (l.type !== event.type) return;
                try {
                  if (typeof l.fn === 'function') l.fn.call(manager, event);
                  else if (typeof l.fn.handleEvent === 'function') l.fn.handleEvent(event);
                } catch (e) {}
              });
              return true;
            }
          };
        }
        var getters = {
          level: function () { return battery.level; },
          charging: function () { return battery.charging; },
          chargingTime: batteryChargingTime,
          dischargingTime: function () { return Infinity; }
        };
        Object.keys(getters).forEach(function (key) {
          Object.defineProperty(manager, key, { enumerable: true, get: getters[key] });
        });
        manager.onlevelchange = null;
        manager.onchargingchange = null;
        manager.onchargingtimechange = null;
        manager.ondischargingtimechange = null;
        return manager;
      }
      function fireBatteryEvent(type) {
        if (!batteryManager) return;
        var event;
        try { event = new Event(type); } catch (e) { event = { type: type, target: batteryManager }; }
        try { batteryManager.dispatchEvent(event); } catch (e) {}
        var handler = batteryManager['on' + type];
        if (typeof handler === 'function') {
          try { handler.call(batteryManager, event); } catch (e) {}
        }
      }
      var nav = window.navigator;
      if (nav && !('getBattery' in nav)) {
        try {
          var manager = makeBatteryManager();
          Object.defineProperty(nav, 'getBattery', {
            configurable: true,
            writable: true,
            value: function getBattery() { return Promise.resolve(manager); }
          });
          batteryManager = manager;
        } catch (e) {}
      }
      window.__ryosSetBattery = function (level, charging, lowPowerMode) {
        var next = normalizeBattery(level, charging, lowPowerMode);
        var prev = battery;
        if (next.level === prev.level && next.charging === prev.charging &&
            next.lowPowerMode === prev.lowPowerMode) return;
        var prevChargingTime = batteryChargingTime();
        battery = next;
        if (next.level !== prev.level) fireBatteryEvent('levelchange');
        if (next.charging !== prev.charging) fireBatteryEvent('chargingchange');
        if (batteryChargingTime() !== prevChargingTime) fireBatteryEvent('chargingtimechange');
        callbacks.forEach(function (entry) {
          if (entry.name === 'batteryChange') {
            try { entry.cb(batterySnapshot()); } catch (e) {}
          }
        });
        try {
          window.dispatchEvent(new CustomEvent('ryos-battery', { detail: batterySnapshot() }));
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
