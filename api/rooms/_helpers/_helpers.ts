/**
 * Common helper functions for chat-rooms API (Node.js runtime)
 */

import type { VercelRequest } from "@vercel/node";
import { getClientIp as getCentralClientIp } from "../../_utils/_rate-limit.js";

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
 * Extract client IP from request headers.
 *
 * Delegates to the central trusted-proxy aware implementation in
 * `_rate-limit.ts`. Kept as a re-export so existing call sites under
 * `api/rooms/_helpers/*` don't have to change their imports.
 */
export function getClientIp(request: VercelRequest): string {
  return getCentralClientIp(request);
}
