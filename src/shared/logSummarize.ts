const REDACTED = "[redacted]";
const DEFAULT_MAX_STRING_LENGTH = 160;
const DEFAULT_MAX_STACK_LENGTH = 4000;
const MAX_ARRAY_ITEMS = 8;
const MAX_DEPTH = 3;

const SENSITIVE_KEY_RE =
  /(password|token|secret|authorization|cookie|message|prompt|content|html|markdown|base64|blob|dataurl|transcript|body|text|lyrics|deviceid|useragent)$/i;

export interface LogSummarizeOptions {
  maxStringLength?: number;
  maxStackLength?: number;
  /** Serialize DOM/Blob browser types (client logger). */
  includeBrowserTypes?: boolean;
  /** Include non-standard Error own-properties under `props`. */
  includeErrorProps?: boolean;
}

function truncateString(value: string, maxLength: number): string {
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
  seen: WeakSet<object>,
  summarize: (
    value: unknown,
    depth: number,
    seen: WeakSet<object>,
    key?: string
  ) => unknown,
  options: Required<LogSummarizeOptions>
): Record<string, unknown> | undefined {
  const props: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(error)) {
    if (key === "name" || key === "message" || key === "stack" || key === "cause") {
      continue;
    }
    props[key] = shouldRedactKey(key, error as unknown as Record<string, unknown>)
      ? REDACTED
      : summarize(item, depth + 1, seen, key);
  }
  return Object.keys(props).length ? props : undefined;
}

export function summarizeForStructuredLog(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
  key?: string,
  options: LogSummarizeOptions = {}
): unknown {
  const resolved: Required<LogSummarizeOptions> = {
    maxStringLength: options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH,
    maxStackLength: options.maxStackLength ?? DEFAULT_MAX_STACK_LENGTH,
    includeBrowserTypes: options.includeBrowserTypes ?? false,
    includeErrorProps: options.includeErrorProps ?? false,
  };

  const summarize = (
    nextValue: unknown,
    nextDepth: number,
    nextSeen: WeakSet<object>,
    nextKey?: string
  ) => summarizeForStructuredLog(nextValue, nextDepth, nextSeen, nextKey, options);

  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return truncateString(
      value,
      key === "stack" ? resolved.maxStackLength : resolved.maxStringLength
    );
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
    const props = resolved.includeErrorProps
      ? ownErrorProperties(value, depth, seen, summarize, resolved)
      : undefined;
    return {
      kind: "Error",
      name: value.name,
      message: truncateString(value.message, resolved.maxStringLength),
      stack: value.stack
        ? truncateString(value.stack, resolved.maxStackLength)
        : undefined,
      cause:
        cause === undefined ? undefined : summarize(cause, depth + 1, seen, "cause"),
      ...(props ? { props } : {}),
    };
  }

  if (
    resolved.includeBrowserTypes &&
    typeof DOMException !== "undefined" &&
    value instanceof DOMException
  ) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return {
      kind: "DOMException",
      name: value.name,
      message: truncateString(value.message, resolved.maxStringLength),
      code: value.code,
      stack: value.stack
        ? truncateString(value.stack, resolved.maxStackLength)
        : undefined,
    };
  }

  if (
    resolved.includeBrowserTypes &&
    typeof ErrorEvent !== "undefined" &&
    value instanceof ErrorEvent
  ) {
    return {
      kind: "ErrorEvent",
      message: truncateString(value.message, resolved.maxStringLength),
      filename: value.filename,
      lineno: value.lineno,
      colno: value.colno,
      error: summarize(value.error, depth + 1, seen, "error"),
    };
  }

  if (
    resolved.includeBrowserTypes &&
    typeof PromiseRejectionEvent !== "undefined" &&
    value instanceof PromiseRejectionEvent
  ) {
    return {
      kind: "PromiseRejectionEvent",
      reason: summarize(value.reason, depth + 1, seen, "reason"),
    };
  }

  if (resolved.includeBrowserTypes && typeof Blob !== "undefined" && value instanceof Blob) {
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
      .map((item) => summarize(item, depth + 1, seen));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`... (${value.length - MAX_ARRAY_ITEMS} more)`);
    }
    return items;
  }

  const record = value as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  for (const [recordKey, item] of Object.entries(record)) {
    safe[recordKey] = shouldRedactKey(recordKey, record)
      ? REDACTED
      : summarize(item, depth + 1, seen, recordKey);
  }
  return safe;
}
