export const APPLET_AUTH_MESSAGE_TYPE = "ryos-applet-auth";
export const APPLET_AI_PATH = "/api/applet-ai";

/**
 * Username of the trusted applet author. Only applets explicitly authored by
 * this account may receive the narrow applet AI bridge when its content was
 * delivered by a trusted server response.
 *
 * Anyone else's applet — including the currently-logged-in user's own
 * applets — runs inside a strict sandbox without same-origin. Local metadata
 * is never sufficient to enable the bridge.
 */
export const TRUSTED_APPLET_AUTHOR = "ryo";

/**
 * Returns true when an applet's `createdBy` value matches the trusted
 * author. Callers must separately establish that the content and author came
 * from a server response rather than local/imported metadata.
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

interface AppletContentAttestation {
  content: string;
  createdBy: string | null | undefined;
}

export function getServerAttestedAppletAuthor(
  renderedContent: string,
  ...attestations: readonly (AppletContentAttestation | null | undefined)[]
): string | null {
  for (const attestation of attestations) {
    if (
      attestation &&
      attestation.content === renderedContent &&
      typeof attestation.createdBy === "string"
    ) {
      return attestation.createdBy;
    }
  }
  return null;
}

/**
 * Applet sandbox attributes. All applets use an opaque origin, including
 * server-attested applets authored by `ryo`.
 */
const APPLET_SANDBOX = [
  "allow-scripts",
  "allow-forms",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-modals",
  "allow-pointer-lock",
  "allow-downloads",
].join(" ");

export function getAppletSandboxAttribute(_trusted?: boolean): string {
  return APPLET_SANDBOX;
}

/**
 * Script injected only into server-attested applets. It preserves existing
 * `fetch("/api/applet-ai", ...)` calls while the iframe has an opaque origin.
 * No other URL is proxied.
 */
export const APPLET_AUTH_BRIDGE_SCRIPT = `
<script>
  (function () {
    var CHANNEL = "${APPLET_AUTH_MESSAGE_TYPE}";
    var AI_PATH = "${APPLET_AI_PATH}";
    var pending = new Map();
    var sequence = 0;
    var originalFetch = window.fetch.bind(window);

    if (window.__RYOS_APPLET_FETCH_PATCHED) return;
    window.__RYOS_APPLET_FETCH_PATCHED = true;

    function isAppletAiUrl(url) {
      try {
        return new URL(url, document.baseURI).pathname === AI_PATH;
      } catch (_) {
        return false;
      }
    }

    window.addEventListener("message", function (event) {
      if (event.source !== window.parent) return;
      var data = event.data;
      if (!data || data.type !== CHANNEL || data.action !== "ai-response") return;
      if (typeof data.requestId !== "string") return;
      var callbacks = pending.get(data.requestId);
      if (!callbacks) return;
      pending.delete(data.requestId);
      if (!data.ok) {
        callbacks.reject(new TypeError("Applet AI request failed"));
        return;
      }
      callbacks.resolve(new Response(data.body, {
        status: data.status,
        statusText: data.statusText,
        headers: data.headers
      }));
    });

    window.fetch = async function (input, init) {
      var inputUrl = input instanceof Request ? input.url : input.toString();
      if (!isAppletAiUrl(inputUrl)) return originalFetch(input, init);
      var absoluteUrl = new URL(inputUrl, document.baseURI).href;
      var request = input instanceof Request
        ? input
        : new Request(absoluteUrl, init);

      var requestId = Date.now().toString(36) + "-" + (++sequence).toString(36);
      var headers = {};
      request.headers.forEach(function (value, key) {
        if (key === "accept" || key === "content-type") headers[key] = value;
      });
      var body = request.method === "GET" || request.method === "HEAD"
        ? null
        : await request.clone().text();

      return new Promise(function (resolve, reject) {
        pending.set(requestId, { resolve: resolve, reject: reject });
        window.parent.postMessage({
          type: CHANNEL,
          action: "ai-request",
          requestId: requestId,
          request: {
            url: AI_PATH,
            method: request.method,
            headers: headers,
            body: body
          }
        }, "*");
      });
    };
  })();
</script>
`;

export interface AppletAiBridgeRequest {
  type: typeof APPLET_AUTH_MESSAGE_TYPE;
  action: "ai-request";
  requestId: string;
  request: {
    url: typeof APPLET_AI_PATH;
    method: "POST";
    headers: Record<string, string>;
    body: string | null;
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAppletAiBridgeRequest(
  value: unknown
): AppletAiBridgeRequest | null {
  if (!isPlainRecord(value)) return null;
  if (
    value.type !== APPLET_AUTH_MESSAGE_TYPE ||
    value.action !== "ai-request" ||
    typeof value.requestId !== "string" ||
    value.requestId.length === 0 ||
    value.requestId.length > 128 ||
    !isPlainRecord(value.request)
  ) {
    return null;
  }

  const request = value.request;
  if (
    request.url !== APPLET_AI_PATH ||
    request.method !== "POST" ||
    (request.body !== null && typeof request.body !== "string") ||
    !isPlainRecord(request.headers)
  ) {
    return null;
  }

  const headers: Record<string, string> = {};
  for (const [name, headerValue] of Object.entries(request.headers)) {
    const normalizedName = name.toLowerCase();
    if (
      (normalizedName !== "accept" && normalizedName !== "content-type") ||
      typeof headerValue !== "string"
    ) {
      return null;
    }
    headers[normalizedName] = headerValue;
  }

  return {
    type: APPLET_AUTH_MESSAGE_TYPE,
    action: "ai-request",
    requestId: value.requestId,
    request: {
      url: APPLET_AI_PATH,
      method: "POST",
      headers,
      body: request.body,
    },
  };
}

export function isTrustedAppletMessageSource(
  source: MessageEventSource | null,
  trustedWindows: readonly Window[]
): source is Window {
  return source !== null && trustedWindows.includes(source as Window);
}

interface HandleAppletBridgeMessageOptions {
  event: MessageEvent;
  trustedWindows: readonly Window[];
  fetchImpl?: typeof fetch;
}

export async function handleAppletBridgeMessage({
  event,
  trustedWindows,
  fetchImpl = fetch,
}: HandleAppletBridgeMessageOptions): Promise<boolean> {
  if (!isTrustedAppletMessageSource(event.source, trustedWindows)) return false;
  const message = parseAppletAiBridgeRequest(event.data);
  if (!message) return false;

  try {
    const response = await fetchImpl(APPLET_AI_PATH, {
      method: "POST",
      credentials: "include",
      headers: message.request.headers,
      body: message.request.body,
    });
    const body = await response.arrayBuffer();
    const contentType = response.headers.get("content-type");
    const headers = contentType ? { "content-type": contentType } : {};
    event.source.postMessage(
      {
        type: APPLET_AUTH_MESSAGE_TYPE,
        action: "ai-response",
        requestId: message.requestId,
        ok: true,
        status: response.status,
        statusText: response.statusText,
        headers,
        body,
      },
      "*",
      [body]
    );
  } catch {
    event.source.postMessage(
      {
        type: APPLET_AUTH_MESSAGE_TYPE,
        action: "ai-response",
        requestId: message.requestId,
        ok: false,
      },
      "*"
    );
  }
  return true;
}
