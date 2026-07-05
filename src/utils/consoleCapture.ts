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

import { readStoredDebugFlagEnabled } from "./debug";

export type ConsoleLogLevel = "log" | "info" | "warn" | "error" | "debug";

type ConsoleFontWeight =
  | "normal"
  | "bold"
  | "bolder"
  | "lighter"
  | 100
  | 200
  | 300
  | 400
  | 500
  | 600
  | 700
  | 800
  | 900;

export interface ConsoleSegmentStyle {
  color?: string;
  backgroundColor?: string;
  fontWeight?: ConsoleFontWeight;
  fontStyle?: "normal" | "italic" | "oblique";
  textDecoration?: "none" | "underline" | "line-through" | "overline";
}

export interface ConsoleStyledSegment {
  text: string;
  style?: ConsoleSegmentStyle;
}

export type ConsoleDisplayPart =
  | {
      type: "text";
      text: string;
      style?: ConsoleSegmentStyle;
    }
  | {
      type: "json";
      text: string;
      summary: string;
    };

export interface ConsoleLogEntry {
  id: number;
  level: ConsoleLogLevel;
  /** Epoch milliseconds when the entry was captured. */
  timestamp: number;
  /** Pre-formatted, copy-ready message text. */
  text: string;
  /** Optional safe representation of browser console `%c` segments. */
  styledSegments?: ConsoleStyledSegment[];
  /** Optional structured representation used for compact, expandable JSON. */
  displayParts?: ConsoleDisplayPart[];
}

const MAX_ENTRIES = 500;

let buffer: ConsoleLogEntry[] = [];
let snapshot: ConsoleLogEntry[] = buffer;
let nextId = 1;
let installed = false;
let captureEnabled = readStoredDebugFlagEnabled();

const listeners = new Set<() => void>();
let flushScheduled = false;

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

interface FormattedConsoleArg {
  text: string;
  jsonSummary?: string;
}

function previewJsonValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value.length > 22 ? `${value.slice(0, 21)}…` : value);
  }
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  if (Array.isArray(value)) return value.length === 0 ? "[]" : "[…]";
  return typeof value === "object" ? "{…}" : String(value);
}

function previewJsonKey(key: string): string {
  const preview = key.length > 18 ? `${key.slice(0, 17)}…` : key;
  return /^[A-Za-z_$][\w$]*$/.test(preview) ? preview : JSON.stringify(preview);
}

function summarizeJson(serialized: string): string | null {
  try {
    const value = JSON.parse(serialized) as unknown;
    if (Array.isArray(value)) {
      const items = value.slice(0, 3).map(previewJsonValue);
      return `[${items.join(", ")}${value.length > 3 ? ", …" : ""}]`;
    }
    if (typeof value !== "object" || value === null) return null;

    const entries = Object.entries(value);
    const visibleEntries = entries
      .slice(0, 3)
      .map(
        ([key, entryValue]) =>
          `${previewJsonKey(key)}: ${previewJsonValue(entryValue)}`
      );
    return `{ ${visibleEntries.join(", ")}${entries.length > 3 ? ", …" : ""} }`;
  } catch {
    return null;
  }
}

function formatArg(arg: unknown): FormattedConsoleArg {
  if (typeof arg === "string") return { text: arg };
  if (arg instanceof Error) {
    return { text: arg.stack || `${arg.name}: ${arg.message}` };
  }
  if (arg === null) return { text: "null" };
  if (arg === undefined) return { text: "undefined" };
  if (typeof arg === "object") {
    try {
      const seen = new WeakSet<object>();
      const serialized = JSON.stringify(
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
      if (typeof serialized !== "string") return { text: String(arg) };
      return {
        text: serialized,
        jsonSummary: summarizeJson(serialized) ?? undefined,
      };
    } catch {
      return { text: String(arg) };
    }
  }
  return { text: String(arg) };
}

function buildDisplayParts(
  formattedArgs: readonly FormattedConsoleArg[]
): ConsoleDisplayPart[] {
  const parts: ConsoleDisplayPart[] = [];
  formattedArgs.forEach((arg, index) => {
    if (index > 0) parts.push({ type: "text", text: " " });
    parts.push(
      arg.jsonSummary
        ? { type: "json", text: arg.text, summary: arg.jsonSummary }
        : { type: "text", text: arg.text }
    );
  });
  return parts;
}

const SAFE_NAMED_COLORS = new Set([
  "black",
  "blue",
  "cyan",
  "gray",
  "green",
  "grey",
  "magenta",
  "orange",
  "purple",
  "red",
  "transparent",
  "white",
  "yellow",
]);
const SAFE_COLOR_FUNCTION_RE =
  /^(?:rgb|rgba|hsl|hsla)\(\s*[-+\d.%]+\s*(?:,\s*[-+\d.%]+\s*){2,3}\)$/i;
const SAFE_HEX_COLOR_RE = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;
const FONT_WEIGHTS: Readonly<Record<string, ConsoleFontWeight>> = {
  normal: "normal",
  bold: "bold",
  bolder: "bolder",
  lighter: "lighter",
  "100": 100,
  "200": 200,
  "300": 300,
  "400": 400,
  "500": 500,
  "600": 600,
  "700": 700,
  "800": 800,
  "900": 900,
};
const FONT_STYLES: Readonly<
  Record<string, NonNullable<ConsoleSegmentStyle["fontStyle"]>>
> = {
  normal: "normal",
  italic: "italic",
  oblique: "oblique",
};
const TEXT_DECORATIONS: Readonly<
  Record<string, NonNullable<ConsoleSegmentStyle["textDecoration"]>>
> = {
  none: "none",
  underline: "underline",
  "line-through": "line-through",
  overline: "overline",
};

function sanitizeColor(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (
    SAFE_HEX_COLOR_RE.test(normalized) ||
    SAFE_COLOR_FUNCTION_RE.test(normalized) ||
    SAFE_NAMED_COLORS.has(normalized)
  ) {
    return normalized;
  }
  return null;
}

/**
 * Convert console CSS into a narrow React-safe style object. Layout, URLs,
 * custom properties, and every declaration outside this allowlist are dropped.
 */
export function sanitizeConsoleStyle(cssText: string): ConsoleSegmentStyle {
  const style: ConsoleSegmentStyle = {};

  for (const declaration of cssText.split(";")) {
    const separatorIndex = declaration.indexOf(":");
    if (separatorIndex < 0) continue;

    const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
    const value = declaration.slice(separatorIndex + 1).trim().toLowerCase();

    if (property === "color") {
      const color = sanitizeColor(value);
      if (color) style.color = color;
      continue;
    }
    if (property === "background" || property === "background-color") {
      const color = sanitizeColor(value);
      if (color) style.backgroundColor = color;
      continue;
    }
    if (property === "font-weight") {
      const fontWeight = FONT_WEIGHTS[value];
      if (fontWeight !== undefined) style.fontWeight = fontWeight;
      continue;
    }
    if (property === "font-style") {
      const fontStyle = FONT_STYLES[value];
      if (fontStyle) style.fontStyle = fontStyle;
      continue;
    }
    if (property === "text-decoration") {
      const textDecoration = TEXT_DECORATIONS[value];
      if (textDecoration) style.textDecoration = textDecoration;
    }
  }

  return style;
}

interface FormattedConsoleArguments {
  text: string;
  styledSegments?: ConsoleStyledSegment[];
  displayParts?: ConsoleDisplayPart[];
}

function findStyleTokenIndexes(format: string): number[] | null {
  const indexes: number[] = [];

  for (let index = 0; index < format.length - 1; index += 1) {
    if (format[index] !== "%") continue;
    const token = format[index + 1];
    if (token === "%") {
      index += 1;
      continue;
    }
    if (token !== "c") return null;
    indexes.push(index);
    index += 1;
  }

  return indexes;
}

/**
 * Preserve browser console `%c` runs while keeping `text` readable for
 * filtering, copy, and agent prompts. Other format placeholders intentionally
 * retain the previous plain-text behavior.
 */
export function formatConsoleArguments(
  args: readonly unknown[]
): FormattedConsoleArguments {
  const formattedArgs = args.map(formatArg);
  const fallbackText = formattedArgs.map((arg) => arg.text).join(" ");
  const fallbackDisplayParts = buildDisplayParts(formattedArgs);
  const expandableFallbackParts = fallbackDisplayParts.some(
    (part) => part.type === "json"
  )
    ? fallbackDisplayParts
    : undefined;
  const format = args[0];
  if (typeof format !== "string" || !format.includes("%c")) {
    return { text: fallbackText, displayParts: expandableFallbackParts };
  }

  const tokenIndexes = findStyleTokenIndexes(format);
  if (
    tokenIndexes === null ||
    tokenIndexes.length === 0 ||
    args.length < tokenIndexes.length + 1
  ) {
    return { text: fallbackText, displayParts: expandableFallbackParts };
  }

  const styleArgs = args.slice(1, tokenIndexes.length + 1);
  if (!styleArgs.every((styleArg) => typeof styleArg === "string")) {
    return { text: fallbackText, displayParts: expandableFallbackParts };
  }

  const styledSegments: ConsoleStyledSegment[] = [];
  let textStart = 0;
  for (let index = 0; index < tokenIndexes.length; index += 1) {
    const tokenIndex = tokenIndexes[index];
    const precedingText = format.slice(textStart, tokenIndex);
    if (precedingText) {
      styledSegments.push(
        index === 0
          ? { text: precedingText }
          : {
              text: precedingText,
              style: sanitizeConsoleStyle(styleArgs[index - 1]),
            }
      );
    }
    textStart = tokenIndex + 2;
  }

  const finalText = format.slice(textStart);
  if (finalText) {
    styledSegments.push({
      text: finalText,
      style: sanitizeConsoleStyle(styleArgs[styleArgs.length - 1]),
    });
  }

  const trailingArgs = formattedArgs.slice(tokenIndexes.length + 1);
  const trailingText = trailingArgs.map((arg) => arg.text).join(" ");
  if (trailingText) {
    styledSegments.push({ text: ` ${trailingText}` });
  }

  const displayParts: ConsoleDisplayPart[] = styledSegments
    .slice(0, trailingText ? -1 : undefined)
    .map((segment) => ({
      type: "text",
      text: segment.text,
      style: segment.style,
    }));
  if (trailingText) {
    displayParts.push({ type: "text", text: " " });
    displayParts.push(...buildDisplayParts(trailingArgs));
  }

  return {
    text: styledSegments.map((segment) => segment.text).join(""),
    styledSegments,
    displayParts,
  };
}

function pushEntry(level: ConsoleLogLevel, args: unknown[]): void {
  if (!captureEnabled) return;
  const formatted = formatConsoleArguments(args);
  buffer.push({
    id: nextId++,
    level,
    timestamp: Date.now(),
    text: formatted.text,
    styledSegments: formatted.styledSegments,
    displayParts: formatted.displayParts,
  });
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
