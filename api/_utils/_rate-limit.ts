import { createRedis } from "./redis.js";

// Set up Redis client
const redis = createRedis();

// Constants for rate limiting
const AI_RATE_LIMIT_PREFIX = "rl:ai:";
export const AI_LIMIT_PER_5_HOURS = 15;
export const AI_LIMIT_ANON_PER_DAY = 3;
export const AI_WINDOW_AUTHENTICATED = 5 * 60 * 60; // 5 hours in seconds
export const AI_WINDOW_ANONYMOUS = 24 * 60 * 60; // 24 hours in seconds

// Helper function to get rate limit key for a user
const getAIRateLimitKey = (identifier: string): string => {
  // Simple key format: rl:ai:{identifier}
  // For authenticated users: rl:ai:username
  // For anonymous users: rl:ai:anon:123.45.67.89
  return `${AI_RATE_LIMIT_PREFIX}${identifier}`;
};

interface AIRateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
}

// Helper function to check and increment AI message count
export async function checkAndIncrementAIMessageCount(
  identifier: string,
  isAuthenticated: boolean,
  authToken: string | null = null
): Promise<AIRateLimitResult> {
  const key = getAIRateLimitKey(identifier);

  // Determine if user is anonymous (identifier starts with "anon:")
  const isAnonymous = identifier.startsWith("anon:");

  // Set limit and window based on authentication status
  const limit = isAnonymous ? AI_LIMIT_ANON_PER_DAY : AI_LIMIT_PER_5_HOURS;
  const ttlSeconds = isAnonymous ? AI_WINDOW_ANONYMOUS : AI_WINDOW_AUTHENTICATED;

  // Identify privileged user (ryo)
  const isRyo = identifier === "ryo";

  // --- Authentication validation section ---
  // If authenticated, validate the token
  if (isAuthenticated && authToken) {
    const lower = identifier.toLowerCase();
    const userScopedKey = `chat:token:user:${lower}:${authToken}`;
    const exists = await redis.exists(userScopedKey);
    if (!exists) {
      // Invalid token for this user – treat as unauthenticated (use anon limit)
      return {
        allowed: false,
        count: 0,
        limit: AI_LIMIT_ANON_PER_DAY,
      };
    }

    // If the request is from ryo **and** the token is valid, bypass rate limits entirely
    if (isRyo) {
      const currentCount = await redis.get<string>(key);
      const count = currentCount ? parseInt(currentCount, 10) : 0;
      return { allowed: true, count, limit };
    }
  }

  // If the user *claims* to be ryo but is **not** authenticated, deny the request outright
  if (isRyo) {
    return {
      allowed: false,
      count: 0,
      limit: AI_LIMIT_ANON_PER_DAY,
    };
  }

  // ATOMIC rate limit check: increment first, then check
  // This prevents race conditions where two requests read the same count
  const newCount = await redis.incr(key);

  // Set TTL only if this is the first increment (count became 1)
  if (newCount === 1) {
    await redis.expire(key, ttlSeconds);
  }

  // Check if the NEW count exceeds the limit
  if (newCount > limit) {
    // Already incremented, but over limit - request is denied
    // The count stays incremented (slightly conservative) but prevents the race condition
    return { allowed: false, count: newCount, limit };
  }

  return { allowed: true, count: newCount, limit };
}

// ------------------------------
// Generic rate-limit utilities
// ------------------------------

interface CounterLimitArgs {
  key: string;
  windowSeconds: number;
  limit: number;
}

interface CounterLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
  windowSeconds: number;
  resetSeconds: number;
}

/**
 * Increment a counter under a key with a TTL window and enforce a limit.
 * Returns details including remaining and reset seconds.
 * 
 * Uses atomic increment-first approach to prevent race conditions (TOCTOU).
 */
export async function checkCounterLimit({
  key,
  windowSeconds,
  limit,
}: CounterLimitArgs): Promise<CounterLimitResult> {
  // ATOMIC approach: increment first, then check
  // This prevents race conditions where two concurrent requests both read
  // the same count and both pass the limit check
  const newCount = await redis.incr(key);

  // Set TTL only if this is the first increment (count became 1)
  // This is safe because INCR is atomic - only one request will see newCount === 1
  if (newCount === 1) {
    await redis.expire(key, windowSeconds);
  }

  const ttl = await redis.ttl(key);
  const resetSeconds = typeof ttl === "number" && ttl > 0 ? ttl : windowSeconds;

  // Check if the NEW count exceeds the limit
  if (newCount > limit) {
    return {
      allowed: false,
      count: newCount,
      limit,
      remaining: 0,
      windowSeconds,
      resetSeconds,
    };
  }

  return {
    allowed: true,
    count: newCount,
    limit,
    remaining: Math.max(0, limit - newCount),
    windowSeconds,
    resetSeconds,
  };
}

// Helper to get header value from Node.js IncomingMessage headers
function getHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

/**
 * Header injected by `scripts/api-standalone-server.ts` (Bun server) on every
 * incoming request from the actual TCP socket peer. Cannot be set by the
 * client because the standalone server overwrites any incoming value.
 *
 * This is the source of truth for the client IP on bare-metal / Coolify /
 * Docker deployments where there is no upstream proxy injecting trusted
 * forwarded-for headers.
 */
export const PEER_IP_HEADER = "x-ryos-peer-ip";

interface ClientIpSources {
  /** Vercel-managed (always trusted on Vercel deployments). */
  vercel: string;
  /** Standalone Bun server-injected from socket peer (always trusted). */
  peer: string;
  /** Cloudflare-managed (always trusted behind Cloudflare). */
  cloudflare: string;
  /** Generic forwarded-for chain, trusted only with TRUSTED_PROXY_COUNT > 0. */
  forwarded: string;
  /** Generic single-hop client IP, trusted only with TRUSTED_PROXY_COUNT > 0. */
  realIp: string;
}

function readClientIpSources(
  headers: Record<string, string | string[] | undefined>
): ClientIpSources {
  return {
    vercel: getHeaderValue(headers, "x-vercel-forwarded-for"),
    peer: getHeaderValue(headers, PEER_IP_HEADER),
    cloudflare: getHeaderValue(headers, "cf-connecting-ip"),
    forwarded: getHeaderValue(headers, "x-forwarded-for"),
    realIp: getHeaderValue(headers, "x-real-ip"),
  };
}

/**
 * Number of trusted proxy hops in front of this server, configured via the
 * `TRUSTED_PROXY_COUNT` environment variable.
 *
 * - `0` (default): do NOT trust client-supplied `X-Forwarded-For` /
 *   `X-Real-IP`. Use only platform-managed sources (Vercel, Cloudflare,
 *   the standalone Bun server's peer header). This is the safe default
 *   for non-Vercel deployments where clients can otherwise spoof their
 *   IP and bypass rate limits.
 * - `N >= 1`: read the N-th-from-the-right entry of `X-Forwarded-For`,
 *   which is the IP one beyond your trusted reverse proxies. Use this on
 *   Render / Fly.io / nginx-fronted setups where you control the proxy
 *   layer.
 */
function getTrustedProxyCount(): number {
  const raw = process.env.TRUSTED_PROXY_COUNT?.trim();
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function pickFromForwardedFor(value: string, trustedHops: number): string {
  if (!value || trustedHops <= 0) return "";
  const list = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return "";
  // Right-most entry is added by the closest proxy. The "real" client is
  // (trustedHops) entries to the left of the right-most one — i.e. at index
  // (length - trustedHops). Clamp to 0 so over-configuration falls back to
  // the left-most entry (still safer than blindly trusting the right-most).
  const idx = Math.max(0, list.length - trustedHops);
  return list[idx] || "";
}

/**
 * Extract a best-effort client IP for rate-limiting purposes.
 *
 * Trust order (first non-empty wins):
 *   1. `x-vercel-forwarded-for` — set by the Vercel edge, not spoofable.
 *   2. `x-ryos-peer-ip` — set by the standalone Bun server from the socket
 *      peer; the server overwrites any client-supplied value.
 *   3. `cf-connecting-ip` — set by Cloudflare, not spoofable behind it.
 *   4. `x-forwarded-for` (Nth-from-right) — only if TRUSTED_PROXY_COUNT > 0.
 *   5. `x-real-ip` — only if TRUSTED_PROXY_COUNT > 0.
 *
 * If none of the above match, returns `"untrusted-shared-ip"`. All requests
 * from untrusted sources share one rate-limit bucket so an attacker cannot
 * bypass per-IP limits by rotating spoofed headers — this is intentional
 * and documented as the safe default for self-hosted deployments.
 */
export function getClientIp(
  req: { headers: Record<string, string | string[] | undefined> }
): string {
  try {
    const h = req.headers;
    const origin = getHeaderValue(h, "origin");
    const sources = readClientIpSources(h);
    const trustedHops = getTrustedProxyCount();

    let raw = "";
    if (sources.vercel) {
      raw = sources.vercel;
    } else if (trustedHops > 0) {
      // Operator opted in to trusting a known proxy chain — honour it ahead
      // of the socket peer (which is just the proxy itself in that setup).
      raw =
        pickFromForwardedFor(sources.forwarded, trustedHops) ||
        sources.realIp ||
        sources.peer ||
        "";
    } else if (sources.peer) {
      // Standalone Bun server: socket peer is the most authoritative source
      // we have when no proxy is configured.
      raw = sources.peer;
    } else if (sources.cloudflare) {
      raw = sources.cloudflare;
    }

    let ip = (raw || "").split(",")[0].trim();
    if (!ip) {
      // No platform-trusted source and no configured proxy — bucket all
      // such requests together. This deliberately makes per-IP rate limits
      // hash to the same value rather than letting attackers spoof an
      // unlimited IP space via X-Forwarded-For.
      return "untrusted-shared-ip";
    }

    // Normalize IPv6-mapped IPv4
    ip = ip.replace(/^::ffff:/i, "");
    const lower = ip.toLowerCase();

    // Collapse loopback addresses to a single bucket so dev sessions don't
    // fragment across IPv4/IPv6 loopback or hostname variants. We only do
    // this when the resolved IP itself is loopback — when an upstream
    // proxy gives us a real client IP we keep it (so test runners can
    // legitimately exercise per-IP rate limits via X-Forwarded-For).
    if (
      lower === "::1" ||
      lower === "0:0:0:0:0:0:0:1" ||
      lower === "127.0.0.1"
    ) {
      return "localhost-dev";
    }

    // Also normalise when there's no IP source at all but the request
    // looks like it came from a localhost browser — preserves the legacy
    // behaviour for local dev where the standalone server isn't running.
    if (!sources.peer && !sources.vercel && !sources.cloudflare) {
      const isLocalOrigin = /^http:\/\/localhost(?::\d+)?$/.test(origin);
      if (isLocalOrigin && trustedHops === 0) {
        return "localhost-dev";
      }
    }

    return ip;
  } catch {
    return "untrusted-shared-ip";
  }
}

/** @deprecated Use getClientIp instead */
export const getClientIpFromVercel = getClientIp;

/**
 * Build a stable key string from key parts.
 */
export function makeKey(
  parts: Array<string | null | undefined>
): string {
  return parts
    .filter((p): p is string => p !== undefined && p !== null && p !== "")
    .map((p) => encodeURIComponent(String(p)))
    .join(":");
}
