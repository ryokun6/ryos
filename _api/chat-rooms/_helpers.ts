/**
 * Common helper functions for chat-rooms API
 */

// ============================================================================
// Response Helpers
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

/**
 * Create a success JSON response
 */
export function createSuccessResponse<T>(
  data: T,
  status: number = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Add CORS headers to any response
 */
export function addCorsHeaders(
  response: Response,
  origin: string | null
): Response {
  if (!origin) return response;
  const newHeaders = new Headers(response.headers);
  newHeaders.set("Access-Control-Allow-Origin", origin);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

// ============================================================================
// Client IP Helpers
// ============================================================================

/**
 * Extract client IP from request headers
 */
export function getClientIp(request: Request): string {
  const xVercel = request.headers.get("x-vercel-forwarded-for");
  const xForwarded = request.headers.get("x-forwarded-for");
  const xRealIp = request.headers.get("x-real-ip");
  const raw = xVercel || xForwarded || xRealIp || "";
  const ip = raw.split(",")[0].trim();
  return ip || "unknown-ip";
}

