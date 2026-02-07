export const APPLET_AUTH_MESSAGE_TYPE = "ryos-applet-auth";

export const APPLET_AUTH_BRIDGE_SCRIPT = `
<script>
  (function () {
    var CHANNEL = "${APPLET_AUTH_MESSAGE_TYPE}";
    var MAX_ATTEMPTS = 10;
    var REQUEST_INTERVAL_MS = 200;
    var TIMEOUT_MS = 2000;

    if (typeof window === "undefined") {
      return;
    }

    var currentAuthPayload = null;
    var authResolved = false;
    var resolveAuth = function (payload) {};

    var authReady = new Promise(function (resolve) {
      resolveAuth = function (payload) {
        if (authResolved) {
          return;
        }
        authResolved = true;
        currentAuthPayload = payload || null;
        try {
          window.__RYOS_APPLET_AUTH = currentAuthPayload || {};
        } catch (err) {
          console.warn("[ryOS] Failed to expose applet auth payload:", err);
        }
        resolve(null);
      };
    });

    var attempts = 0;
    var requestOnce = function () {
      try {
        if (window.parent) {
          window.parent.postMessage({ type: CHANNEL, action: "request" }, "*");
        }
      } catch (err) {
        console.warn("[ryOS] Applet auth request failed:", err);
      }
    };

    requestOnce();
    var requestTimer = setInterval(function () {
      attempts += 1;
      if (authResolved || attempts >= MAX_ATTEMPTS) {
        clearInterval(requestTimer);
        return;
      }
      requestOnce();
    }, REQUEST_INTERVAL_MS);

      setTimeout(function () {
        if (!authResolved) {
          clearInterval(requestTimer);
          resolveAuth(null);
        }
      }, TIMEOUT_MS);

      window.addEventListener("message", function (event) {
        var data = event && event.data;
        if (!data || data.type !== CHANNEL || data.action !== "response") {
          return;
        }
        clearInterval(requestTimer);
        if (authResolved) {
          currentAuthPayload = data.payload || null;
          try {
            window.__RYOS_APPLET_AUTH = currentAuthPayload || {};
          } catch (err) {
            console.warn("[ryOS] Failed to refresh applet auth payload:", err);
          }
          return;
        }
        resolveAuth(data.payload || null);
      });

      if (window.__RYOS_APPLET_FETCH_PATCHED) {
        return;
      }

      var originalFetch = window.fetch.bind(window);
      window.__RYOS_APPLET_FETCH_PATCHED = true;
      window.__RYOS_ORIGINAL_FETCH = originalFetch;

      window.fetch = function (input, init) {
        return authReady.then(function () {
          var payload = currentAuthPayload;
          if (!payload || (!payload.username && !payload.authToken)) {
            return originalFetch(input, init);
          }

          var extraHeaders = {};
          if (payload.username) {
            extraHeaders["X-Username"] = payload.username;
          }
          if (payload.authToken) {
            extraHeaders["Authorization"] = "Bearer " + payload.authToken;
          }

          var shouldAugment = function (url) {
            try {
              var resolved = new URL(url, document.baseURI || window.location.origin);
              return resolved.pathname === "/api/applet-ai";
            } catch (err) {
              return false;
            }
          };

          var mergeHeaders = function (primary, secondary) {
            var headers = new Headers(primary || undefined);
            if (secondary) {
              new Headers(secondary).forEach(function (value, key) {
                headers.set(key, value);
              });
            }
            Object.keys(extraHeaders).forEach(function (key) {
              var value = extraHeaders[key];
              if (value) {
                headers.set(key, value);
              }
            });
            return headers;
          };

          var url;
          if (typeof input === "string" || input instanceof URL) {
            url = input.toString();
          } else if (input instanceof Request) {
            url = input.url;
          }

          if (!url || !shouldAugment(url)) {
            return originalFetch(input, init);
          }

          if (input instanceof Request) {
            var headers = mergeHeaders(input.headers, init && init.headers);
            var augmentedRequest = new Request(input, { headers: headers });
            return originalFetch(augmentedRequest);
          }

          var headersForInit = mergeHeaders(init && init.headers);
          var augmentedInit = init ? Object.assign({}, init) : {};
          augmentedInit.headers = headersForInit;
          return originalFetch(input, augmentedInit);
        });
      };
  })();
</script>
`;
