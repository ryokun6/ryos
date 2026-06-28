/**
 * Console capture buffer.
 *
 * Patches the global `console` methods (and global error handlers) so that log
 * output is mirrored into an in-memory ring buffer. The captured entries power
 * the in-app debug console overlay (see `DebugLogOverlay`), which lets users
 * inspect and copy logs without opening dev tools — useful on mobile/desktop
 * shells where the browser console is not reachable.
 *
 * The original console behavior is always preserved (we call through), so this
 * is non-destructive. Notifications to subscribers are batched on a microtask
 * to avoid render storms when something logs in a tight loop.
 */

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

export interface ConsoleLogEntry {
  id: number;
  level: ConsoleLogLevel;
  /** Epoch milliseconds when the entry was captured. */
  timestamp: number;
  /** Pre-formatted, copy-ready message text. */
  text: string;
  /** Optional safe representation of browser console `%c` segments. */
  styledSegments?: ConsoleStyledSegment[];
}

const MAX_ENTRIES = 500;

let buffer: ConsoleLogEntry[] = [];
let snapshot: ConsoleLogEntry[] = buffer;
let nextId = 1;
let installed = false;

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
  const fallbackText = args.map(formatArg).join(" ");
  const format = args[0];
  if (typeof format !== "string" || !format.includes("%c")) {
    return { text: fallbackText };
  }

  const tokenIndexes = findStyleTokenIndexes(format);
  if (
    tokenIndexes === null ||
    tokenIndexes.length === 0 ||
    args.length < tokenIndexes.length + 1
  ) {
    return { text: fallbackText };
  }

  const styleArgs = args.slice(1, tokenIndexes.length + 1);
  if (!styleArgs.every((styleArg) => typeof styleArg === "string")) {
    return { text: fallbackText };
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

  const trailingText = args
    .slice(tokenIndexes.length + 1)
    .map(formatArg)
    .join(" ");
  if (trailingText) {
    styledSegments.push({ text: ` ${trailingText}` });
  }

  return {
    text: styledSegments.map((segment) => segment.text).join(""),
    styledSegments,
  };
}

function pushEntry(level: ConsoleLogLevel, args: unknown[]): void {
  const formatted = formatConsoleArguments(args);
  buffer.push({
    id: nextId++,
    level,
    timestamp: Date.now(),
    text: formatted.text,
    styledSegments: formatted.styledSegments,
  });
  if (buffer.length > MAX_ENTRIES) {
    buffer = buffer.slice(buffer.length - MAX_ENTRIES);
  }
  scheduleFlush();
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
