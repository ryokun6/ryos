/**
 * Auth extraction utilities - Extract auth credentials from requests
 */

import type { ExtractedAuth } from "./_types.js";

/**
 * Extract authentication credentials from request headers
 * 
 * Expects:
 * - Authorization: Bearer <token>
 * - X-Username: <username>
 */
export function extractAuth(request: Request): ExtractedAuth {
  const authHeader = request.headers.get("authorization");
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { username: null, token: null };
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix
  const username = request.headers.get("x-username");

  return { username, token };
}

/**
 * Extract auth with normalized username (lowercase)
 */
export function extractAuthNormalized(request: Request): ExtractedAuth {
  const { username, token } = extractAuth(request);
  return {
    username: username?.toLowerCase() ?? null,
    token,
  };
}

/**
 * Alias for extractAuth - for backwards compatibility with _auth-validate.ts
 * @deprecated Use extractAuth instead
 */
export const extractAuthFromRequest = extractAuth;
