/**
 * Console capture buffer.
 *
 * Patches the global `console` methods (and global error handlers) so that log
 * output can be mirrored into an in-memory ring buffer while Debug Mode is on.
 * The captured entries power the in-app debug console overlay (see
 * `DebugLogOverlay`), which lets users inspect and copy logs without opening
 * dev tools — useful on mobile/desktop shells where the browser console is not
 * reachable.
 *
 * The original console behavior is always preserved (we call through), so this
 * is non-destructive. Notifications to subscribers are batched on a microtask
 * to avoid render storms when something logs in a tight loop.
 */

import { DEBUG_FLAG_KEY } from "./debug";

export type ConsoleLogLevel = "log" | "info" | "warn" | "error" | "debug";

export interface ConsoleLogEntry {
  id: number;
  level: ConsoleLogLevel;
  /** Epoch milliseconds when the entry was captured. */
  timestamp: number;
  /** Pre-formatted, copy-ready message text. */
  text: string;
}

const MAX_ENTRIES = 500;

let buffer: ConsoleLogEntry[] = [];
let snapshot: ConsoleLogEntry[] = buffer;
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

function formatArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) {
    return arg.stack || `${arg.name}: ${arg.message}`;
  }
  if (arg === null) return "null";
  if (arg === undefined) return "undefined";
  if (typeof arg === "object") {
    try {
      const seen = new WeakSet<object>();
      return JSON.stringify(
        arg,
        (_key, value) => {
          if (typeof value === "object" && value !== null) {
            if (seen.has(value as object)) return "[Circular]";
            seen.add(value as object);
          }
          if (typeof value === "bigint") return `${value}n`;
          if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
          return value;
        },
        2
      );
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

function pushEntry(level: ConsoleLogLevel, args: unknown[]): void {
  if (!captureEnabled) return;
  const text = args.map(formatArg).join(" ");
  buffer.push({ id: nextId++, level, timestamp: Date.now(), text });
  if (buffer.length > MAX_ENTRIES) {
    buffer = buffer.slice(buffer.length - MAX_ENTRIES);
  }
  scheduleFlush();
}

/**
 * Enable or disable buffering. Console methods stay patched once installed so
 * early boot errors keep flowing through the original console path either way.
 */
export function setConsoleCaptureEnabled(enabled: boolean): void {
  captureEnabled = enabled;
  if (!enabled) {
    clearConsoleCapture();
  }
}

/** Exposed for tests and wiring assertions. */
export function isConsoleCaptureEnabled(): boolean {
  return captureEnabled;
}

/**
 * Patch console + global error handlers. Idempotent — safe to call more than
 * once (e.g. across HMR reloads).
 */
export function installConsoleCapture(): void {
  if (installed) return;
  if (typeof console === "undefined") return;
  installed = true;

  const levels: ConsoleLogLevel[] = ["log", "info", "warn", "error", "debug"];
  for (const level of levels) {
    const original = console[level]?.bind(console);
    if (!original) continue;
    console[level] = (...args: unknown[]) => {
      try {
        pushEntry(level, args);
      } catch {
        // Never let capture break logging.
      }
      original(...args);
    };
  }

  if (typeof window !== "undefined") {
    window.addEventListener("error", (event: ErrorEvent) => {
      try {
        const detail = event.error?.stack || event.message;
        pushEntry("error", [
          `Uncaught${detail ? `: ${detail}` : " error"}`,
        ]);
      } catch {
        // ignore
      }
    });
    window.addEventListener(
      "unhandledrejection",
      (event: PromiseRejectionEvent) => {
        try {
          pushEntry("error", ["Unhandled rejection:", event.reason]);
        } catch {
          // ignore
        }
      }
    );
  }
}

/** Subscribe to buffer changes. Returns an unsubscribe function. */
export function subscribeConsoleCapture(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Stable snapshot for `useSyncExternalStore`. */
export function getConsoleCaptureSnapshot(): ConsoleLogEntry[] {
  return snapshot;
}

/** Clear all captured entries. */
export function clearConsoleCapture(): void {
  buffer = [];
  snapshot = buffer;
  scheduleFlush();
}

/** Format the current entries into a copy-ready plain-text blob. */
export function formatConsoleEntriesForCopy(entries: ConsoleLogEntry[]): string {
  return entries
    .map((entry) => {
      const time = new Date(entry.timestamp).toISOString();
      return `[${time}] [${entry.level.toUpperCase()}] ${entry.text}`;
    })
    .join("\n");
}
