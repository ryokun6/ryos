import { isDebugEnabled } from "@/utils/debug";

export type LogContext = Record<string, unknown>;

const REDACTED = "[redacted]";
const MAX_STRING_LENGTH = 160;
const MAX_ARRAY_ITEMS = 8;
const MAX_DEPTH = 3;

const SENSITIVE_KEY_RE =
  /(password|token|secret|authorization|cookie|message|prompt|content|html|markdown|base64|blob|dataurl|transcript|body|text|lyrics|deviceid|useragent)$/i;

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}... (truncated, length=${value.length})`;
}

export function summarizeForLog(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>()
): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") return truncateString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "function") {
    return `[Function ${value.name || "anonymous"}]`;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateString(value.message),
    };
  }

  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return `Blob(size=${value.size}, type=${value.type || "unknown"})`;
  }

  if (value instanceof ArrayBuffer) {
    return `ArrayBuffer(byteLength=${value.byteLength})`;
  }

  if (ArrayBuffer.isView(value)) {
    return `${value.constructor.name}(byteLength=${value.byteLength})`;
  }

  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (depth >= MAX_DEPTH) {
    return Array.isArray(value)
      ? `array(length=${value.length})`
      : `object(keys=${Object.keys(value as Record<string, unknown>).join(",") || "none"})`;
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => summarizeForLog(item, depth + 1, seen));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`... (${value.length - MAX_ARRAY_ITEMS} more)`);
    }
    return items;
  }

  const record = value as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    safe[key] = SENSITIVE_KEY_RE.test(key)
      ? REDACTED
      : summarizeForLog(item, depth + 1, seen);
  }
  return safe;
}

function formatLogArgs(scope: string, message: string, context?: unknown): unknown[] {
  const prefix = `[${scope}]`;
  return context === undefined
    ? [prefix, message]
    : [prefix, message, summarizeForLog(context)];
}

export function createClientLogger(scope: string) {
  return {
    debug(message: string, context?: unknown): void {
      if (isDebugEnabled()) console.log(...formatLogArgs(scope, message, context));
    },
    info(message: string, context?: unknown): void {
      if (isDebugEnabled()) console.info(...formatLogArgs(scope, message, context));
    },
    warn(message: string, context?: unknown): void {
      console.warn(...formatLogArgs(scope, message, context));
    },
    error(message: string, context?: unknown): void {
      console.error(...formatLogArgs(scope, message, context));
    },
  };
}
