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
export function createAppletBridgeNonce(): string {
  return crypto.randomUUID();
}

/**
 * Builds the bridge installed in one trusted srcdoc document. The nonce only
 * bootstraps a MessagePort; requests and responses never use window messages.
 * A navigation destroys the child end of the port.
 */
export function createAppletAuthBridgeScript(documentNonce: string): string {
  const serializedNonce = JSON.stringify(documentNonce);
  return `
<script>
  (function () {
    var CHANNEL = "${APPLET_AUTH_MESSAGE_TYPE}";
    var AI_PATH = "${APPLET_AI_PATH}";
    var NONCE = ${serializedNonce};
    var pending = new Map();
    var sequence = 0;
    var originalFetch = window.fetch.bind(window);

    if (window.__RYOS_APPLET_FETCH_PATCHED) return;
    window.__RYOS_APPLET_FETCH_PATCHED = true;
    var channel = new MessageChannel();
    var port = channel.port1;

    function isAppletAiUrl(url) {
      try {
        return new URL(url, document.baseURI).pathname === AI_PATH;
      } catch (_) {
        return false;
      }
    }

    port.onmessage = function (event) {
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
    };
    port.start();

    window.addEventListener("load", function () {
      window.parent.postMessage({
        type: CHANNEL,
        action: "connect",
        nonce: NONCE
      }, "*", [channel.port2]);
    }, { once: true });

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
        port.postMessage({
          type: CHANNEL,
          action: "ai-request",
          requestId: requestId,
          request: {
            url: AI_PATH,
            method: request.method,
            headers: headers,
            body: body
          }
        });
      });
    };
  })();
</script>
`;
}

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

interface AppletBridgeDocumentCapabilityOptions {
  targetWindow: Window;
  documentNonce: string;
  fetchImpl?: typeof fetch;
}

export class AppletBridgeDocumentCapability {
  readonly targetWindow: Window;
  readonly documentNonce: string;
  private readonly fetchImpl: typeof fetch;
  private readonly abortController = new AbortController();
  private port: MessagePort | null = null;
  private active = true;

  constructor({
    targetWindow,
    documentNonce,
    fetchImpl = fetch,
  }: AppletBridgeDocumentCapabilityOptions) {
    this.targetWindow = targetWindow;
    this.documentNonce = documentNonce;
    this.fetchImpl = fetchImpl;
  }

  connect(event: MessageEvent): boolean {
    if (!this.active || this.port || event.source !== this.targetWindow) {
      return false;
    }
    if (!isPlainRecord(event.data)) return false;
    if (
      event.data.type !== APPLET_AUTH_MESSAGE_TYPE ||
      event.data.action !== "connect" ||
      event.data.nonce !== this.documentNonce ||
      event.ports.length !== 1
    ) {
      return false;
    }

    const port = event.ports[0];
    this.port = port;
    port.onmessage = (portEvent) => {
      void this.handleRequest(portEvent.data);
    };
    port.start();
    return true;
  }

  invalidate(): void {
    if (!this.active) return;
    this.active = false;
    this.abortController.abort();
    this.port?.close();
    this.port = null;
  }

  private async handleRequest(value: unknown): Promise<void> {
    if (!this.active || !this.port) return;
    const message = parseAppletAiBridgeRequest(value);
    if (!message) return;

    try {
      const response = await this.fetchImpl(APPLET_AI_PATH, {
        method: "POST",
        credentials: "include",
        headers: message.request.headers,
        body: message.request.body,
        signal: this.abortController.signal,
      });
      const body = await response.arrayBuffer();
      if (!this.active || !this.port) return;
      const contentType = response.headers.get("content-type");
      const headers = contentType ? { "content-type": contentType } : {};
      this.port.postMessage(
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
        [body]
      );
    } catch {
      if (!this.active || !this.port) return;
      this.port.postMessage({
        type: APPLET_AUTH_MESSAGE_TYPE,
        action: "ai-response",
        requestId: message.requestId,
        ok: false,
      });
    }
  }
}

/**
 * Tracks the one initial srcdoc load authorized for each WindowProxy. A second
 * load with the same document nonce is navigation and only revokes access.
 */
export class AppletBridgeHost {
  private readonly fetchImpl: typeof fetch;
  private readonly seenDocuments = new WeakMap<Window, string>();
  private readonly capabilities = new Map<Window, AppletBridgeDocumentCapability>();
  private documentNonce: string | null = null;

  constructor(fetchImpl: typeof fetch = fetch) {
    this.fetchImpl = fetchImpl;
  }

  prepareDocument(documentNonce: string | null): void {
    this.invalidateAll();
    this.documentNonce = documentNonce;
  }

  handleIframeLoad(
    targetWindow: Window | null | undefined,
    documentNonce: string | null = this.documentNonce
  ): void {
    if (!targetWindow) return;
    this.capabilities.get(targetWindow)?.invalidate();
    this.capabilities.delete(targetWindow);

    const nonce = documentNonce;
    if (!nonce || this.seenDocuments.get(targetWindow) === nonce) return;
    this.seenDocuments.set(targetWindow, nonce);
    this.capabilities.set(
      targetWindow,
      new AppletBridgeDocumentCapability({
        targetWindow,
        documentNonce: nonce,
        fetchImpl: this.fetchImpl,
      })
    );
  }

  handleConnect(event: MessageEvent): boolean {
    if (!event.source) return false;
    const capability = this.capabilities.get(event.source as Window);
    return capability?.connect(event) ?? false;
  }

  invalidateAll(): void {
    this.capabilities.forEach((capability) => capability.invalidate());
    this.capabilities.clear();
  }
}
