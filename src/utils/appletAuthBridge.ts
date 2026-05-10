export const APPLET_AUTH_MESSAGE_TYPE = "ryos-applet-auth";

/**
 * Username of the trusted applet author. Only applets explicitly authored by
 * this account receive same-origin sandbox privileges and the auth bridge
 * (which forwards the user's auth cookie on `/api/applet-ai` requests).
 *
 * Anyone else's applet — including the currently-logged-in user's own
 * applets — runs inside a strict sandbox without same-origin and without
 * the bridge. This protects the user's session from malicious third-party
 * applets shared via the Applet Store or imported from disk.
 */
export const TRUSTED_APPLET_AUTHOR = "ryo";

/**
 * Returns true when an applet's `createdBy` value matches the trusted
 * author and the applet is therefore eligible for same-origin privileges
 * and auth bridge injection.
 *
 * Treats null/undefined/empty values as untrusted.
 */
export function isTrustedAppletAuthor(
  createdBy: string | null | undefined
): boolean {
  if (typeof createdBy !== "string") return false;
  const normalized = createdBy.trim().toLowerCase();
  if (!normalized) return false;
  return normalized === TRUSTED_APPLET_AUTHOR;
}

/**
 * Sandbox attributes used for trusted applets (and other AI/system content
 * authored by `ryo`). These iframes can use same-origin features such as
 * the auth bridge and `parent.postMessage` with the parent origin.
 */
const TRUSTED_APPLET_SANDBOX = [
  "allow-scripts",
  "allow-same-origin",
  "allow-forms",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-modals",
  "allow-pointer-lock",
  "allow-downloads",
  "allow-storage-access-by-user-activation",
].join(" ");

/**
 * Sandbox attributes for untrusted applets. CRITICALLY does NOT include
 * `allow-same-origin` — without it, the iframe runs in a unique opaque
 * origin and cannot:
 *   - read parent localStorage / cookies / IndexedDB
 *   - call `window.parent.<anything>` directly
 *   - send credentialed `fetch` requests to the host origin
 * This is the appropriate isolation level for applets authored by anyone
 * other than the trusted admin.
 */
const UNTRUSTED_APPLET_SANDBOX = [
  "allow-scripts",
  "allow-forms",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-modals",
  "allow-pointer-lock",
  "allow-downloads",
].join(" ");

/**
 * Returns the appropriate iframe `sandbox` attribute string for an applet
 * based on whether its author is trusted.
 *
 * Untrusted applets are denied `allow-same-origin` so they cannot escape
 * the sandbox to read parent state or impersonate the user.
 */
export function getAppletSandboxAttribute(trusted: boolean): string {
  return trusted ? TRUSTED_APPLET_SANDBOX : UNTRUSTED_APPLET_SANDBOX;
}

/**
 * Auth bridge script injected into TRUSTED applet iframes only.
 *
 * - Requests the parent's username for display/attribution
 * - Patches `fetch` so credentials are sent on same-origin
 *   `/api/applet-ai` requests (so the httpOnly auth cookie is forwarded).
 *
 * Untrusted (non-ryo) applets never receive this script. Their fetches to
 * `/api/applet-ai` are made from a unique opaque origin and do not include
 * the user's auth cookie — they are subject to the standard anonymous
 * rate limit.
 */
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

    var PARENT_ORIGIN = window.location.origin;
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
        resolve(null);
      };
    });

    var attempts = 0;
    var requestOnce = function () {
      try {
        if (window.parent) {
          window.parent.postMessage(
            { type: CHANNEL, action: "request" },
            PARENT_ORIGIN
          );
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
        if (event.source !== window.parent) {
          return;
        }
        if (event.origin !== PARENT_ORIGIN) {
          return;
        }
        var data = event && event.data;
        if (!data || data.type !== CHANNEL || data.action !== "response") {
          return;
        }
        clearInterval(requestTimer);
        if (authResolved) {
          currentAuthPayload = data.payload || null;
          return;
        }
        resolveAuth(data.payload || null);
      });

      if (window.__RYOS_APPLET_FETCH_PATCHED) {
        return;
      }

      var originalFetch = window.fetch.bind(window);
      window.__RYOS_APPLET_FETCH_PATCHED = true;

      window.fetch = function (input, init) {
        return authReady.then(function () {
          var shouldAugment = function (url) {
            try {
              var resolved = new URL(url, document.baseURI || window.location.origin);
              return resolved.pathname === "/api/applet-ai";
            } catch (err) {
              return false;
            }
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

          var augmentedInit = init ? Object.assign({}, init) : {};
          augmentedInit.credentials = "include";
          return originalFetch(input, augmentedInit);
        });
      };
  })();
</script>
`;
