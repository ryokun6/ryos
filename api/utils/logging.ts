/**
 * Logging utilities for chat-rooms API
 * Provides consistent logging format across the API
 */

// ============================================================================
// Types
// ============================================================================

export type LogFn = (
  requestId: string,
  message: string,
  data?: unknown
) => void;

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
  console.log(`[${requestId}] ${method} ${url} - Action: ${action || "none"}`);
}

/**
 * Log an info message
 */
export function logInfo(
  requestId: string,
  message: string,
  data?: unknown
): void {
  console.log(`[${requestId}] INFO: ${message}`, data ?? "");
}

/**
 * Log an error message
 */
export function logError(
  requestId: string,
  message: string,
  error?: unknown
): void {
  console.error(`[${requestId}] ERROR: ${message}`, error);
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



