/**
 * Auth extraction utilities - Extract auth credentials from requests (Node.js runtime)
 *
 * Checks (in order):
 *   1. Authorization header + X-Username header  (explicit)
 *   2. httpOnly `ryos_auth` cookie               (implicit / after page reload)
 */

import type { VercelRequest } from "@vercel/node";
import type { ExtractedAuth } from "./_types.js";
import { parseAuthCookie } from "../_cookie.js";

// Helper to get header value from Node.js IncomingMessage headers
function getHeader(req: VercelRequest, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return typeof value === "string" ? value : null;
}

/**
 * Extract authentication credentials from request.
 *
 * Prefers explicit Authorization + X-Username headers. Falls back to the
 * httpOnly auth cookie when headers are absent.
 */
export function extractAuth(request: VercelRequest): ExtractedAuth {
  const authHeader = getHeader(request, "authorization");

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    // Ignore placeholder / sentinel values — fall through to cookie auth instead.
    // "__cookie_session__" is the client-side marker indicating cookie-only auth.
    if (token && token !== "null" && token !== "undefined" && token !== "__cookie_session__") {
      const username = getHeader(request, "x-username");
      return { username, token };
    }
  }

  const cookieAuth = parseAuthCookie(request.headers.cookie);
  if (cookieAuth) {
    return { username: cookieAuth.username, token: cookieAuth.token };
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
