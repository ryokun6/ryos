/**
 * Auth extraction utilities - Extract auth credentials from requests
 */

import type { VercelRequest } from "@vercel/node";
import type { ExtractedAuth } from "./_types.js";

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

/**
 * Extract authentication credentials from request headers
 * 
 * Expects:
 * - Authorization: Bearer <token>
 * - X-Username: <username>
 */
export function extractAuth(request: Request | VercelRequest): ExtractedAuth {
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
export function extractAuthNormalized(request: Request | VercelRequest): ExtractedAuth {
  const { username, token } = extractAuth(request);
  return {
    username: username?.toLowerCase() ?? null,
    token,
  };
}