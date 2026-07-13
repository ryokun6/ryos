import type { ApiRequest, ApiResponse } from "./api-types.js";
import type { Redis } from "./redis.js";
import { initLogger } from "./_logging.js";
import { getEffectiveOrigin, isAllowedOrigin, setCorsHeaders } from "./_cors.js";
import { createRedis, getRedisBackend } from "./redis.js";
import { resolveRequestAuth, type AuthenticatedRequestUser } from "./request-auth.js";
import { recordAnalyticsEvent } from "./_analytics.js";
import { getClientIp } from "./_rate-limit.js";
import { getHeader } from "./request-helpers.js";
import { updateStoredUserTimeZone } from "./auth/_user-record.js";

type AuthMode = "none" | "optional" | "required" | "admin";

/**
 * Minimal structural contract for a request-body validator. A Zod schema
 * (`z.object(...)`) satisfies this directly, so callers can pass a Zod schema
 * without `api-handler` taking a hard dependency on Zod's types. The output
 * type `TBody` is inferred from the schema.
 */
export interface ApiBodyParseResult<TBody> {
  success: boolean;
  data?: TBody;
  error?: {
    issues: ReadonlyArray<{
      path: ReadonlyArray<PropertyKey>;
      message: string;
    }>;
  };
}

export interface ApiBodySchema<TBody> {
  safeParse(data: unknown): ApiBodyParseResult<TBody>;
}

export interface ApiHandlerOptions<TBody = unknown> {
  methods: string[];
  auth?: AuthMode;
  allowExpiredAuth?: boolean;
  parseJsonBody?: boolean;
  contentType?: string | null;
  analytics?: boolean;
  /**
   * Allow requests with no Origin/Referer (native clients such as KOReader).
   * When false (default), a missing origin is rejected like a disallowed one.
   */
  allowMissingOrigin?: boolean;
  /** Extra CORS request headers beyond the defaults (Authorization, etc.). */
  corsHeaders?: string[];
  /**
   * Optional schema validating the parsed JSON request body. When provided,
   * the body is read and validated at the handler boundary: on failure the
   * request is rejected with `400 { error: "validation_error", issues }`
   * before the handler runs; on success `context.body` is the parsed,
   * typed value. Implies `parseJsonBody`.
   */
  bodySchema?: ApiBodySchema<TBody>;
}

export interface ApiHandlerContext<TBody = unknown> {
  req: ApiRequest;
  res: ApiResponse;
  redis: Redis;
  logger: ReturnType<typeof initLogger>["logger"];
  startTime: number;
  origin: string | null;
  user: AuthenticatedRequestUser | null;
  body: TBody | null;
}

type WrappedApiHandler<TBody = unknown> = (
  context: ApiHandlerContext<TBody>
) => Promise<void | ApiResponse>;

function sendJsonError(
  res: ApiResponse,
  status: number,
  error: string
): void {
  res.status(status).json({ error });
}

function getRequestPath(url: string | undefined): string {
  if (!url) return "/api/unknown";
  try {
    return new URL(url, "http://localhost").pathname;
  } catch {
    return url.split("?")[0] || "/api/unknown";
  }
}

function describeBodyShape(body: unknown): Record<string, unknown> {
  if (body === null) {
    return { kind: "null" };
  }
  if (body === undefined) {
    return { kind: "undefined" };
  }
  if (Array.isArray(body)) {
    return { kind: "array", length: body.length };
  }
  if (typeof body === "object") {
    return {
      kind: "object",
      keys: Object.keys(body as Record<string, unknown>).sort(),
    };
  }
  return { kind: typeof body };
}

export function apiHandler<TBody = unknown>(
  options: ApiHandlerOptions<TBody>,
  handler: WrappedApiHandler<TBody>
): (req: ApiRequest, res: ApiResponse) => Promise<void> {
  const {
    methods,
    auth = "none",
    allowExpiredAuth = false,
    parseJsonBody = false,
    contentType = "application/json",
    analytics = true,
    allowMissingOrigin = false,
    corsHeaders,
    bodySchema,
  } = options;
  const shouldReadBody = parseJsonBody || !!bodySchema;
  const corsHeaderList = corsHeaders;

  return async (req: ApiRequest, res: ApiResponse): Promise<void> => {
    const { logger } = initLogger();
    const startTime = Date.now();
    const origin = getEffectiveOrigin(req);
    const method = (req.method || "GET").toUpperCase();
    const path = getRequestPath(req.url);

    logger.request(method, req.url || "/api/unknown");
    logger.debug("API handler request context", {
      path,
      method,
      allowedMethods: methods,
      auth,
      allowExpiredAuth,
      shouldReadBody,
      hasBodySchema: !!bodySchema,
      contentType,
      analytics,
      allowMissingOrigin,
      hasOrigin: !!origin,
      redisBackend: getRedisBackend(),
    });

    const corsOptions = {
      methods: [...methods, "OPTIONS"],
      ...(corsHeaderList ? { headers: corsHeaderList } : {}),
    };

    if (method === "OPTIONS") {
      setCorsHeaders(res, origin, corsOptions);
      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }
      logger.debug("Handled API preflight", { path, originAllowed: isAllowedOrigin(origin) });
      logger.response(204, Date.now() - startTime);
      res.status(204).end();
      return;
    }

    setCorsHeaders(res, origin, corsOptions);
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    const originMissing = !origin;
    const originOk =
      (originMissing && allowMissingOrigin) || isAllowedOrigin(origin);
    if (!originOk) {
      logger.debug("Rejected API request origin", { path, hasOrigin: !!origin });
      logger.response(403, Date.now() - startTime);
      sendJsonError(res, 403, "Unauthorized");
      return;
    }

    if (!methods.includes(method)) {
      logger.debug("Rejected API request method", { path, method, allowedMethods: methods });
      logger.response(405, Date.now() - startTime);
      sendJsonError(res, 405, "Method not allowed");
      return;
    }

    const redis = createRedis();

    let body: TBody | null = null;
    if (shouldReadBody) {
      try {
        body = (req.body as TBody | undefined) ?? null;
        logger.debug("Parsed API request body", {
          path,
          bodyShape: describeBodyShape(body),
        });
      } catch {
        logger.debug("Failed to parse API request body", { path });
        logger.response(400, Date.now() - startTime);
        sendJsonError(res, 400, "Invalid JSON body");
        return;
      }
    }

    let user: AuthenticatedRequestUser | null = null;
    if (auth !== "none") {
      const authResult = await resolveRequestAuth(req, redis, {
        required: auth === "required",
        allowExpired: allowExpiredAuth,
      });
      logger.debug("Resolved API auth", {
        path,
        auth,
        hasUser: !!authResult.user,
        username: authResult.user?.username,
        errorStatus: authResult.error?.status,
      });

      if (auth === "admin") {
        if (authResult.error || !authResult.user || authResult.user.username !== "ryo") {
          logger.debug("Rejected API admin auth", {
            path,
            hasUser: !!authResult.user,
            username: authResult.user?.username,
            errorStatus: authResult.error?.status,
          });
          logger.response(403, Date.now() - startTime);
          sendJsonError(res, 403, "Forbidden - Admin access required");
          return;
        }

        user = authResult.user;
      } else if (authResult.error) {
        logger.debug("Rejected API auth", {
          path,
          auth,
          status: authResult.error.status,
        });
        logger.response(authResult.error.status, Date.now() - startTime);
        sendJsonError(res, authResult.error.status, authResult.error.error);
        return;
      } else {
        user = authResult.user;
      }

      if (user) {
        const timeZoneHeader = getHeader(req, "x-user-timezone");
        if (timeZoneHeader) {
          // Best-effort side effect — don't block the response on a Redis write.
          void updateStoredUserTimeZone(redis, user.username, timeZoneHeader).catch(
            (error) => {
              logger.warn("Failed to update user timezone from request header", {
                username: user?.username,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          );
        }
      }
    }

    // Validate the request body after auth so unauthorized callers can't
    // probe body requirements (and get a consistent 401/403 first).
    if (bodySchema) {
      const result = bodySchema.safeParse(body);
      if (!result.success) {
        const issues = (result.error?.issues ?? []).map((issue) => ({
          path: issue.path.map((part) => String(part)).join("."),
          message: issue.message,
        }));
        logger.debug("Rejected API body validation", {
          path,
          issueCount: issues.length,
          issuePaths: issues.map((issue) => issue.path),
        });
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "validation_error", issues });
        return;
      }
      body = result.data as TBody;
      logger.debug("Validated API request body", {
        path,
        bodyShape: describeBodyShape(body),
      });
    }

    let finalStatus = 200;
    try {
      logger.debug("Starting API route handler", { path });
      await handler({
        req,
        res,
        redis,
        logger,
        startTime,
        origin,
        user,
        body,
      });
      finalStatus = res.statusCode ?? 200;
      logger.debug("Completed API route handler", {
        path,
        status: finalStatus,
        durationMs: Date.now() - startTime,
        headersSent: res.headersSent,
      });
    } catch (error) {
      logger.error("Unhandled API handler error", error);
      logger.response(500, Date.now() - startTime);
      sendJsonError(res, 500, "Internal Server Error");
      finalStatus = 500;
    }

    if (analytics) {
      logger.debug("Queued API analytics event", {
        path,
        method,
        status: finalStatus,
        hasUser: !!user,
        durationMs: Date.now() - startTime,
      });
      recordAnalyticsEvent(redis, {
        path: req.url || "/api/unknown",
        method,
        status: finalStatus,
        latencyMs: Date.now() - startTime,
        ip: getClientIp(req),
        username: user?.username,
      });
    }
  };
}

