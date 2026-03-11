/**
 * httpOnly cookie helpers for auth tokens.
 *
 * Cookie format: `ryos_auth={username}:{token}`
 * Usernames are alphanumeric + hyphens/underscores (no colons), so
 * splitting on the first colon is safe.
 */

import { getRuntimeEnv } from "./_cors.js";
import { USER_TTL_SECONDS } from "./auth/_constants.js";

export const AUTH_COOKIE_NAME = "ryos_auth";

function isSecureContext(): boolean {
  return getRuntimeEnv() === "production";
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
