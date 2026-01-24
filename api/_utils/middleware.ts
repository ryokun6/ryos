/**
 * Middleware utilities for API endpoints (Node.js runtime only)
 * 
 * Re-exports commonly used utilities for convenience.
 */

import type { Redis } from "@upstash/redis";
import type { VercelRequest } from "@vercel/node";
import { extractAuth, validateAuth } from "./auth/index.js";
import type { AuthenticatedUser } from "./auth/index.js";
import { getEffectiveOrigin, isAllowedOrigin } from "./_cors.js";
import * as RateLimit from "./_rate-limit.js";
import { createRedis } from "./redis.js";

// Helper to get header value from Node.js IncomingMessage headers
function getHeader(req: VercelRequest, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return typeof value === "string" ? value : null;
}

// ============================================================================
// Re-exports
// ============================================================================

export { createRedis } from "./redis.js";
export { getClientIp, getClientIpFromVercel } from "./_rate-limit.js";
export { getEffectiveOrigin, isAllowedOrigin, handlePreflight, setCorsHeaders } from "./_cors.js";
export type { SetCorsHeadersOptions } from "./_cors.js";
export { extractAuth, extractAuthNormalized } from "./auth/index.js";
export type { AuthenticatedUser } from "./auth/index.js";

export {
  REDIS_PREFIXES,
  TTL,
  RATE_LIMIT_TIERS,
  PASSWORD,
  VALIDATION,
  TOKEN,
} from "./constants.js";

// ============================================================================
// Admin Check
// ============================================================================

/**
 * Check if a user is admin (ryo) with a valid token
 */
export async function isAdmin(
  redis: Redis,
  username: string | null,
  token: string | null
): Promise<boolean> {
  if (!username || !token) return false;
  if (username.toLowerCase() !== "ryo") return false;
  
  const authResult = await validateAuth(redis, username, token, { allowExpired: false });
  return authResult.valid;
}

// ============================================================================
// Rate Limit Configurations
// ============================================================================

export interface RateLimitConfig {
  prefix: string;
  windowSeconds: number;
  limit: number;
  byIp?: boolean;
}

export const RATE_LIMITS = {
  /** Burst protection: 10 requests per minute */
  burst: (prefix: string): RateLimitConfig => ({
    prefix: `${prefix}:burst`,
    windowSeconds: 60,
    limit: 10,
    byIp: true,
  }),
  
  /** Daily limit: 100 requests per day */
  daily: (prefix: string, limit = 100): RateLimitConfig => ({
    prefix: `${prefix}:daily`,
    windowSeconds: 86400,
    limit,
    byIp: true,
  }),
  
  /** Hourly limit for authenticated users */
  hourly: (prefix: string, limit = 60): RateLimitConfig => ({
    prefix: `${prefix}:hourly`,
    windowSeconds: 3600,
    limit,
    byIp: false,
  }),
  
  /** 5-hour budget (like AI chat) */
  budget5h: (prefix: string, limit = 15): RateLimitConfig => ({
    prefix: `${prefix}:5h`,
    windowSeconds: 5 * 3600,
    limit,
    byIp: false,
  }),
};

// ============================================================================
// Request Helpers
// ============================================================================

/**
 * Parse JSON body safely (Vercel parses automatically)
 */
export function parseJsonBody<T = Record<string, unknown>>(
  req: VercelRequest
): { data: T | null; error: string | null } {
  try {
    const contentType = getHeader(req, "content-type") || "";
    if (!contentType.includes("application/json")) {
      return { data: null, error: "Content-Type must be application/json" };
    }
    return { data: req.body as T, error: null };
  } catch {
    return { data: null, error: "Invalid JSON body" };
  }
}

/**
 * Get a single query parameter
 */
export function getQueryParam(req: VercelRequest, name: string): string | null {
  const value = req.query[name];
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 10);
}

// ============================================================================
// Request Context
// ============================================================================

export interface RequestContext {
  requestId: string;
  origin: string | null;
  originAllowed: boolean;
  ip: string;
  user: AuthenticatedUser | null;
  redis: ReturnType<typeof createRedis>;
  log: (message: string, data?: unknown) => void;
  logError: (message: string, error?: unknown) => void;
}

/**
 * Create a request context from a request
 */
export async function createRequestContext(
  req: VercelRequest,
  options: {
    requireAuth?: boolean;
    allowExpired?: boolean;
  } = {}
): Promise<RequestContext> {
  const { requireAuth = false, allowExpired = true } = options;
  
  const requestId = generateRequestId();
  const origin = getEffectiveOrigin(req);
  const originAllowed = isAllowedOrigin(origin);
  const ip = RateLimit.getClientIp(req);
  const redis = createRedis();
  
  const log = (message: string, data?: unknown) => {
    console.log(`[${requestId}] ${message}`, data ?? "");
  };
  const logError = (message: string, error?: unknown) => {
    console.error(`[${requestId}] ERROR: ${message}`, error ?? "");
  };
  
  let user: AuthenticatedUser | null = null;
  if (requireAuth || getHeader(req, "authorization")) {
    const { username, token } = extractAuth(req);
    if (username && token) {
      const result = await validateAuth(redis, username, token, { allowExpired });
      if (result.valid) {
        user = { username: username.toLowerCase(), token, expired: result.expired };
      }
    }
  }
  
  return {
    requestId,
    origin,
    originAllowed,
    ip,
    user,
    redis,
    log,
    logError,
  };
}
