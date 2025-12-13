import { Redis } from "@upstash/redis";

// Set up Redis client
const redis = new Redis({
  url: process.env.REDIS_KV_REST_API_URL!,
  token: process.env.REDIS_KV_REST_API_TOKEN!,
});

// Constants for rate limiting
const AI_RATE_LIMIT_PREFIX = "rl:ai:";
export const AI_LIMIT_PER_5_HOURS = 25;
export const AI_LIMIT_ANON_PER_5_HOURS = 3;

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
  const currentCount = await redis.get<string>(key);
  const count = currentCount ? parseInt(currentCount) : 0;

  // Determine if user is anonymous (identifier starts with "anon:")
  const isAnonymous = identifier.startsWith("anon:");

  // Set limit based on authentication status
  const limit = isAnonymous ? AI_LIMIT_ANON_PER_5_HOURS : AI_LIMIT_PER_5_HOURS;

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
        limit: AI_LIMIT_ANON_PER_5_HOURS,
      };
    }

    // If the request is from ryo **and** the token is valid, bypass rate limits entirely
    if (isRyo) {
      return { allowed: true, count, limit };
    }
  }

  // If the user *claims* to be ryo but is **not** authenticated, deny the request outright
  if (isRyo) {
    return {
      allowed: false,
      count: 0,
      limit: AI_LIMIT_ANON_PER_5_HOURS,
    };
  }

  if (count >= limit) {
    return { allowed: false, count, limit };
  }

  // Increment count
  await redis.incr(key);

  // Set TTL to 5 hours if this is the first message
  if (count === 0) {
    const ttlSeconds = 5 * 60 * 60; // 5 hours in seconds
    await redis.expire(key, ttlSeconds);
  }

  return { allowed: true, count: count + 1, limit };
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
 */
export async function checkCounterLimit({
  key,
  windowSeconds,
  limit,
}: CounterLimitArgs): Promise<CounterLimitResult> {
  const current = await redis.get<string>(key);

  if (!current) {
    await redis.set(key, 1, { ex: windowSeconds });
    const ttl = await redis.ttl(key);
    return {
      allowed: true,
      count: 1,
      limit,
      remaining: Math.max(0, limit - 1),
      windowSeconds,
      resetSeconds: typeof ttl === "number" && ttl > 0 ? ttl : windowSeconds,
    };
  }

  const count = parseInt(current);
  if (count >= limit) {
    const ttl = await redis.ttl(key);
    return {
      allowed: false,
      count,
      limit,
      remaining: 0,
      windowSeconds,
      resetSeconds: typeof ttl === "number" && ttl > 0 ? ttl : windowSeconds,
    };
  }

  const newCount = await redis.incr(key);
  const ttl = await redis.ttl(key);
  return {
    allowed: true,
    count: newCount,
    limit,
    remaining: Math.max(0, limit - newCount),
    windowSeconds,
    resetSeconds: typeof ttl === "number" && ttl > 0 ? ttl : windowSeconds,
  };
}

/**
 * Extract a best-effort client IP from common proxy headers.
 */
export function getClientIp(req: Request): string {
  try {
    const h = req.headers;
    const origin = h.get("origin") || "";
    const xVercel = h.get("x-vercel-forwarded-for");
    const xForwarded = h.get("x-forwarded-for");
    const xRealIp = h.get("x-real-ip");
    const cfIp = h.get("cf-connecting-ip");
    const raw = xVercel || xForwarded || xRealIp || cfIp || "";
    let ip = raw.split(",")[0].trim();

    if (!ip) ip = "unknown-ip";

    // Normalize IPv6-mapped IPv4 and loopback variants
    ip = ip.replace(/^::ffff:/i, "");
    const lower = ip.toLowerCase();
    const isLocalOrigin = /^http:\/\/localhost(?::\d+)?$/.test(origin);
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
