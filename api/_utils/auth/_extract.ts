/**
 * Auth extraction utilities - Extract auth credentials from requests (Node.js runtime)
 */

import type { VercelRequest } from "@vercel/node";
import type { ExtractedAuth } from "./_types.js";

// Helper to get header value from Node.js IncomingMessage headers
function getHeader(req: VercelRequest, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return typeof value === "string" ? value : null;
}

/**
 * Extract authentication credentials from request headers
 * 
 * Expects:
 * - Authorization: Bearer <token>
 * - X-Username: <username>
 */
export function extractAuth(request: VercelRequest): ExtractedAuth {
  const authHeader = getHeader(request, "authorization");
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { username: null, token: null };
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix
  const username = getHeader(request, "x-username");

  return { username, token };
}

/**
 * Extract auth with normalized username (lowercase)
 */
export function extractAuthNormalized(request: VercelRequest): ExtractedAuth {
  const { username, token } = extractAuth(request);
  return {
    username: username?.toLowerCase() ?? null,
    token,
  };
}
