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
// Configuration
// ============================================================================

const LOG_PREFIX = "[API]";
const TIMESTAMP_ENABLED = true;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get formatted timestamp for logs
 */
function getTimestamp(): string {
  if (!TIMESTAMP_ENABLED) return "";
  const now = new Date();
  return `[${now.toISOString()}]`;
}

/**
 * Format data for logging (handles objects, errors, etc.)
 */
function formatData(data: unknown): string {
  if (data === undefined || data === null) return "";
  if (data instanceof Error) {
    return `${data.message}${data.stack ? `\n${data.stack}` : ""}`;
  }
  if (typeof data === "object") {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }
  return String(data);
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
  const timestamp = getTimestamp();
  const actionStr = action ? ` - Action: ${action}` : "";
  console.log(`${timestamp} ${LOG_PREFIX} [${requestId}] --> ${method} ${url}${actionStr}`);
}

/**
 * Log a response being sent
 */
export function logResponse(
  requestId: string,
  statusCode: number,
  duration?: number
): void {
  const timestamp = getTimestamp();
  const durationStr = duration !== undefined ? ` (${duration.toFixed(2)}ms)` : "";
  console.log(`${timestamp} ${LOG_PREFIX} [${requestId}] <-- ${statusCode}${durationStr}`);
}

/**
 * Log an info message
 */
export function logInfo(
  requestId: string,
  message: string,
  data?: unknown
): void {
  const timestamp = getTimestamp();
  const dataStr = data !== undefined ? ` ${formatData(data)}` : "";
  console.log(`${timestamp} ${LOG_PREFIX} [${requestId}] INFO: ${message}${dataStr}`);
}

/**
 * Log a warning message
 */
export function logWarn(
  requestId: string,
  message: string,
  data?: unknown
): void {
  const timestamp = getTimestamp();
  const dataStr = data !== undefined ? ` ${formatData(data)}` : "";
  console.warn(`${timestamp} ${LOG_PREFIX} [${requestId}] WARN: ${message}${dataStr}`);
}

/**
 * Log an error message
 */
export function logError(
  requestId: string,
  message: string,
  error?: unknown
): void {
  const timestamp = getTimestamp();
  const errorStr = error !== undefined ? ` ${formatData(error)}` : "";
  console.error(`${timestamp} ${LOG_PREFIX} [${requestId}] ERROR: ${message}${errorStr}`);
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
  const timestamp = getTimestamp();
  const dataStr = data !== undefined ? ` ${formatData(data)}` : "";
  console.log(`${timestamp} ${LOG_PREFIX} [${requestId}] DEBUG: ${message}${dataStr}`);
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



