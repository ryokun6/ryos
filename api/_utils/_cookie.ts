/**
 * httpOnly cookie helpers for auth tokens.
 *
 * Cookie format: `ryos_auth={username}:{token}`
 * Usernames are alphanumeric + hyphens/underscores (no colons), so
 * splitting on the first colon is safe.
 */

import { getRuntimeEnv } from "./_cors.js";
import { getConfiguredPublicOrigin } from "./runtime-config.js";
import { USER_TTL_SECONDS } from "./auth/_constants.js";

export const AUTH_COOKIE_NAME = "ryos_auth";

/**
 * Decide whether to mark the auth cookie as `Secure`.
 *
 * `Secure` means browsers will only send the cookie over HTTPS, which is
 * what we want any time the app is reachable over TLS.
 *
 * Sources, in order of precedence:
 * 1. Explicit override: `AUTH_COOKIE_SECURE=1|true|0|false`. Useful for
 *    self-hosted deployments running behind a TLS-terminating proxy where
 *    auto-detection might be ambiguous.
 * 2. `APP_PUBLIC_ORIGIN`: if it starts with `https://`, the deployment is
 *    HTTPS-fronted regardless of which env "stage" we're in. This is the
 *    primary signal for non-Vercel HTTPS deployments.
 * 3. Vercel preview environments: HTTPS by default.
 * 4. `production` runtime env: HTTPS by convention.
 *
 * Otherwise (local development over plain HTTP) leaves `Secure` off so
 * the cookie still works on http://localhost.
 */
function isSecureContext(): boolean {
  const override = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (override === "1" || override === "true" || override === "yes") return true;
  if (override === "0" || override === "false" || override === "no") return false;

  const publicOrigin = getConfiguredPublicOrigin();
  if (publicOrigin && publicOrigin.startsWith("https://")) return true;

  const env = getRuntimeEnv();
  return env === "production" || env === "preview";
}

export function buildSetAuthCookie(
  username: string,
  token: string,
  maxAgeSeconds: number = USER_TTL_SECONDS
): string {
  const value = `${encodeURIComponent(username.toLowerCase())}:${token}`;
  const parts = [
    `${AUTH_COOKIE_NAME}=${value}`,
    "HttpOnly",
    "Path=/api",
    `Max-Age=${maxAgeSeconds}`,
    "SameSite=Lax",
  ];
  if (isSecureContext()) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function buildClearAuthCookie(): string {
  const parts = [
    `${AUTH_COOKIE_NAME}=`,
    "HttpOnly",
    "Path=/api",
    "Max-Age=0",
    "SameSite=Lax",
  ];
  if (isSecureContext()) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function parseAuthCookie(
  cookieHeader: string | string[] | undefined | null
): { username: string; token: string } | null {
  if (!cookieHeader) return null;

  const raw = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;

  for (const segment of raw.split(";")) {
    const trimmed = segment.trim();
    if (!trimmed.startsWith(`${AUTH_COOKIE_NAME}=`)) continue;

    const value = trimmed.slice(AUTH_COOKIE_NAME.length + 1);
    const colonIdx = value.indexOf(":");
    if (colonIdx === -1) return null;

    const username = decodeURIComponent(value.slice(0, colonIdx));
    const token = value.slice(colonIdx + 1);
    if (username && token) return { username: username.toLowerCase(), token };
  }

  return null;
}
