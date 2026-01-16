/**
 * Rate limiting middleware for API routes
 */

import { getRedis } from "../_lib/redis.js";
import { REDIS_KEYS, RATE_LIMITS } from "../_lib/constants.js";
import { rateLimitExceeded, blocked } from "../_lib/errors.js";
import { jsonError, jsonRateLimitError } from "../_lib/response.js";
import type { RateLimitResult, RateLimitConfig, Handler } from "../_lib/types.js";
import { logInfo } from "../_lib/logging.js";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract client IP from request headers
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
 * Build a stable key string from key parts
 */
export function makeKey(parts: Array<string | null | undefined>): string {
  return parts
    .filter((p): p is string => p !== undefined && p !== null && p !== "")
    .map((p) => encodeURIComponent(String(p)))
    .join(":");
}

// =============================================================================
// Core Rate Limiting
// =============================================================================

/**
 * Check and increment a rate limit counter
 * Uses atomic increment-first approach to prevent TOCTOU race conditions
 */
export async function checkRateLimit(config: RateLimitConfig): Promise<RateLimitResult> {
  const redis = getRedis();
  const { key, limit, windowSeconds } = config;

  // ATOMIC approach: increment first, then check
  const newCount = await redis.incr(key);

  // Set TTL only if this is the first increment
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

/**
 * Check if an IP is blocked for a specific action
 */
export async function isBlocked(action: string, identifier: string): Promise<boolean> {
  const redis = getRedis();
  const blockKey = `${REDIS_KEYS.RATE_LIMIT_BLOCK}${action}:${identifier}`;
  const blocked = await redis.exists(blockKey);
  return blocked === 1;
}

/**
 * Block an identifier for a specific action
 */
export async function setBlock(action: string, identifier: string, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  const blockKey = `${REDIS_KEYS.RATE_LIMIT_BLOCK}${action}:${identifier}`;
  await redis.set(blockKey, 1, { ex: ttlSeconds });
}

// =============================================================================
// Pre-configured Rate Limiters
// =============================================================================

/**
 * Check auth action rate limit
 */
export async function checkAuthRateLimit(
  action: string,
  identifier: string,
  requestId?: string
): Promise<RateLimitResult> {
  const key = makeKey([REDIS_KEYS.RATE_LIMIT, action, identifier]);
  const result = await checkRateLimit({
    key,
    limit: RATE_LIMITS.AUTH.MAX_ATTEMPTS,
    windowSeconds: RATE_LIMITS.AUTH.WINDOW_SECONDS,
  });

  if (!result.allowed && requestId) {
    logInfo(requestId, `Rate limit exceeded for ${action} by ${identifier}`);
  }

  return result;
}

/**
 * Check AI chat rate limit
 */
export async function checkAIChatRateLimit(
  identifier: string,
  isAuthenticated: boolean
): Promise<RateLimitResult> {
  const config = isAuthenticated
    ? { limit: RATE_LIMITS.AI_CHAT.AUTH_LIMIT, window: RATE_LIMITS.AI_CHAT.AUTH_WINDOW }
    : { limit: RATE_LIMITS.AI_CHAT.ANON_LIMIT, window: RATE_LIMITS.AI_CHAT.ANON_WINDOW };

  const key = makeKey([REDIS_KEYS.RATE_LIMIT, "ai", identifier]);
  return checkRateLimit({
    key,
    limit: config.limit,
    windowSeconds: config.window,
  });
}

/**
 * Check applet AI rate limit
 */
export async function checkAppletAIRateLimit(
  identifier: string,
  isAuthenticated: boolean,
  mode: "text" | "image"
): Promise<RateLimitResult> {
  const limits = mode === "image"
    ? { auth: RATE_LIMITS.APPLET_AI.IMAGE_AUTH_LIMIT, anon: RATE_LIMITS.APPLET_AI.IMAGE_ANON_LIMIT }
    : { auth: RATE_LIMITS.APPLET_AI.TEXT_AUTH_LIMIT, anon: RATE_LIMITS.APPLET_AI.TEXT_ANON_LIMIT };

  const limit = isAuthenticated ? limits.auth : limits.anon;
  const key = makeKey([REDIS_KEYS.RATE_LIMIT, "applet-ai", mode, identifier]);

  return checkRateLimit({
    key,
    limit,
    windowSeconds: RATE_LIMITS.APPLET_AI.WINDOW,
  });
}

/**
 * Check speech rate limit (burst + daily)
 */
export async function checkSpeechRateLimit(
  identifier: string
): Promise<{ burst: RateLimitResult; daily: RateLimitResult }> {
  const burstKey = makeKey([REDIS_KEYS.RATE_LIMIT, "tts", "burst", identifier]);
  const dailyKey = makeKey([REDIS_KEYS.RATE_LIMIT, "tts", "daily", identifier]);

  const [burst, daily] = await Promise.all([
    checkRateLimit({
      key: burstKey,
      limit: RATE_LIMITS.SPEECH.BURST_LIMIT,
      windowSeconds: RATE_LIMITS.SPEECH.BURST_WINDOW,
    }),
    checkRateLimit({
      key: dailyKey,
      limit: RATE_LIMITS.SPEECH.DAILY_LIMIT,
      windowSeconds: RATE_LIMITS.SPEECH.DAILY_WINDOW,
    }),
  ]);

  return { burst, daily };
}

/**
 * Check chat message rate limit (burst + sustained)
 */
export async function checkMessageRateLimit(
  identifier: string
): Promise<{ burst: RateLimitResult; sustained: RateLimitResult }> {
  const burstKey = makeKey([REDIS_KEYS.RATE_LIMIT, "chat", "burst", identifier]);
  const sustainedKey = makeKey([REDIS_KEYS.RATE_LIMIT, "chat", "sustained", identifier]);

  const [burst, sustained] = await Promise.all([
    checkRateLimit({
      key: burstKey,
      limit: RATE_LIMITS.CHAT_MESSAGE.BURST_LIMIT,
      windowSeconds: RATE_LIMITS.CHAT_MESSAGE.BURST_WINDOW,
    }),
    checkRateLimit({
      key: sustainedKey,
      limit: RATE_LIMITS.CHAT_MESSAGE.SUSTAINED_LIMIT,
      windowSeconds: RATE_LIMITS.CHAT_MESSAGE.SUSTAINED_WINDOW,
    }),
  ]);

  return { burst, sustained };
}

// =============================================================================
// Middleware Wrapper
// =============================================================================

export interface WithRateLimitOptions {
  /** Rate limit key prefix */
  keyPrefix: string;
  /** Maximum requests */
  limit: number;
  /** Window in seconds */
  windowSeconds: number;
  /** Function to extract identifier from request */
  getIdentifier?: (req: Request) => string;
}

/**
 * Wrap a handler with rate limiting
 */
export function withRateLimit(
  handler: Handler,
  options: WithRateLimitOptions
): Handler {
  const { keyPrefix, limit, windowSeconds, getIdentifier } = options;

  return async (req: Request): Promise<Response> => {
    const identifier = getIdentifier ? getIdentifier(req) : getClientIp(req);
    const key = makeKey([REDIS_KEYS.RATE_LIMIT, keyPrefix, identifier]);

    const result = await checkRateLimit({
      key,
      limit,
      windowSeconds,
    });

    if (!result.allowed) {
      return jsonRateLimitError(result);
    }

    return handler(req);
  };
}

/**
 * Create an identifier from auth context or IP
 */
export function getIdentifierFromRequest(
  req: Request,
  username: string | null | undefined
): string {
  if (username) {
    return `user:${username.toLowerCase()}`;
  }
  return `ip:${getClientIp(req)}`;
}
