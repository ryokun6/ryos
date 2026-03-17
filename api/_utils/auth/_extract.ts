/**
 * Auth extraction utilities - Extract auth credentials from requests (Node.js runtime)
 *
 * Checks (in order):
 *   1. httpOnly `ryos_auth` cookie                (primary — all browser clients)
 *   2. Authorization header + X-Username header   (legacy migration & programmatic)
 */

import type { VercelRequest } from "@vercel/node";
import type { ExtractedAuth } from "./_types.js";
import { parseAuthCookie } from "../_cookie.js";
import { getHeader } from "../request-helpers.js";

/**
 * Extract authentication credentials from request.
 *
 * Primary: httpOnly `ryos_auth` cookie (all browser clients).
 * Fallback: Authorization header (legacy token-to-cookie migration &
 * programmatic API clients).
 */
export function extractAuth(request: VercelRequest): ExtractedAuth {
  const cookieAuth = parseAuthCookie(request.headers.cookie);
  if (cookieAuth) {
    return { username: cookieAuth.username, token: cookieAuth.token };
  }

  const authHeader = getHeader(request, "authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    if (token && token !== "null" && token !== "undefined" && token !== "__cookie_session__") {
      const username = getHeader(request, "x-username");
      return { username, token };
    }
  }

  return { username: null, token: null };
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
