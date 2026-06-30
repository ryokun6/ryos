/**
 * Logging utilities for API endpoints
 * Provides consistent logging format across the API with terminal output
 * 
 * Node.js runtime - All logs go directly to terminal
 */

// ============================================================================
// Types
// ============================================================================

export type LogFn = (
  requestId: string,
  message: string,
  data?: unknown
) => void;

export type LogLevel = "info" | "warn" | "error" | "debug";

// ============================================================================
// ANSI Color Codes
// ============================================================================

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  // Colors
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

// ============================================================================
// Configuration
// ============================================================================

const COMPACT_JSON = true;
const REDACTED = "[redacted]";
const MAX_STRING_LENGTH = 240;
const MAX_STACK_LENGTH = 4000;
const MAX_ARRAY_ITEMS = 8;
const MAX_DEPTH = 3;
const SENSITIVE_KEY_RE =
  /(password|token|secret|authorization|cookie|message|prompt|content|html|markdown|base64|blob|dataurl|transcript|body|text|lyrics|deviceid|useragent)$/i;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get formatted timestamp for logs (HH:MM:SS)
 */
function getTimestamp(): string {
  const now = new Date();
  return `${C.dim}${now.toTimeString().slice(0, 8)}${C.reset}`;
}

function truncateString(value: string, maxLength = MAX_STRING_LENGTH): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}... (truncated, length=${value.length})`;
}

function isSerializedErrorRecord(record: Record<string, unknown>): boolean {
  if (record.kind === "Error" || record.kind === "DOMException") {
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

export function summarizeForApiLog(
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
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;

  if (value instanceof Error) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return {
      kind: "Error",
      name: value.name,
      message: truncateString(value.message),
      stack: value.stack ? truncateString(value.stack, MAX_STACK_LENGTH) : undefined,
      cause:
        "cause" in value && value.cause !== undefined
          ? summarizeForApiLog(value.cause, depth + 1, seen, "cause")
          : undefined,
    };
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
      .map((item) => summarizeForApiLog(item, depth + 1, seen));
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
      : summarizeForApiLog(item, depth + 1, seen, recordKey);
  }
  return safe;
}

export function isApiDebugLoggingEnabled(): boolean {
  const explicit = process.env.RYOS_DEBUG || process.env.API_DEBUG_LOGS;
  if (explicit === "1" || explicit === "true") return true;
  if (explicit === "0" || explicit === "false") return false;
  return process.env.NODE_ENV !== "production";
}

/**
 * Format data for logging (handles objects, errors, etc.)
 */
function formatData(data: unknown): string {
  if (data === undefined || data === null) return "";
  const safeData = summarizeForApiLog(data);
  if (typeof safeData === "object") {
    try {
      const json = COMPACT_JSON ? JSON.stringify(safeData) : JSON.stringify(safeData, null, 2);
      if (json.length > 240) {
        return `${C.dim}${json.substring(0, 240)}…${C.reset}`;
      }
      return `${C.dim}${json}${C.reset}`;
    } catch {
      return String(safeData);
    }
  }
  return String(safeData);
}

/**
 * Get color for HTTP status code
 */
function getStatusColor(status: number): string {
  if (status >= 500) return C.red;
  if (status >= 400) return C.yellow;
  if (status >= 300) return C.cyan;
  if (status >= 200) return C.green;
  return C.white;
}

/**
 * Get color for HTTP method
 */
function getMethodColor(method: string): string {
  switch (method.toUpperCase()) {
    case "GET": return C.cyan;
    case "POST": return C.green;
    case "PUT": return C.yellow;
    case "PATCH": return C.yellow;
    case "DELETE": return C.red;
    case "OPTIONS": return C.gray;
    default: return C.white;
  }
}

// ============================================================================
// Logging Functions
// ============================================================================

/**
 * Log an incoming request
 */
export function logRequest(
  method: string,
  url: string,
  action: string | null,
  requestId: string
): void {
  const ts = getTimestamp();
  const id = `${C.dim}${requestId}${C.reset}`;
  const m = getMethodColor(method);
  console.log(`${ts} ${id} ${C.green}→${C.reset} ${m}${method.padEnd(6)}${C.reset} ${url}`);
}

/**
 * Log a response being sent
 */
export function logResponse(
  requestId: string,
  statusCode: number,
  duration?: number
): void {
  const ts = getTimestamp();
  const id = `${C.dim}${requestId}${C.reset}`;
  const sc = getStatusColor(statusCode);
  const dur = duration !== undefined ? ` ${C.dim}${Math.round(duration)}ms${C.reset}` : "";
  console.log(`${ts} ${id} ${C.blue}←${C.reset} ${sc}${statusCode}${C.reset}${dur}`);
}

/**
 * Log an info message
 */
export function logInfo(
  requestId: string,
  message: string,
  data?: unknown
): void {
  const ts = getTimestamp();
  const id = `${C.dim}${requestId}${C.reset}`;
  const d = data !== undefined ? ` ${formatData(data)}` : "";
  console.log(`${ts} ${id}    ${message}${d}`);
}

/**
 * Log a warning message
 */
export function logWarn(
  requestId: string,
  message: string,
  data?: unknown
): void {
  const ts = getTimestamp();
  const id = `${C.dim}${requestId}${C.reset}`;
  const d = data !== undefined ? ` ${formatData(data)}` : "";
  console.warn(`${ts} ${id} ${C.yellow}⚠${C.reset}  ${C.yellow}${message}${C.reset}${d}`);
}

/**
 * Log an error message
 */
export function logError(
  requestId: string,
  message: string,
  error?: unknown
): void {
  const ts = getTimestamp();
  const id = `${C.dim}${requestId}${C.reset}`;
  const e = error !== undefined ? ` ${formatData(error)}` : "";
  console.error(`${ts} ${id} ${C.red}✖${C.reset}  ${C.red}${message}${C.reset}${e}`);
}

/**
 * Log a debug message (only in development)
 */
export function logDebug(
  requestId: string,
  message: string,
  data?: unknown
): void {
  if (!isApiDebugLoggingEnabled()) return;
  const ts = getTimestamp();
  const id = `${C.dim}${requestId}${C.reset}`;
  const d = data !== undefined ? ` ${formatData(data)}` : "";
  console.log(`${ts} ${id} ${C.dim}●  ${message}${d}${C.reset}`);
}

// ============================================================================
// Request ID Generation
// ============================================================================

/**
 * Generate a unique request ID for tracing
 */
export function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 10);
}

// ============================================================================
// Logger Factory
// ============================================================================

/**
 * Create a logger instance bound to a specific request ID
 * Useful for cleaner code in handlers
 */
export function createLogger(requestId: string) {
  return {
    request: (method: string, url: string, action?: string | null) =>
      logRequest(method, url, action ?? null, requestId),
    response: (statusCode: number, duration?: number) =>
      logResponse(requestId, statusCode, duration),
    info: (message: string, data?: unknown) =>
      logInfo(requestId, message, data),
    warn: (message: string, data?: unknown) =>
      logWarn(requestId, message, data),
    error: (message: string, error?: unknown) =>
      logError(requestId, message, error),
    debug: (message: string, data?: unknown) =>
      logDebug(requestId, message, data),
  };
}

/**
 * Create a logger and request ID together
 * Most convenient for handler setup
 */
export function initLogger() {
  const requestId = generateRequestId();
  return {
    requestId,
    logger: createLogger(requestId),
  };
}



