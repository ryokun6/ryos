export const APPLET_AUTH_MESSAGE_TYPE = "ryos-applet-auth";
export const APPLET_AI_PATH = "/api/applet-ai";
const APPLET_STORAGE_PREFIX = "ryos:applet-storage:";
export const MAX_APPLET_STORAGE_ENTRIES = 256;
export const MAX_APPLET_STORAGE_KEY_LENGTH = 256;
export const MAX_APPLET_STORAGE_VALUE_LENGTH = 256 * 1024;
export const MAX_APPLET_STORAGE_TOTAL_LENGTH = 1024 * 1024;
const APPLET_STORAGE_FLUSH_DELAY_MS = 100;
const APPLET_MESSAGE_RATE_WINDOW_MS = 1_000;
const MAX_APPLET_MESSAGES_PER_WINDOW = 128;
const APPLET_STORAGE_ACK_RETRY_MS = 1_100;

export type AppletStorageSnapshot = Record<string, string>;

export interface AppletStorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

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

export function isAppletAiCapabilityAllowed(
  createdBy: string | null | undefined,
  hasServerGeneratedProvenance: boolean
): boolean {
  return hasServerGeneratedProvenance && isTrustedAppletAuthor(createdBy);
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
 * Every applet gets this compatibility runtime. It preserves local/session
 * storage APIs for opaque origins. The AI fetch proxy is enabled separately
 * only for server-attested content, and no other URL is proxied.
 */
export function createAppletBridgeNonce(): string {
  return crypto.randomUUID();
}

export function createAppletStorageKey(identity: string): string {
  return `${APPLET_STORAGE_PREFIX}${encodeURIComponent(identity)}`;
}

export function resolveAppletStorageIdentity({
  vfsUuid,
  serverShareId,
}: {
  vfsUuid?: string | null;
  serverShareId?: string | null;
}): string | null {
  return vfsUuid || serverShareId || null;
}

export function injectAppletRuntime(
  content: string,
  runtimeScript: string
): string {
  if (!runtimeScript) return content;
  const headMatch = /<head(?:\s[^>]*)?>/i.exec(content);
  if (headMatch) {
    const index = headMatch.index + headMatch[0].length;
    return content.slice(0, index) + runtimeScript + content.slice(index);
  }
  const htmlMatch = /<html(?:\s[^>]*)?>/i.exec(content);
  if (htmlMatch) {
    const index = htmlMatch.index + htmlMatch[0].length;
    return (
      content.slice(0, index) +
      `<head>${runtimeScript}</head>` +
      content.slice(index)
    );
  }
  return `<!DOCTYPE html><html><head>${runtimeScript}</head><body>${content}</body></html>`;
}

export function readAppletStorageSnapshot(
  storageKey: string,
  storage: AppletStorageBackend | null = typeof localStorage === "undefined"
    ? null
    : localStorage
): AppletStorageSnapshot {
  if (!storage) return {};
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainRecord(parsed)) return {};
    const snapshot: AppletStorageSnapshot = Object.create(null);
    for (const [key, value] of Object.entries(parsed)) {
      if (
        typeof value === "string" &&
        key.length <= MAX_APPLET_STORAGE_KEY_LENGTH &&
        value.length <= MAX_APPLET_STORAGE_VALUE_LENGTH
      ) {
        snapshot[key] = value;
      }
    }
    return isValidAppletStorageSnapshot(snapshot) ? snapshot : {};
  } catch {
    return {};
  }
}

function isValidAppletStorageSnapshot(
  snapshot: AppletStorageSnapshot
): boolean {
  const entries = Object.entries(snapshot);
  if (entries.length > MAX_APPLET_STORAGE_ENTRIES) return false;
  let totalLength = 0;
  for (const [key, value] of entries) {
    if (
      key.length > MAX_APPLET_STORAGE_KEY_LENGTH ||
      value.length > MAX_APPLET_STORAGE_VALUE_LENGTH
    ) {
      return false;
    }
    totalLength += key.length + value.length;
    if (totalLength > MAX_APPLET_STORAGE_TOTAL_LENGTH) return false;
  }
  return true;
}

function parseAppletStorageSnapshot(
  value: unknown
): AppletStorageSnapshot | null {
  if (!isPlainRecord(value)) return null;
  const snapshot: AppletStorageSnapshot = Object.create(null);
  for (const [key, entryValue] of Object.entries(value)) {
    if (typeof entryValue !== "string") return null;
    snapshot[key] = entryValue;
  }
  return isValidAppletStorageSnapshot(snapshot) ? snapshot : null;
}

function cloneAppletStorageSnapshot(
  snapshot: AppletStorageSnapshot
): AppletStorageSnapshot {
  return Object.assign(Object.create(null), snapshot);
}

/**
 * Builds the runtime installed before applet code. Every applet receives
 * isolated storage shims; only an attested applet's parent capability accepts
 * AI requests. The nonce bootstraps one MessagePort, which navigation destroys.
 */
export function createAppletAuthBridgeScript(
  documentNonce: string,
  storageSnapshot: AppletStorageSnapshot = {},
  enableAi = true
): string {
  const serializedNonce = JSON.stringify(documentNonce);
  const serializedEnableAi = JSON.stringify(enableAi);
  const serializedStorage = JSON.stringify(storageSnapshot).replaceAll(
    "<",
    "\\u003c"
  );
  return `
<script>
  (function () {
    var CHANNEL = "${APPLET_AUTH_MESSAGE_TYPE}";
    var AI_PATH = "${APPLET_AI_PATH}";
    var AI_ENABLED = ${serializedEnableAi};
    var NONCE = ${serializedNonce};
    var storageData = Object.assign(Object.create(null), ${serializedStorage});
    var pending = new Map();
    var sequence = 0;
    var originalFetch = window.fetch.bind(window);
    var MAX_ENTRIES = ${MAX_APPLET_STORAGE_ENTRIES};
    var MAX_KEY_LENGTH = ${MAX_APPLET_STORAGE_KEY_LENGTH};
    var MAX_VALUE_LENGTH = ${MAX_APPLET_STORAGE_VALUE_LENGTH};
    var MAX_TOTAL_LENGTH = ${MAX_APPLET_STORAGE_TOTAL_LENGTH};

    if (window.__RYOS_APPLET_RUNTIME_PATCHED) return;
    window.__RYOS_APPLET_RUNTIME_PATCHED = true;
    window.__RYOS_APPLET_FETCH_PATCHED = true;
    var channel = new MessageChannel();
    var port = channel.port1;

    var storageRevision = 0;
    var storageSnapshotScheduled = false;
    var storageSnapshotInFlight = null;
    var storageRetryTimer = null;

    function sendStorageSnapshot(message) {
      storageSnapshotInFlight = message;
      port.postMessage(message);
      if (storageRetryTimer !== null) clearTimeout(storageRetryTimer);
      storageRetryTimer = setTimeout(function retryStorageSnapshot() {
        if (storageSnapshotInFlight !== message) return;
        port.postMessage(message);
        storageRetryTimer = setTimeout(retryStorageSnapshot, ${APPLET_STORAGE_ACK_RETRY_MS});
      }, ${APPLET_STORAGE_ACK_RETRY_MS});
    }

    function queueStorageSnapshot() {
      if (storageSnapshotScheduled || storageSnapshotInFlight) return;
      storageSnapshotScheduled = true;
      Promise.resolve().then(function () {
        storageSnapshotScheduled = false;
        if (storageSnapshotInFlight) return;
        sendStorageSnapshot({
          type: CHANNEL,
          action: "storage-snapshot",
          revision: storageRevision,
          snapshot: Object.assign({}, storageData)
        });
      });
    }

    function markStorageChanged() {
      storageRevision += 1;
      queueStorageSnapshot();
    }

    function quotaExceeded() {
      return new DOMException("Applet storage quota exceeded", "QuotaExceededError");
    }

    function assertStorageMutation(data, key, value) {
      if (key.length > MAX_KEY_LENGTH || value.length > MAX_VALUE_LENGTH) {
        throw quotaExceeded();
      }
      var exists = Object.prototype.hasOwnProperty.call(data, key);
      if (!exists && Object.keys(data).length >= MAX_ENTRIES) {
        throw quotaExceeded();
      }
      var total = 0;
      Object.keys(data).forEach(function (existingKey) {
        total += existingKey.length;
        total += existingKey === key ? value.length : data[existingKey].length;
      });
      if (!exists) total += key.length + value.length;
      if (total > MAX_TOTAL_LENGTH) throw quotaExceeded();
    }

    function createStorage(data, persistent) {
      var api = {
        get length() { return Object.keys(data).length; },
        key: function (index) {
          var keys = Object.keys(data);
          return index >= 0 && index < keys.length ? keys[index] : null;
        },
        getItem: function (key) {
          key = String(key);
          return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
        },
        setItem: function (key, value) {
          key = String(key);
          value = String(value);
          assertStorageMutation(data, key, value);
          data[key] = value;
          if (persistent) markStorageChanged();
        },
        removeItem: function (key) {
          key = String(key);
          delete data[key];
          if (persistent) markStorageChanged();
        },
        clear: function () {
          Object.keys(data).forEach(function (key) { delete data[key]; });
          if (persistent) markStorageChanged();
        }
      };
      return new Proxy(api, {
        get: function (target, property, receiver) {
          if (typeof property === "string" && !(property in target)) {
            return target.getItem(property);
          }
          return Reflect.get(target, property, receiver);
        },
        set: function (target, property, value) {
          if (typeof property !== "string" || property in target) return false;
          target.setItem(property, value);
          return true;
        },
        deleteProperty: function (target, property) {
          if (typeof property === "string" && !(property in target)) {
            target.removeItem(property);
          }
          return true;
        },
        ownKeys: function () { return Object.keys(data); },
        getOwnPropertyDescriptor: function (target, property) {
          if (typeof property === "string" && Object.prototype.hasOwnProperty.call(data, property)) {
            return { configurable: true, enumerable: true, writable: true, value: data[property] };
          }
          return Object.getOwnPropertyDescriptor(target, property);
        }
      });
    }

    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createStorage(storageData, true)
    });
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: createStorage({}, false)
    });
    var cookieData = Object.create(null);
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: function () {
        return Object.keys(cookieData).map(function (key) {
          return key + "=" + cookieData[key];
        }).join("; ");
      },
      set: function (input) {
        var pair = String(input).split(";", 1)[0];
        var separator = pair.indexOf("=");
        if (separator <= 0) return;
        var key = pair.slice(0, separator).trim();
        var value = pair.slice(separator + 1).trim();
        if (key) cookieData[key] = value;
      }
    });

    function isAppletAiUrl(url) {
      try {
        return new URL(url, document.baseURI).pathname === AI_PATH;
      } catch (_) {
        return false;
      }
    }

    port.onmessage = function (event) {
      var data = event.data;
      if (!data || data.type !== CHANNEL) return;
      if (data.action === "storage-ack") {
        if (
          storageSnapshotInFlight &&
          data.revision === storageSnapshotInFlight.revision
        ) {
          storageSnapshotInFlight = null;
          if (storageRetryTimer !== null) clearTimeout(storageRetryTimer);
          storageRetryTimer = null;
          if (data.revision !== storageRevision) queueStorageSnapshot();
        }
        return;
      }
      if (data.action !== "ai-response") return;
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
      if (!AI_ENABLED || !isAppletAiUrl(inputUrl)) return originalFetch(input, init);
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
  mutateStorage?: ((value: Record<string, unknown>) => boolean) | null;
  allowAi?: boolean;
  fetchImpl?: typeof fetch;
}

export class AppletBridgeDocumentCapability {
  readonly targetWindow: Window;
  readonly documentNonce: string;
  private readonly fetchImpl: typeof fetch;
  private readonly mutateStorage: ((value: Record<string, unknown>) => boolean) | null;
  private readonly allowAi: boolean;
  private readonly abortController = new AbortController();
  private port: MessagePort | null = null;
  private active = true;
  private messageWindowStartedAt = 0;
  private messageCount = 0;

  constructor({
    targetWindow,
    documentNonce,
    mutateStorage = null,
    allowAi = true,
    fetchImpl = fetch,
  }: AppletBridgeDocumentCapabilityOptions) {
    this.targetWindow = targetWindow;
    this.documentNonce = documentNonce;
    this.mutateStorage = mutateStorage;
    this.allowAi = allowAi;
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
      if (!this.acceptMessage()) return;
      void this.handleRequest(portEvent.data);
    };
    port.start();
    return true;
  }

  private acceptMessage(): boolean {
    const now = Date.now();
    if (now - this.messageWindowStartedAt >= APPLET_MESSAGE_RATE_WINDOW_MS) {
      this.messageWindowStartedAt = now;
      this.messageCount = 0;
    }
    this.messageCount += 1;
    return this.messageCount <= MAX_APPLET_MESSAGES_PER_WINDOW;
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
    if (this.handleStorageRequest(value)) return;
    if (!this.allowAi) return;
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

  private handleStorageRequest(value: unknown): boolean {
    if (!this.mutateStorage || !isPlainRecord(value)) return false;
    if (value.type !== APPLET_AUTH_MESSAGE_TYPE) return false;
    if (
      value.action !== "storage-snapshot" &&
      value.action !== "storage-set" &&
      value.action !== "storage-remove" &&
      value.action !== "storage-clear"
    ) {
      return false;
    }

    const handled = this.mutateStorage(value);
    if (
      handled &&
      value.action === "storage-snapshot" &&
      typeof value.revision === "number" &&
      Number.isSafeInteger(value.revision) &&
      value.revision > 0 &&
      this.active &&
      this.port
    ) {
      this.port.postMessage({
        type: APPLET_AUTH_MESSAGE_TYPE,
        action: "storage-ack",
        revision: value.revision,
      });
    }
    return handled;
  }
}

class AppletStorageSession {
  readonly snapshot: AppletStorageSnapshot;
  private readonly storageKey: string | null;
  private readonly storage: AppletStorageBackend | null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private totalLength = 0;

  constructor(
    storageKey: string | null,
    storage: AppletStorageBackend | null,
    initialSnapshot?: AppletStorageSnapshot
  ) {
    this.storageKey = storageKey;
    this.storage = storage;
    this.snapshot = Object.assign(
      Object.create(null),
      initialSnapshot ?? (storageKey ? readAppletStorageSnapshot(storageKey, storage) : {})
    );
    this.totalLength = Object.entries(this.snapshot).reduce(
      (total, [key, value]) => total + key.length + value.length,
      0
    );
  }

  mutate = (value: Record<string, unknown>): boolean => {
    if (!this.storageKey || !this.storage) return true;
    if (value.action === "storage-snapshot") {
      const nextSnapshot = parseAppletStorageSnapshot(value.snapshot);
      if (!nextSnapshot) return true;
      for (const key of Object.keys(this.snapshot)) delete this.snapshot[key];
      Object.assign(this.snapshot, nextSnapshot);
      this.totalLength = Object.entries(this.snapshot).reduce(
        (total, [key, entryValue]) => total + key.length + entryValue.length,
        0
      );
    } else if (value.action === "storage-clear") {
      if (Object.keys(this.snapshot).length === 0) return true;
      for (const key of Object.keys(this.snapshot)) delete this.snapshot[key];
      this.totalLength = 0;
    } else {
      if (
        typeof value.key !== "string" ||
        value.key.length > MAX_APPLET_STORAGE_KEY_LENGTH
      ) {
        return true;
      }
      if (value.action === "storage-remove") {
        const previous = this.snapshot[value.key];
        if (previous === undefined) return true;
        this.totalLength -= value.key.length + previous.length;
        delete this.snapshot[value.key];
      } else {
        if (
          value.action !== "storage-set" ||
          typeof value.value !== "string" ||
          value.value.length > MAX_APPLET_STORAGE_VALUE_LENGTH
        ) {
          return true;
        }
        const previous = this.snapshot[value.key];
        if (previous === value.value) return true;
        if (
          previous === undefined &&
          Object.keys(this.snapshot).length >= MAX_APPLET_STORAGE_ENTRIES
        ) {
          return true;
        }
        const nextTotal =
          this.totalLength +
          (previous === undefined
            ? value.key.length + value.value.length
            : value.value.length - previous.length);
        if (nextTotal > MAX_APPLET_STORAGE_TOTAL_LENGTH) return true;
        this.snapshot[value.key] = value.value;
        this.totalLength = nextTotal;
      }
    }
    this.dirty = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flush(), APPLET_STORAGE_FLUSH_DELAY_MS);
    return true;
  };

  flush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (!this.dirty || !this.storageKey || !this.storage) return;
    this.dirty = false;
    try {
      if (Object.keys(this.snapshot).length === 0) {
        this.storage.removeItem(this.storageKey);
      } else {
        this.storage.setItem(this.storageKey, JSON.stringify(this.snapshot));
      }
    } catch {
      // Parent quota failures must not expose parent storage or break the applet.
    }
  }

  matchesStorageKey(storageKey: string | null): boolean {
    return this.storageKey === storageKey;
  }
}

/**
 * Tracks the one initial srcdoc load authorized for each WindowProxy. A second
 * load with the same document nonce is navigation and only revokes access.
 */
export class AppletBridgeHost {
  private readonly fetchImpl: typeof fetch;
  private readonly storage: AppletStorageBackend | null;
  private readonly seenDocuments = new WeakMap<Window, string>();
  private readonly capabilities = new Map<Window, AppletBridgeDocumentCapability>();
  private documentNonce: string | null = null;
  private allowAi = false;
  private storageSession: AppletStorageSession | null = null;

  constructor(
    fetchImpl: typeof fetch = fetch,
    storage: AppletStorageBackend | null = typeof localStorage === "undefined"
      ? null
      : localStorage
  ) {
    this.fetchImpl = fetchImpl;
    this.storage = storage;
  }

  prepareDocument(
    documentNonce: string | null,
    storageKey: string | null = null,
    allowAi = true,
    initialStorageSnapshot?: AppletStorageSnapshot
  ): void {
    const authoritativeSnapshot =
      this.storageSession?.matchesStorageKey(storageKey)
        ? cloneAppletStorageSnapshot(this.storageSession.snapshot)
        : initialStorageSnapshot;
    this.invalidateAll();
    this.documentNonce = documentNonce;
    this.allowAi = allowAi;
    this.storageSession = new AppletStorageSession(
      storageKey,
      this.storage,
      authoritativeSnapshot
    );
  }

  getStorageSnapshot(storageKey?: string | null): AppletStorageSnapshot {
    if (
      this.storageSession &&
      (storageKey === undefined ||
        this.storageSession.matchesStorageKey(storageKey))
    ) {
      return cloneAppletStorageSnapshot(this.storageSession.snapshot);
    }
    return storageKey ? readAppletStorageSnapshot(storageKey, this.storage) : {};
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
        mutateStorage: this.storageSession?.mutate,
        allowAi: this.allowAi,
        fetchImpl: this.fetchImpl,
      })
    );
  }

  armWindowForDocument(targetWindow: Window | null | undefined): void {
    if (!targetWindow) return;
    this.capabilities.get(targetWindow)?.invalidate();
    this.capabilities.delete(targetWindow);
    this.seenDocuments.delete(targetWindow);
  }

  handleConnect(event: MessageEvent): boolean {
    if (!event.source) return false;
    const capability = this.capabilities.get(event.source as Window);
    return capability?.connect(event) ?? false;
  }

  invalidateAll(): void {
    this.capabilities.forEach((capability) => capability.invalidate());
    this.capabilities.clear();
    this.storageSession?.flush();
    this.storageSession = null;
  }
}
