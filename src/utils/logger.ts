import { isDebugEnabled } from "@/utils/debug";

export type LogContext = Record<string, unknown>;

const REDACTED = "[redacted]";
const MAX_STRING_LENGTH = 160;
const MAX_STACK_LENGTH = 4000;
const MAX_ARRAY_ITEMS = 8;
const MAX_DEPTH = 3;

const SENSITIVE_KEY_RE =
  /(password|token|secret|authorization|cookie|message|prompt|content|html|markdown|base64|blob|dataurl|transcript|body|text|lyrics|deviceid|useragent)$/i;

function truncateString(value: string, maxLength = MAX_STRING_LENGTH): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}... (truncated, length=${value.length})`;
}

function isSerializedErrorRecord(record: Record<string, unknown>): boolean {
  if (
    record.kind === "Error" ||
    record.kind === "DOMException" ||
    record.kind === "ErrorEvent" ||
    record.kind === "PromiseRejectionEvent"
  ) {
    return true;
  }
  return (
    typeof record.name === "string" &&
    typeof record.message === "string" &&
    typeof record.stack === "string"
  );
}

function shouldRedactKey(
  key: string,
  record: Record<string, unknown>
): boolean {
  if (!SENSITIVE_KEY_RE.test(key)) return false;
  if (isSerializedErrorRecord(record) && key === "message") return false;
  return true;
}

function ownErrorProperties(
  error: Error,
  depth: number,
  seen: WeakSet<object>
): Record<string, unknown> | undefined {
  const props: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(error)) {
    if (key === "name" || key === "message" || key === "stack" || key === "cause") {
      continue;
    }
    props[key] = shouldRedactKey(key, error as unknown as Record<string, unknown>)
      ? REDACTED
      : summarizeForLog(item, depth + 1, seen, key);
  }
  return Object.keys(props).length ? props : undefined;
}

export function summarizeForLog(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
  key?: string
): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return truncateString(value, key === "stack" ? MAX_STACK_LENGTH : MAX_STRING_LENGTH);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "function") {
    return `[Function ${value.name || "anonymous"}]`;
  }

  if (value instanceof Error) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const cause = "cause" in value ? value.cause : undefined;
    const props = ownErrorProperties(value, depth, seen);
    return {
      kind: "Error",
      name: value.name,
      message: truncateString(value.message),
      stack: value.stack ? truncateString(value.stack, MAX_STACK_LENGTH) : undefined,
      cause:
        cause === undefined
          ? undefined
          : summarizeForLog(cause, depth + 1, seen, "cause"),
      props,
    };
  }

  if (typeof DOMException !== "undefined" && value instanceof DOMException) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return {
      kind: "DOMException",
      name: value.name,
      message: truncateString(value.message),
      code: value.code,
      stack: value.stack ? truncateString(value.stack, MAX_STACK_LENGTH) : undefined,
    };
  }

  if (typeof ErrorEvent !== "undefined" && value instanceof ErrorEvent) {
    return {
      kind: "ErrorEvent",
      message: truncateString(value.message),
      filename: value.filename,
      lineno: value.lineno,
      colno: value.colno,
      error: summarizeForLog(value.error, depth + 1, seen, "error"),
    };
  }

  if (
    typeof PromiseRejectionEvent !== "undefined" &&
    value instanceof PromiseRejectionEvent
  ) {
    return {
      kind: "PromiseRejectionEvent",
      reason: summarizeForLog(value.reason, depth + 1, seen, "reason"),
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
    safe[key] = shouldRedactKey(key, record)
      ? REDACTED
      : summarizeForLog(item, depth + 1, seen, key);
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
