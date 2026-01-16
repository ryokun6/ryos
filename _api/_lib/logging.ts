/**
 * Logging utilities for API routes
 */

// =============================================================================
// Request ID Generation
// =============================================================================

/**
 * Generate a unique request ID for tracing
 */
export function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 10);
}

// =============================================================================
// Logging Functions
// =============================================================================

export type LogFn = (requestId: string, message: string, data?: unknown) => void;

/**
 * Log an incoming request
 */
export function logRequest(
  method: string,
  url: string,
  requestId: string,
  extra?: Record<string, unknown>
): void {
  const urlObj = new URL(url);
  const path = urlObj.pathname;
  console.log(`[${requestId}] ${method} ${path}`, extra ?? "");
}

/**
 * Log an info message
 */
export function logInfo(
  requestId: string,
  message: string,
  data?: unknown
): void {
  if (data !== undefined) {
    console.log(`[${requestId}] ${message}`, data);
  } else {
    console.log(`[${requestId}] ${message}`);
  }
}

/**
 * Log an error message
 */
export function logError(
  requestId: string,
  message: string,
  error?: unknown
): void {
  if (error !== undefined) {
    console.error(`[${requestId}] ERROR: ${message}`, error);
  } else {
    console.error(`[${requestId}] ERROR: ${message}`);
  }
}

/**
 * Log a warning message
 */
export function logWarn(
  requestId: string,
  message: string,
  data?: unknown
): void {
  if (data !== undefined) {
    console.warn(`[${requestId}] WARN: ${message}`, data);
  } else {
    console.warn(`[${requestId}] WARN: ${message}`);
  }
}

/**
 * Log request completion with duration
 */
export function logComplete(
  requestId: string,
  startTime: number,
  status?: number
): void {
  const duration = performance.now() - startTime;
  const statusStr = status ? ` (${status})` : "";
  console.log(`[${requestId}] Completed in ${duration.toFixed(2)}ms${statusStr}`);
}

// =============================================================================
// Logger Factory
// =============================================================================

/**
 * Create a scoped logger for a request
 */
export function createLogger(requestId: string, prefix?: string) {
  const prefixStr = prefix ? `[${prefix}] ` : "";

  return {
    info: (message: string, data?: unknown) => 
      logInfo(requestId, `${prefixStr}${message}`, data),
    error: (message: string, error?: unknown) => 
      logError(requestId, `${prefixStr}${message}`, error),
    warn: (message: string, data?: unknown) => 
      logWarn(requestId, `${prefixStr}${message}`, data),
  };
}
