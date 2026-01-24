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

/**
 * Format data for logging (handles objects, errors, etc.)
 */
function formatData(data: unknown): string {
  if (data === undefined || data === null) return "";
  if (data instanceof Error) {
    return `${data.message}${data.stack ? `\n${C.dim}${data.stack}${C.reset}` : ""}`;
  }
  if (typeof data === "object") {
    try {
      const json = COMPACT_JSON ? JSON.stringify(data) : JSON.stringify(data, null, 2);
      if (json.length > 150) {
        return `${C.dim}${json.substring(0, 150)}…${C.reset}`;
      }
      return `${C.dim}${json}${C.reset}`;
    } catch {
      return String(data);
    }
  }
  return String(data);
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
  if (process.env.NODE_ENV === "production") return;
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



