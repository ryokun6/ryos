/**
 * Optional cookie/session passthrough for the Internet Explorer proxy
 * (`api/iframe-check.ts`). Entirely env-gated behind `IE_PROXY_SESSIONS=1`
 * (default OFF) because forwarding cookies to third-party sites has privacy
 * implications.
 *
 * How it works: the embedded proxy frame is served from the ryOS origin, so a
 * first-party, HttpOnly, `/api`-scoped cookie (`ie_psid`) reliably identifies
 * the browser across proxied requests. We keep a small per-(psid, host) cookie
 * jar in Redis, replay it as the `Cookie` header on upstream requests for that
 * host, and capture upstream `Set-Cookie` responses back into the jar. This
 * lets logins / sessions persist across navigations and sub-resource calls.
 *
 * The ryOS origin's own cookies are NEVER forwarded upstream — only the jar we
 * captured for the specific target host is sent.
 */
import { randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Redis } from "./redis.js";
import { redisKey, sha256RedisIdentifier } from "../../src/shared/redisKeys.js";

const COOKIE_NAME = "ie_psid";
const JAR_TTL_SECONDS = 60 * 60; // 1 hour
const MAX_JAR_COOKIES = 50;

export function areIeProxySessionsEnabled(): boolean {
  const raw = process.env.IE_PROXY_SESSIONS?.trim().toLowerCase();
  return raw === "1" || raw === "true";
}

function readCookie(req: VercelRequest, name: string): string | null {
  const header = req.headers["cookie"];
  const cookieHeader = Array.isArray(header) ? header.join("; ") : header;
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return part.slice(eq + 1).trim();
    }
  }
  return null;
}

/** Read the existing proxy-session id from the request, if any. */
export function readIeSessionId(req: VercelRequest): string | null {
  const value = readCookie(req, COOKIE_NAME);
  // Basic shape guard so a malicious cookie can't be used to read arbitrary
  // Redis keys (we hash it anyway, but keep it tidy).
  if (value && /^[a-zA-Z0-9-]{8,64}$/.test(value)) return value;
  return null;
}

/** Mint a new session id and set it as a first-party HttpOnly cookie. */
export function ensureIeSessionCookie(
  req: VercelRequest,
  res: VercelResponse
): string {
  const existing = readIeSessionId(req);
  if (existing) return existing;
  const id = randomUUID();
  const secure =
    process.env.AUTH_COOKIE_SECURE === "1" ||
    (process.env.APP_PUBLIC_ORIGIN || "").startsWith("https://") ||
    process.env.NODE_ENV === "production";
  const attrs = [
    `${COOKIE_NAME}=${id}`,
    "Path=/api",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${JAR_TTL_SECONDS}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
  // Preserve any Set-Cookie already queued.
  const prev = res.getHeader("Set-Cookie");
  if (Array.isArray(prev)) {
    res.setHeader("Set-Cookie", [...prev, attrs]);
  } else if (typeof prev === "string") {
    res.setHeader("Set-Cookie", [prev, attrs]);
  } else {
    res.setHeader("Set-Cookie", attrs);
  }
  return id;
}

async function jarKey(psid: string, host: string): Promise<string> {
  return redisKey(
    "cache",
    "ie",
    "session",
    await sha256RedisIdentifier(psid),
    await sha256RedisIdentifier(host.toLowerCase())
  );
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Build a `Cookie` header from the stored jar for the target host. */
export async function loadIeCookieHeader(
  redis: Redis,
  psid: string,
  url: string
): Promise<string | null> {
  const host = hostOf(url);
  if (!host) return null;
  try {
    const raw = await redis.get(await jarKey(psid, host));
    if (!raw) return null;
    const jar = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<
      string,
      string
    >;
    const pairs = Object.entries(jar)
      .filter(([k]) => k)
      .map(([k, v]) => `${k}=${v}`);
    return pairs.length ? pairs.join("; ") : null;
  } catch {
    return null;
  }
}

/** Merge upstream Set-Cookie values into the per-host jar. */
export async function saveIeCookies(
  redis: Redis,
  psid: string,
  url: string,
  setCookies: string[]
): Promise<void> {
  if (!setCookies.length) return;
  const host = hostOf(url);
  if (!host) return;
  try {
    const key = await jarKey(psid, host);
    const raw = await redis.get(key);
    const jar = (
      raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {}
    ) as Record<string, string>;

    for (const cookie of setCookies) {
      // First segment is `name=value`; remaining segments are attributes.
      const firstSegment = cookie.split(";")[0];
      const eq = firstSegment.indexOf("=");
      if (eq === -1) continue;
      const name = firstSegment.slice(0, eq).trim();
      const value = firstSegment.slice(eq + 1).trim();
      if (!name) continue;
      const lower = cookie.toLowerCase();
      const isExpired =
        value === "" ||
        /max-age=0(\b|;|$)/.test(lower) ||
        /expires=thu, 01 jan 1970/.test(lower);
      if (isExpired) {
        delete jar[name];
      } else {
        jar[name] = value;
      }
    }

    // Bound the jar size to avoid unbounded growth from chatty sites.
    const entries = Object.entries(jar).slice(-MAX_JAR_COOKIES);
    const bounded = Object.fromEntries(entries);
    await redis.set(key, bounded, { ex: JAR_TTL_SECONDS });
  } catch {
    /* best-effort; never block the proxy on cookie persistence */
  }
}
