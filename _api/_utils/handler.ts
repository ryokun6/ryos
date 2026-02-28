import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { AuthenticatedUser } from "./auth/index.js";
import { validateAuth } from "./auth/index.js";
import { handlePreflight, setCorsHeaders } from "./_cors.js";
import { initLogger } from "./_logging.js";
import { checkCounterLimit, type CounterLimitResult } from "./_rate-limit.js";
import {
  createRequestContext,
  getQueryParam,
  parseJsonBody,
  type RateLimitConfig,
  type RequestContext,
} from "./middleware.js";
import { createResponseHelpers, type ApiResponseHelpers } from "./response.js";

type HttpMethod =
  | "DELETE"
  | "GET"
  | "HEAD"
  | "PATCH"
  | "POST"
  | "PUT";

interface AuthenticateOptions {
  allowExpired?: boolean;
}

export interface RequireAuthOptions extends AuthenticateOptions {
  requireAdmin?: boolean;
  missingMessage?: string;
  invalidMessage?: string;
  forbiddenMessage?: string;
  missingStatus?: number;
  invalidStatus?: number;
  forbiddenStatus?: number;
}

type RateLimitScope = "custom" | "ip" | "user";

type RateLimitIdentifier =
  | string
  | ((ctx: ApiContext) => string | null | undefined);

export interface ApiRateLimitConfig extends RateLimitConfig {
  key?: string;
  by?: RateLimitScope;
  identifier?: RateLimitIdentifier;
  headers?: boolean;
  message?: string;
  extras?: Record<string, unknown>;
  onExceeded?: (ctx: ApiContext, result: CounterLimitResult) => Promise<void> | void;
}

export interface ApiHandlerOptions {
  operation?: string;
  methods?: HttpMethod[];
  requireOrigin?: boolean;
  contentType?: string | false;
  cors?: {
    methods?: string[];
    headers?: string[];
    credentials?: boolean;
    maxAge?: number;
  };
}

export interface ApiContext extends RequestContext {
  req: VercelRequest;
  res: VercelResponse;
  method: string;
  url: string;
  startTime: number;
  response: ApiResponseHelpers;
  parseJsonBody: <T = Record<string, unknown>>() => {
    data: T | null;
    error: string | null;
  };
  getQueryParam: (name: string) => string | null;
  validateCredentials: (
    username: string | null | undefined,
    token: string | null | undefined,
    options?: AuthenticateOptions
  ) => Promise<AuthenticatedUser | null>;
  authenticate: (options?: AuthenticateOptions) => Promise<AuthenticatedUser | null>;
  requireAuth: (options?: RequireAuthOptions) => Promise<AuthenticatedUser | null>;
  applyRateLimit: (config: ApiRateLimitConfig) => Promise<CounterLimitResult | null>;
}

type RouteHandler = (
  req: VercelRequest,
  res: VercelResponse,
  ctx: ApiContext
) => Promise<void> | void;

function withOptions(methods?: HttpMethod[]): string[] | undefined {
  if (!methods || methods.length === 0) {
    return undefined;
  }
  return [...new Set([...methods, "OPTIONS"])];
}

function buildRateLimitKey(prefix: string, scope: RateLimitScope, identifier: string): string {
  return `rl:${prefix}:${scope}:${encodeURIComponent(identifier)}`;
}

function resolveIdentifier(
  ctx: ApiContext,
  config: ApiRateLimitConfig,
  scope: RateLimitScope
): string | null {
  if (typeof config.identifier === "function") {
    return config.identifier(ctx) ?? null;
  }

  if (typeof config.identifier === "string" && config.identifier.length > 0) {
    return config.identifier;
  }

  if (scope === "ip") {
    return ctx.ip;
  }

  if (scope === "user") {
    return ctx.user?.username ?? ctx.auth.username;
  }

  return null;
}

function sendStatus(
  ctx: ApiContext,
  status: number,
  message: string,
  extras?: Record<string, unknown>
): VercelResponse {
  switch (status) {
    case 400:
      return ctx.response.badRequest(message, extras);
    case 401:
      return ctx.response.unauthorized(message, extras);
    case 403:
      return ctx.response.forbidden(message, extras);
    case 404:
      return ctx.response.notFound(message, extras);
    case 405:
      return ctx.response.methodNotAllowed();
    case 409:
      return ctx.response.conflict(message, extras);
    case 429:
      return ctx.response.tooManyRequests(message, extras);
    default:
      return ctx.response.error(status, message, extras);
  }
}

export function createApiHandler(
  options: ApiHandlerOptions,
  routeHandler: RouteHandler
): (req: VercelRequest, res: VercelResponse) => Promise<void> {
  return async function apiHandler(req: VercelRequest, res: VercelResponse): Promise<void> {
    const { requestId, logger } = initLogger();
    const method = (req.method || "GET").toUpperCase();
    const url = req.url || "/";
    const startTime = Date.now();

    logger.request(method, url, options.operation ?? null);
    res.once("finish", () => {
      logger.response(res.statusCode, Date.now() - startTime);
    });

    try {
      const baseContext = await createRequestContext(req, { requestId, logger });
      const response = createResponseHelpers(res);
      const authCache = new Map<string, AuthenticatedUser | null>();
      const allowedMethods = withOptions(options.methods);
      const corsOptions = {
        ...options.cors,
        methods: allowedMethods ?? options.cors?.methods,
      };

      const ctx = {
        ...baseContext,
        req,
        res,
        method,
        url,
        startTime,
        response,
      } as ApiContext;

      ctx.parseJsonBody = <T = Record<string, unknown>>() => parseJsonBody<T>(req);
      ctx.getQueryParam = (name: string) => getQueryParam(req, name);
      ctx.validateCredentials = async (
        username: string | null | undefined,
        token: string | null | undefined,
        authOptions: AuthenticateOptions = {}
      ): Promise<AuthenticatedUser | null> => {
        if (!username || !token) {
          return null;
        }

        const authResult = await validateAuth(ctx.redis, username, token, {
          allowExpired: authOptions.allowExpired ?? false,
        });

        if (!authResult.valid) {
          return null;
        }

        return {
          username: username.toLowerCase(),
          token,
          expired: authResult.expired,
        };
      };

      ctx.authenticate = async (
        authOptions: AuthenticateOptions = {}
      ): Promise<AuthenticatedUser | null> => {
        const allowExpired = authOptions.allowExpired ?? false;
        const cacheKey = allowExpired ? "allow-expired" : "strict";
        if (authCache.has(cacheKey)) {
          const cached = authCache.get(cacheKey) ?? null;
          ctx.user = cached;
          return cached;
        }

        const user = await ctx.validateCredentials(
          ctx.auth.username,
          ctx.auth.token,
          { allowExpired }
        );

        if (!user) {
          authCache.set(cacheKey, null);
          ctx.user = null;
          return null;
        }

        authCache.set(cacheKey, user);
        ctx.user = user;
        return user;
      };

      ctx.requireAuth = async (
        authOptions: RequireAuthOptions = {}
      ): Promise<AuthenticatedUser | null> => {
        const {
          allowExpired = false,
          requireAdmin = false,
          missingMessage = "Unauthorized - missing credentials",
          invalidMessage = "Unauthorized - invalid token",
          forbiddenMessage = "Forbidden",
          missingStatus = 401,
          invalidStatus = 401,
          forbiddenStatus = 403,
        } = authOptions;

        const { username, token } = ctx.auth;
        if (!username || !token) {
          logger.warn("Missing auth credentials", {
            hasToken: Boolean(token),
            hasUsername: Boolean(username),
          });
          sendStatus(ctx, missingStatus, missingMessage);
          return null;
        }

        const user = await ctx.authenticate({ allowExpired });
        if (!user) {
          logger.warn("Invalid auth token", { username });
          sendStatus(ctx, invalidStatus, invalidMessage);
          return null;
        }

        if (requireAdmin && user.username !== "ryo") {
          logger.warn("Admin access denied", { username: user.username });
          sendStatus(ctx, forbiddenStatus, forbiddenMessage);
          return null;
        }

        return user;
      };

      ctx.applyRateLimit = async (
        config: ApiRateLimitConfig
      ): Promise<CounterLimitResult | null> => {
        const scope = config.by ?? (config.byIp ? "ip" : "user");
        const identifier = resolveIdentifier(ctx, config, scope);

        if (!config.key && !identifier) {
          logger.error("Rate limit is missing an identifier", {
            prefix: config.prefix,
            scope,
          });
          ctx.response.serverError("Internal server error");
          return null;
        }

        const key =
          config.key ??
          buildRateLimitKey(config.prefix, scope, identifier as string);

        const result = await checkCounterLimit({
          key,
          windowSeconds: config.windowSeconds,
          limit: config.limit,
        });

        if (config.headers !== false) {
          res.setHeader("X-RateLimit-Limit", String(result.limit));
          res.setHeader("X-RateLimit-Remaining", String(result.remaining));
          res.setHeader("X-RateLimit-Reset", String(result.resetSeconds));
        }

        if (result.allowed) {
          return result;
        }

        if (config.onExceeded) {
          try {
            await config.onExceeded(ctx, result);
          } catch (error) {
            logger.error("Rate limit onExceeded hook failed", error);
          }
        }

        logger.warn("Rate limit exceeded", {
          key,
          limit: result.limit,
          resetSeconds: result.resetSeconds,
        });
        ctx.response.tooManyRequests(
          config.message ?? "Too many requests",
          {
            ...config.extras,
            limit: result.limit,
            retryAfter: result.resetSeconds,
          }
        );
        return null;
      };

      if (handlePreflight(req, res, corsOptions)) {
        return;
      }

      setCorsHeaders(res, ctx.origin, corsOptions);

      if (options.contentType !== false && !res.hasHeader("Content-Type")) {
        res.setHeader("Content-Type", options.contentType ?? "application/json");
      }

      if (options.requireOrigin !== false && !ctx.originAllowed) {
        logger.warn("Unauthorized origin", { origin: ctx.origin });
        ctx.response.forbidden("Unauthorized");
        return;
      }

      if (options.methods && !options.methods.includes(method as HttpMethod)) {
        logger.warn("Method not allowed", {
          method,
          allowedMethods: options.methods,
        });
        ctx.response.methodNotAllowed(allowedMethods);
        return;
      }

      await routeHandler(req, res, ctx);
    } catch (error) {
      logger.error("Unhandled route error", error);
      if (!res.headersSent && !res.writableEnded) {
        const response = createResponseHelpers(res);
        response.serverError("Internal server error");
      }
    }
  };
}
