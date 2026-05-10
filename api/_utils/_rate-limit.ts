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

interface ClientIpRequest {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string | null };
  connection?: { remoteAddress?: string | null };
}

const isRunningOnVercel = (): boolean => {
  return (
    process.env.VERCEL === "1" ||
    !!process.env.VERCEL_ENV ||
    !!process.env.VERCEL_URL
  );
};

/**
 * Trusted-proxy depth.
 *
 * - On Vercel, headers are set authoritatively by the platform; we
 *   always trust `x-vercel-forwarded-for` / `x-forwarded-for`.
 * - On other deployments (Coolify, Docker, plain Bun), `X-Forwarded-For`
 *   is supplied by the caller and is **not** trustworthy unless a
 *   reverse proxy in front of us strips/rewrites it. Operators must
 *   explicitly opt in via `TRUSTED_PROXY_COUNT=<N>`, where N is the
 *   number of trusted proxies between the client and this process.
 *   When set, we take the IP at index `length - N` of the XFF chain.
 *   When unset (default), we fall back to the socket peer address —
 *   which is the actual TCP client (the proxy itself if there is one,
 *   otherwise the real client).
 *
 * `TRUSTED_PROXY_COUNT=0` is also accepted and means "ignore XFF".
 */
const getTrustedProxyCount = (): number | null => {
  const raw = process.env.TRUSTED_PROXY_COUNT;
  if (raw == null || raw === "") return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
};

const normalizeIp = (raw: string): string => {
  let ip = raw.trim();
  if (!ip) return "";
  // Strip RFC 3986 brackets around IPv6.
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  // Strip the IPv4-mapped IPv6 prefix.
  ip = ip.replace(/^::ffff:/i, "");
  return ip;
};

const pickIpFromXff = (
  xff: string,
  trustedProxyCount: number
): string => {
  const parts = xff
    .split(",")
    .map((part) => normalizeIp(part))
    .filter((part) => part.length > 0);
  if (parts.length === 0) return "";
  // With N trusted proxies in front of us, the rightmost N entries
  // were appended by those proxies (the rightmost was added by the
  // proxy closest to us). The entry at index `length - N` is the IP
  // that hit our outermost trusted proxy — i.e. the real client (or
  // the next untrusted hop if XFF is shorter than expected).
  const idx = Math.max(0, parts.length - trustedProxyCount);
  // Clamp to last index if the header is shorter than expected
  // (treat as "use the closest proxy's reported client" rather than
  // overshooting past the array end).
  return parts[Math.min(idx, parts.length - 1)];
};

const getSocketIp = (req: ClientIpRequest): string => {
  const raw =
    req.socket?.remoteAddress || req.connection?.remoteAddress || "";
  return normalizeIp(raw);
};

/**
 * Extract a best-effort client IP from common proxy headers (Node.js runtime).
 *
 * See `getTrustedProxyCount` for the deployment-specific trust model.
 */
export function getClientIp(req: ClientIpRequest): string {
  try {
    const h = req.headers;
    const origin = getHeaderValue(h, "origin");
    const isLocalOrigin = /^http:\/\/localhost(?::\d+)?$/.test(origin);

    let ip = "";

    if (isRunningOnVercel()) {
      // Vercel sets these headers authoritatively; the caller cannot
      // override them.
      const xVercel = getHeaderValue(h, "x-vercel-forwarded-for");
      const xForwarded = getHeaderValue(h, "x-forwarded-for");
      const xRealIp = getHeaderValue(h, "x-real-ip");
      const cfIp = getHeaderValue(h, "cf-connecting-ip");
      const raw = xVercel || xForwarded || xRealIp || cfIp || "";
      ip = normalizeIp(raw.split(",")[0]);
    } else {
      const trustedProxyCount = getTrustedProxyCount();
      if (trustedProxyCount === null) {
        // No explicit trust configured: ignore caller-supplied XFF
        // entirely (it is spoofable) and use the actual TCP peer.
        ip = getSocketIp(req);
      } else {
        const xForwarded = getHeaderValue(h, "x-forwarded-for");
        if (xForwarded) {
          ip = pickIpFromXff(xForwarded, trustedProxyCount);
        }
        if (!ip) {
          // Fallback: real-ip / socket peer.
          const xRealIp = getHeaderValue(h, "x-real-ip");
          ip = normalizeIp(xRealIp) || getSocketIp(req);
        }
      }
    }

    if (!ip) ip = "unknown-ip";

    const lower = ip.toLowerCase();
    if (
      isLocalOrigin ||
      lower === "::1" ||
      lower === "0:0:0:0:0:0:0:1" ||
      lower === "127.0.0.1"
    ) {
      return "localhost-dev";
    }

    return ip;
  } catch {
    return "unknown-ip";
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
