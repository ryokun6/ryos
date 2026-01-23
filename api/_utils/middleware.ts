/**
 * Middleware utilities for API endpoints
 * 
 * Provides reusable middleware for auth, rate limiting, and response handling.
 * This module consolidates common patterns used across all API endpoints.
 */

import type { Redis } from "@upstash/redis";
import { extractAuth, validateAuth, validateAdminAuth } from "./auth/index.js";
import type { AuthenticatedUser } from "./auth/index.js";
import { getEffectiveOrigin, isAllowedOrigin, preflightIfNeeded } from "./_cors.js";
import * as RateLimit from "./_rate-limit.js";
import { createRedis } from "./redis.js";

// Re-export commonly used utilities for convenience
export { createRedis } from "./redis.js";
export { getClientIp, getClientIpFromVercel } from "./_rate-limit.js";
export { 
  getEffectiveOrigin, 
  isAllowedOrigin, 
  preflightIfNeeded,
  // Node.js runtime helpers
  getEffectiveOriginNode,
  setCorsHeadersNode,
  handlePreflightNode,
  getClientIpNode,
} from "./_cors.js";
export { extractAuth, extractAuthNormalized } from "./auth/index.js";
export type { AuthenticatedUser } from "./auth/index.js";

// Re-export constants
export {
  REDIS_PREFIXES,
  TTL,
  RATE_LIMIT_TIERS,
  PASSWORD,
  VALIDATION,
  TOKEN,
} from "./constants.js";

// ============================================================================
// Response Helpers
// ============================================================================

/**
 * Create a JSON response with optional CORS headers and additional headers
 */
export function jsonResponse(
  data: unknown,
  status = 200,
  origin?: string | null,
  extraHeaders?: Record<string, string>
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return new Response(JSON.stringify(data), { status, headers });
}

/**
 * Create an error response with optional error code
 */
export function errorResponse(
  message: string,
  status = 400,
  origin?: string | null,
  code?: string,
  details?: unknown
): Response {
  const data: Record<string, unknown> = { error: message };
  if (code) data.code = code;
  if (details !== undefined) data.details = details;
  return jsonResponse(data, status, origin);
}

/**
 * Create a success response
 */
export function successResponse(
  data: Record<string, unknown> = {},
  status = 200,
  origin?: string | null
): Response {
  return jsonResponse({ success: true, ...data }, status, origin);
}

/**
 * Create a rate limit exceeded response
 */
export function rateLimitResponse(
  origin: string | null,
  limit: number,
  resetSeconds: number,
  scope?: string
): Response {
  const data: Record<string, unknown> = {
    error: "rate_limit_exceeded",
    limit,
    retryAfter: resetSeconds,
  };
  if (scope) data.scope = scope;
  
  return jsonResponse(data, 429, origin, {
    "Retry-After": String(resetSeconds),
  });
}

// ============================================================================
// CORS Middleware
// ============================================================================

export interface CorsResult {
  origin: string | null;
  allowed: boolean;
  preflight?: Response;
}

/**
 * Handle CORS for a request
 */
export function handleCors(
  req: Request,
  allowedMethods: string[] = ["GET", "POST", "DELETE", "OPTIONS"]
): CorsResult {
  const origin = getEffectiveOrigin(req);
  
  // Check if it's a preflight request
  if (req.method === "OPTIONS") {
    const preflight = preflightIfNeeded(req, allowedMethods, origin);
    if (preflight) {
      return { origin, allowed: true, preflight };
    }
  }
  
  const allowed = isAllowedOrigin(origin);
  return { origin, allowed };
}

// ============================================================================
// Auth Middleware
// ============================================================================

export interface AuthResult {
  user: AuthenticatedUser | null;
  error: Response | null;
}

export interface AdminAuthResult extends AuthResult {
  isAdmin: boolean;
}

/**
 * Require authentication - returns error if not authenticated
 */
export async function requireAuth(
  req: Request,
  redis: Redis,
  origin?: string | null
): Promise<AuthResult> {
  const { username, token } = extractAuth(req);
  
  if (!username || !token) {
    return {
      user: null,
      error: errorResponse("Unauthorized - missing credentials", 401, origin),
    };
  }

  const result = await validateAuth(redis, username, token, { allowExpired: true });
  
  if (!result.valid) {
    return {
      user: null,
      error: errorResponse("Unauthorized - invalid token", 401, origin),
    };
  }

  return {
    user: { username: username.toLowerCase(), token, expired: result.expired },
    error: null,
  };
}

/**
 * Optional authentication - returns user if authenticated, null otherwise
 */
export async function optionalAuth(
  req: Request,
  redis: Redis
): Promise<AuthenticatedUser | null> {
  const { username, token } = extractAuth(req);
  
  if (!username || !token) {
    return null;
  }

  const result = await validateAuth(redis, username, token, { allowExpired: true });
  
  if (!result.valid) {
    return null;
  }

  return { username: username.toLowerCase(), token, expired: result.expired };
}

/**
 * Require admin authentication
 */
export async function requireAdmin(
  req: Request,
  redis: Redis,
  origin?: string | null
): Promise<AdminAuthResult> {
  const { username, token } = extractAuth(req);
  
  if (!username || !token) {
    return {
      user: null,
      isAdmin: false,
      error: errorResponse("Unauthorized - missing credentials", 401, origin),
    };
  }

  const result = await validateAdminAuth(redis, username, token);
  
  if (!result.valid) {
    return {
      user: null,
      isAdmin: false,
      error: errorResponse("Unauthorized - invalid token", 401, origin),
    };
  }

  if (!result.isAdmin) {
    return {
      user: { username: username.toLowerCase(), token, expired: result.expired },
      isAdmin: false,
      error: errorResponse("Forbidden - admin access required", 403, origin),
    };
  }

  return {
    user: { username: username.toLowerCase(), token, expired: result.expired },
    isAdmin: true,
    error: null,
  };
}

/**
 * Check if a user is admin (ryo) with a valid token
 * Standalone helper for simple admin checks without full middleware pipeline
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
// Rate Limit Middleware
// ============================================================================

export interface RateLimitConfig {
  /** Key prefix for this rate limit */
  prefix: string;
  /** Window in seconds */
  windowSeconds: number;
  /** Max requests in window */
  limit: number;
  /** Use IP-based limiting (default: true if no user) */
  byIp?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  error?: Response;
  count?: number;
  limit?: number;
  remaining?: number;
  resetSeconds?: number;
}

/**
 * Check rate limit for a request
 */
export async function checkRateLimit(
  req: Request,
  config: RateLimitConfig,
  user?: AuthenticatedUser | null,
  origin?: string | null
): Promise<RateLimitResult> {
  const ip = RateLimit.getClientIp(req);
  const identifier = user?.username || `ip:${ip}`;
  
  const key = RateLimit.makeKey([
    "rl",
    config.prefix,
    config.byIp !== false && !user ? "ip" : "user",
    user?.username || ip,
  ]);

  const result = await RateLimit.checkCounterLimit({
    key,
    windowSeconds: config.windowSeconds,
    limit: config.limit,
  });

  if (!result.allowed) {
    const error = new Response(
      JSON.stringify({
        error: "rate_limit_exceeded",
        limit: result.limit,
        windowSeconds: result.windowSeconds,
        resetSeconds: result.resetSeconds,
        identifier,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(result.resetSeconds ?? config.windowSeconds),
          ...(origin && { "Access-Control-Allow-Origin": origin }),
        },
      }
    );

    return {
      allowed: false,
      error,
      count: result.count,
      limit: result.limit,
      remaining: result.remaining,
      resetSeconds: result.resetSeconds,
    };
  }

  return {
    allowed: true,
    count: result.count,
    limit: result.limit,
    remaining: result.remaining,
    resetSeconds: result.resetSeconds,
  };
}

// ============================================================================
// Common Rate Limit Configurations
// ============================================================================

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
 * Parse JSON body safely
 */
export async function parseJsonBody<T = Record<string, unknown>>(
  req: Request
): Promise<{ data: T | null; error: string | null }> {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return { data: null, error: "Content-Type must be application/json" };
    }
    const data = await req.json();
    return { data: data as T, error: null };
  } catch {
    return { data: null, error: "Invalid JSON body" };
  }
}

/**
 * Get query parameters as object
 */
export function getQueryParams(req: Request): URLSearchParams {
  const url = new URL(req.url);
  return url.searchParams;
}

/**
 * Get a single query parameter
 */
export function getQueryParam(req: Request, name: string): string | null {
  const url = new URL(req.url);
  return url.searchParams.get(name);
}

// ============================================================================
// Request Context
// ============================================================================

/**
 * Request context containing common data extracted from a request
 */
export interface RequestContext {
  /** Unique request ID for logging */
  requestId: string;
  /** Effective origin from request */
  origin: string | null;
  /** Whether origin is allowed */
  originAllowed: boolean;
  /** Client IP address */
  ip: string;
  /** Authenticated user (if any) */
  user: AuthenticatedUser | null;
  /** Redis client */
  redis: ReturnType<typeof createRedis>;
  /** Log helper with request ID prefix */
  log: (message: string, data?: unknown) => void;
  /** Error log helper with request ID prefix */
  logError: (message: string, error?: unknown) => void;
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Create a request context from a request
 * 
 * This extracts common data from a request and provides helpers for logging.
 * Use this to reduce boilerplate in handlers.
 * 
 * @example
 * ```ts
 * export default async function handler(req: Request) {
 *   const ctx = await createRequestContext(req);
 *   if (!ctx.originAllowed) {
 *     return errorResponse("Unauthorized", 403, ctx.origin);
 *   }
 *   ctx.log("Processing request");
 *   // ... handler logic
 * }
 * ```
 */
export async function createRequestContext(
  req: Request,
  options: {
    /** Whether to validate auth (default: false) */
    requireAuth?: boolean;
    /** Whether to allow expired tokens (default: true) */
    allowExpired?: boolean;
  } = {}
): Promise<RequestContext> {
  const { requireAuth = false, allowExpired = true } = options;
  
  const requestId = generateRequestId();
  const origin = getEffectiveOrigin(req);
  const originAllowed = isAllowedOrigin(origin);
  const ip = RateLimit.getClientIp(req);
  const redis = createRedis();
  
  // Create logging helpers
  const log = (message: string, data?: unknown) => {
    console.log(`[${requestId}] ${message}`, data ?? "");
  };
  const logError = (message: string, error?: unknown) => {
    console.error(`[${requestId}] ERROR: ${message}`, error ?? "");
  };
  
  // Extract and validate auth if needed
  let user: AuthenticatedUser | null = null;
  if (requireAuth || req.headers.get("authorization")) {
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
