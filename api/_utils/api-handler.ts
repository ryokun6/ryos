import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Redis } from "@upstash/redis";
import { initLogger } from "./_logging.js";
import { getEffectiveOrigin, isAllowedOrigin, setCorsHeaders } from "./_cors.js";
import { createRedis } from "./redis.js";
import { resolveRequestAuth, type AuthenticatedRequestUser } from "./request-auth.js";

type AuthMode = "none" | "optional" | "required";

export interface ApiHandlerOptions {
  methods: string[];
  auth?: AuthMode;
  allowExpiredAuth?: boolean;
  parseJsonBody?: boolean;
  contentType?: string | null;
}

export interface ApiHandlerContext<TBody = unknown> {
  req: VercelRequest;
  res: VercelResponse;
  redis: Redis;
  logger: ReturnType<typeof initLogger>["logger"];
  startTime: number;
  origin: string | null;
  user: AuthenticatedRequestUser | null;
  body: TBody | null;
}

type WrappedApiHandler<TBody = unknown> = (
  context: ApiHandlerContext<TBody>
) => Promise<void | VercelResponse>;

function sendJsonError(
  res: VercelResponse,
  status: number,
  error: string
): void {
  res.status(status).json({ error });
}

export function apiHandler<TBody = unknown>(
  options: ApiHandlerOptions,
  handler: WrappedApiHandler<TBody>
): (req: VercelRequest, res: VercelResponse) => Promise<void> {
  const {
    methods,
    auth = "none",
    allowExpiredAuth = false,
    parseJsonBody = false,
    contentType = "application/json",
  } = options;

  return async (req: VercelRequest, res: VercelResponse): Promise<void> => {
    const { logger } = initLogger();
    const startTime = Date.now();
    const origin = getEffectiveOrigin(req);
    const method = (req.method || "GET").toUpperCase();

    logger.request(method, req.url || "/api/unknown");

    if (method === "OPTIONS") {
      setCorsHeaders(res, origin, { methods: [...methods, "OPTIONS"] });
      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }
      logger.response(204, Date.now() - startTime);
      res.status(204).end();
      return;
    }

    setCorsHeaders(res, origin, { methods: [...methods, "OPTIONS"] });
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    if (!isAllowedOrigin(origin)) {
      logger.response(403, Date.now() - startTime);
      sendJsonError(res, 403, "Unauthorized");
      return;
    }

    if (!methods.includes(method)) {
      logger.response(405, Date.now() - startTime);
      sendJsonError(res, 405, "Method not allowed");
      return;
    }

    const redis = createRedis();

    let body: TBody | null = null;
    if (parseJsonBody) {
      try {
        body = (req.body as TBody | undefined) ?? null;
      } catch {
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

      if (authResult.error) {
        logger.response(authResult.error.status, Date.now() - startTime);
        sendJsonError(res, authResult.error.status, authResult.error.error);
        return;
      }

      user = authResult.user;
    }

    try {
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
    } catch (error) {
      logger.error("Unhandled API handler error", error);
      logger.response(500, Date.now() - startTime);
      sendJsonError(res, 500, "Internal Server Error");
    }
  };
}

