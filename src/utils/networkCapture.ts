/**
 * Network request capture buffer.
 *
 * Patches the global `fetch` so outgoing HTTP requests can be mirrored into an
 * in-memory ring buffer while Debug Mode is on. The captured entries power the
 * Network tab of the in-app debug panel (see `DebugNetworkPanel`), letting users
 * inspect recent API traffic — method, URL, status, and duration — without
 * opening dev tools. This is especially useful for diagnosing rate-limit (429)
 * and server (5xx) responses on mobile/desktop shells where the browser
 * Network panel is not reachable.
 *
 * Only request metadata is recorded — never request/response bodies or headers
 * — so no credentials or payloads are retained. The original `fetch` behavior
 * is always preserved (we call through), so this is non-destructive.
 * Notifications to subscribers are batched on a microtask to avoid render
 * storms during bursts of requests.
 */

import { DEBUG_FLAG_KEY } from "./debug";

export type NetworkRequestOutcome = "success" | "error" | "pending";

export interface NetworkRequestEntry {
  id: number;
  method: string;
  url: string;
  /** Epoch milliseconds when the request started. */
  startedAt: number;
  /** Wall-clock duration in milliseconds, or null while still pending. */
  durationMs: number | null;
  /** HTTP status code, or null for network errors / pending requests. */
  status: number | null;
  outcome: NetworkRequestOutcome;
  /** Failure detail for network-level errors (not HTTP error statuses). */
  error: string | null;
}

const MAX_ENTRIES = 200;

let buffer: NetworkRequestEntry[] = [];
let snapshot: NetworkRequestEntry[] = buffer;
let nextId = 1;
let installed = false;
let captureEnabled = readInitialCaptureEnabled();

const listeners = new Set<() => void>();
let flushScheduled = false;

function readInitialCaptureEnabled(): boolean {
  try {
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem(DEBUG_FLAG_KEY) === "1"
    );
  } catch {
    return false;
  }
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  const run = () => {
    flushScheduled = false;
    // Publish a fresh immutable snapshot so useSyncExternalStore sees a change.
    snapshot = buffer.slice();
    for (const listener of listeners) listener();
  };
  if (typeof queueMicrotask === "function") {
    queueMicrotask(run);
  } else {
    Promise.resolve().then(run);
  }
}

function resolveRequestMeta(
  input: RequestInfo | URL,
  init?: RequestInit
): { method: string; url: string } {
  let url = "";
  let method = init?.method;

  try {
    if (typeof input === "string") {
      url = input;
    } else if (input instanceof URL) {
      url = input.toString();
    } else if (input instanceof Request) {
      url = input.url;
      method = method ?? input.method;
    } else {
      url = String(input);
    }
  } catch {
    url = "";
  }

  return { method: (method || "GET").toUpperCase(), url };
}

/**
 * Strip query strings so captured URLs stay compact and never retain tokens
 * passed as query params (e.g. realtime tickets). The path + origin is enough
 * to identify the endpoint for debugging.
 */
function sanitizeUrl(url: string): string {
  if (!url) return "";
  const queryIndex = url.indexOf("?");
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

function pushEntry(entry: Omit<NetworkRequestEntry, "id">): number {
  const id = nextId++;
  buffer.push({ ...entry, id });
  if (buffer.length > MAX_ENTRIES) {
    buffer = buffer.slice(buffer.length - MAX_ENTRIES);
  }
  scheduleFlush();
  return id;
}

function updateEntry(
  id: number,
  patch: Partial<Omit<NetworkRequestEntry, "id">>
): void {
  const index = buffer.findIndex((entry) => entry.id === id);
  if (index === -1) return;
  buffer[index] = { ...buffer[index], ...patch };
  scheduleFlush();
}

/**
 * Enable or disable buffering. `fetch` stays patched once installed so toggling
 * Debug Mode does not require reloading; while disabled we call straight
 * through to the original implementation.
 */
export function setNetworkCaptureEnabled(enabled: boolean): void {
  captureEnabled = enabled;
  if (!enabled) {
    clearNetworkCapture();
  }
}

/** Exposed for tests and wiring assertions. */
export function isNetworkCaptureEnabled(): boolean {
  return captureEnabled;
}

/**
 * Patch the global `fetch`. Idempotent — safe to call more than once (e.g.
 * across HMR reloads).
 */
export function installNetworkCapture(): void {
  if (installed) return;
  if (typeof globalThis.fetch !== "function") return;
  installed = true;

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = ((
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    if (!captureEnabled) {
      return originalFetch(input, init);
    }

    const { method, url } = resolveRequestMeta(input, init);
    const startedAt = Date.now();
    const startMark =
      typeof performance !== "undefined" ? performance.now() : startedAt;

    let entryId: number | null = null;
    try {
      entryId = pushEntry({
        method,
        url: sanitizeUrl(url),
        startedAt,
        durationMs: null,
        status: null,
        outcome: "pending",
        error: null,
      });
    } catch {
      // Never let capture break the request.
      return originalFetch(input, init);
    }

    const elapsed = (): number => {
      const end =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      return Math.max(0, Math.round(end - startMark));
    };

    return originalFetch(input, init).then(
      (response) => {
        try {
          if (entryId !== null) {
            updateEntry(entryId, {
              durationMs: elapsed(),
              status: response.status,
              outcome: response.ok ? "success" : "error",
            });
          }
        } catch {
          // ignore
        }
        return response;
      },
      (error: unknown) => {
        try {
          if (entryId !== null) {
            updateEntry(entryId, {
              durationMs: elapsed(),
              status: null,
              outcome: "error",
              error:
                error instanceof Error
                  ? error.message
                  : String(error ?? "Network error"),
            });
          }
        } catch {
          // ignore
        }
        throw error;
      }
    );
  }) as typeof fetch;
}

/** Subscribe to buffer changes. Returns an unsubscribe function. */
export function subscribeNetworkCapture(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Stable snapshot for `useSyncExternalStore`. */
export function getNetworkCaptureSnapshot(): NetworkRequestEntry[] {
  return snapshot;
}

/** Clear all captured entries. */
export function clearNetworkCapture(): void {
  buffer = [];
  snapshot = buffer;
  scheduleFlush();
}

/**
 * Classify an HTTP status into a coarse severity bucket for display. Network
 * errors (no status) and 5xx are "error"; 4xx is "warn"; everything else is
 * "ok".
 */
export function classifyNetworkStatus(
  status: number | null,
  outcome: NetworkRequestOutcome
): "ok" | "warn" | "error" | "pending" {
  if (outcome === "pending") return "pending";
  if (status === null) return "error";
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  return "ok";
}

/** Format the current entries into a copy-ready plain-text blob. */
export function formatNetworkEntriesForCopy(
  entries: readonly NetworkRequestEntry[]
): string {
  return entries
    .map((entry) => {
      const time = new Date(entry.startedAt).toISOString();
      const status =
        entry.outcome === "pending"
          ? "pending"
          : entry.status !== null
            ? String(entry.status)
            : entry.error
              ? `error (${entry.error})`
              : "error";
      const duration =
        entry.durationMs !== null ? ` ${entry.durationMs}ms` : "";
      return `[${time}] ${entry.method} ${status}${duration} ${entry.url}`;
    })
    .join("\n");
}
