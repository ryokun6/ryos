/**
 * Middleware utilities for API endpoints (Node.js runtime only)
 * 
 * Re-exports commonly used utilities for convenience.
 */

import type { Redis } from "@upstash/redis";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { extractAuth, extractAuthNormalized, validateAuth } from "./auth/index.js";
import type { AuthenticatedUser } from "./auth/index.js";
import type { ValidateAuthOptions } from "./auth/index.js";
import {
  getEffectiveOrigin,
  handlePreflight,
  isAllowedOrigin,
  setCorsHeaders,
} from "./_cors.js";
import type { SetCorsHeadersOptions } from "./_cors.js";
import { createLogger } from "./_logging.js";
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

export interface ApiResponseHelpers {
  readonly sent: boolean;
  json: (
    data: unknown,
    status?: number,
    headers?: Record<string, string>
  ) => VercelResponse;
  ok: (data: unknown, headers?: Record<string, string>) => VercelResponse;
  error: (
    message: string,
    status?: number,
    extra?: Record<string, unknown>,
    headers?: Record<string, string>
  ) => VercelResponse;
  badRequest: (message?: string) => VercelResponse;
  unauthorized: (message?: string) => VercelResponse;
  forbidden: (message?: string) => VercelResponse;
  methodNotAllowed: () => VercelResponse;
}

export interface AuthRequireOptions extends ValidateAuthOptions {
  missingMessage?: string;
  invalidMessage?: string;
  missingStatus?: number;
  invalidStatus?: number;
}

export interface AuthRequireAdminOptions extends AuthRequireOptions {
  forbiddenMessage?: string;
  forbiddenStatus?: number;
}

export interface ApiRateLimitOptions {
  key?: string;
  keyParts?: Array<string | number | null | undefined>;
  windowSeconds: number;
  limit: number;
}

export type ApiRateLimitResult = Awaited<
  ReturnType<typeof RateLimit.checkCounterLimit>
>;

export interface ApiHandlerContext extends RequestContext {
  req: VercelRequest;
  res: VercelResponse;
  method: string;
  startedAt: number;
  logger: ReturnType<typeof createLogger>;
  response: ApiResponseHelpers;
  auth: {
    extract: () => { username: string | null; token: string | null };
    validate: (
      username: string | null | undefined,
      token: string | null | undefined,
      options?: ValidateAuthOptions
    ) => ReturnType<typeof validateAuth>;
    require: (options?: AuthRequireOptions) => Promise<AuthenticatedUser | null>;
    requireAdmin: (
      options?: AuthRequireAdminOptions
    ) => Promise<AuthenticatedUser | null>;
  };
  rateLimit: {
    check: (options: ApiRateLimitOptions) => Promise<ApiRateLimitResult>;
  };
}

export interface ApiHandlerOptions {
  methods: string[];
  action?: string | null;
  cors?: SetCorsHeadersOptions;
  enforceOriginCheck?: boolean;
}

function createResponseHelpers(
  res: VercelResponse,
  logger: ReturnType<typeof createLogger>,
  startedAt: number
): ApiResponseHelpers {
  let sent = false;

  const json = (
    data: unknown,
    status = 200,
    headers: Record<string, string> = {}
  ): VercelResponse => {
    if (sent || res.headersSent) return res;
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }
    logger.response(status, Date.now() - startedAt);
    sent = true;
    return res.status(status).json(data);
  };

  return {
    get sent() {
      return sent || res.headersSent;
    },
    json,
    ok: (data, headers = {}) => json(data, 200, headers),
    error: (message, status = 400, extra = {}, headers = {}) =>
      json({ error: message, ...extra }, status, headers),
    badRequest: (message = "Bad request") => json({ error: message }, 400),
    unauthorized: (message = "Unauthorized") => json({ error: message }, 401),
    forbidden: (message = "Forbidden") => json({ error: message }, 403),
    methodNotAllowed: () => json({ error: "Method not allowed" }, 405),
  };
}

function resolveRateLimitKey(options: ApiRateLimitOptions): string {
  if (options.key && options.key.length > 0) return options.key;
  if (options.keyParts && options.keyParts.length > 0) {
    return RateLimit.makeKey(
      options.keyParts.map((part) =>
        part === null || part === undefined ? "" : String(part)
      )
    );
  }
  throw new Error("Rate limit key is required");
}

async function checkRateLimit(
  logger: ReturnType<typeof createLogger>,
  options: ApiRateLimitOptions
): Promise<ApiRateLimitResult> {
  const key = resolveRateLimitKey(options);
  const result = await RateLimit.checkCounterLimit({
    key,
    windowSeconds: options.windowSeconds,
    limit: options.limit,
  });

  if (!result.allowed) {
    logger.warn("Rate limit exceeded", {
      key,
      count: result.count,
      limit: result.limit,
      resetSeconds: result.resetSeconds,
    });
  }

  return result;
}

export function createApiHandler(
  options: ApiHandlerOptions,
  handler: (ctx: ApiHandlerContext) => Promise<void>
) {
  const methods = options.methods.map((method) => method.toUpperCase());
  const corsMethods = Array.from(new Set([...methods, "OPTIONS"]));
  const enforceOriginCheck = options.enforceOriginCheck !== false;

  return async function apiHandler(
    req: VercelRequest,
    res: VercelResponse
  ): Promise<void> {
    const startedAt = Date.now();
    const requestId = generateRequestId();
    const logger = createLogger(requestId);
    const method = (req.method || methods[0] || "GET").toUpperCase();
    const origin = getEffectiveOrigin(req);
    const originAllowed = isAllowedOrigin(origin);

    logger.request(method, req.url || "/api", options.action ?? null);

    if (handlePreflight(req, res, { ...options.cors, methods: corsMethods })) {
      logger.response(res.statusCode || 204, Date.now() - startedAt);
      return;
    }

    setCorsHeaders(res, origin, { ...options.cors, methods: corsMethods });

    if (enforceOriginCheck && !originAllowed) {
      logger.warn("Unauthorized origin", { origin });
      logger.response(403, Date.now() - startedAt);
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    if (!methods.includes(method)) {
      logger.warn("Method not allowed", { method });
      logger.response(405, Date.now() - startedAt);
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const redis = createRedis();
    const response = createResponseHelpers(res, logger, startedAt);

    const baseContext: RequestContext = {
      requestId,
      origin,
      originAllowed,
      ip: RateLimit.getClientIp(req),
      user: null,
      redis,
      log: (message, data) => logger.info(message, data),
      logError: (message, error) => logger.error(message, error),
    };

    const ctx = {
      ...baseContext,
      req,
      res,
      method,
      startedAt,
      logger,
      response,
      auth: {
        extract: () => extractAuthNormalized(req),
        validate: (
          username: string | null | undefined,
          token: string | null | undefined,
          validateOptions: ValidateAuthOptions = {}
        ) => validateAuth(redis, username, token, validateOptions),
        require: async (requireOptions: AuthRequireOptions = {}) => {
          const {
            allowExpired = false,
            refreshOnGrace = false,
            missingMessage = "Unauthorized - missing credentials",
            invalidMessage = "Unauthorized - invalid token",
            missingStatus = 401,
            invalidStatus = 401,
          } = requireOptions;

          const { username, token } = extractAuthNormalized(req);

          if (!username || !token) {
            response.error(missingMessage, missingStatus);
            return null;
          }

          const authResult = await validateAuth(redis, username, token, {
            allowExpired,
            refreshOnGrace,
          });

          if (!authResult.valid) {
            response.error(invalidMessage, invalidStatus);
            return null;
          }

          const user: AuthenticatedUser = {
            username: username.toLowerCase(),
            token,
            expired: authResult.expired,
          };

          ctx.user = user;
          return user;
        },
        requireAdmin: async (requireOptions: AuthRequireAdminOptions = {}) => {
          const {
            forbiddenMessage = "Forbidden - admin access required",
            forbiddenStatus = 403,
          } = requireOptions;

          const user = await ctx.auth.require(requireOptions);
          if (!user) return null;

          if (user.username.toLowerCase() !== "ryo") {
            response.error(forbiddenMessage, forbiddenStatus);
            return null;
          }

          return user;
        },
      },
      rateLimit: {
        check: (rateLimitOptions: ApiRateLimitOptions) =>
          checkRateLimit(logger, rateLimitOptions),
      },
    } satisfies ApiHandlerContext;

    try {
      await handler(ctx);
    } catch (error) {
      logger.error("Unhandled API error", error);
      if (!response.sent && !res.headersSent) {
        response.error("Internal server error", 500);
      }
    }
  };
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
