/**
 * Common helper functions for chat-rooms API (Node.js runtime)
 */

// ============================================================================
// Response Helpers (used by internal helper modules)
// ============================================================================

/**
 * Create an error JSON response
 */
export function createErrorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
