/**
 * Common helper functions for chat-rooms API
 */

import type { VercelRequest } from "@vercel/node";

// Helper to get header value from both Web Request and Node.js IncomingMessage
// Handles vercel dev (Node.js headers object) and production (Web Headers)
function getHeader(req: Request | VercelRequest, name: string): string | null {
  // Web standard Headers (has .get method)
  if (req.headers && typeof (req.headers as Headers).get === 'function') {
    return (req.headers as Headers).get(name);
  }
  // Node.js style headers (plain object)
  const headers = req.headers as Record<string, string | string[] | undefined>;
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return typeof value === 'string' ? value : null;
}

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
export function getClientIp(request: Request | VercelRequest): string {
  const xVercel = getHeader(request, "x-vercel-forwarded-for");
  const xForwarded = getHeader(request, "x-forwarded-for");
  const xRealIp = getHeader(request, "x-real-ip");
  const raw = xVercel || xForwarded || xRealIp || "";
  const ip = raw.split(",")[0].trim();
  return ip || "unknown-ip";
}

