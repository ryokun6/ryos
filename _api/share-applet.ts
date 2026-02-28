import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import { getClientIp } from "./_utils/_rate-limit.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "./_utils/_cors.js";
import { initLogger } from "./_utils/_logging.js";
import { executeShareAppletCore } from "./cores/share-applet-core.js";

export const runtime = "nodejs";
export const maxDuration = 30;

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { requestId: _requestId, logger } = initLogger();
  const startTime = Date.now();
  const effectiveOrigin = getEffectiveOrigin(req);

  logger.request(req.method || "GET", req.url || "/api/share-applet", "share-applet");

  if (req.method === "OPTIONS") {
    res.setHeader("Content-Type", "application/json");
    setCorsHeaders(res, effectiveOrigin, { methods: ["GET", "POST", "DELETE", "PATCH", "OPTIONS"] });
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  if (!["GET", "POST", "DELETE", "PATCH"].includes(req.method || "")) {
    logger.response(405, Date.now() - startTime);
    res.status(405).send("Method not allowed");
    return;
  }

  res.setHeader("Content-Type", "application/json");
  setCorsHeaders(res, effectiveOrigin, { methods: ["GET", "POST", "DELETE", "PATCH", "OPTIONS"] });

  if (!isAllowedOrigin(effectiveOrigin)) {
    logger.warn("Unauthorized origin", { origin: effectiveOrigin });
    logger.response(403, Date.now() - startTime);
    res.status(403).send("Unauthorized");
    return;
  }

  const redis = createRedis();

  try {
    const result = await executeShareAppletCore({
      redis,
      method: req.method,
      query: req.query as Record<string, string | string[] | undefined>,
      body: req.body,
      authHeader: req.headers.authorization,
      usernameHeader: req.headers["x-username"] as string | undefined,
      effectiveOrigin,
      clientIp: getClientIp(req),
    });

    if (result.status === 200 && req.method === "GET" && req.query.list === "true") {
      const applets = (result.body as { applets?: unknown[] })?.applets || [];
      logger.info("Listed applets", { count: applets.length });
    } else if (result.status === 200 && req.method === "GET" && req.query.id) {
      logger.info("Retrieved applet", { id: req.query.id });
    } else if (result.status === 200 && req.method === "POST") {
      const body = result.body as { id?: string; updated?: boolean };
      logger.info("Saved applet", { id: body.id, isUpdate: body.updated });
    } else if (result.status === 200 && req.method === "DELETE") {
      logger.info("Deleted applet", { id: req.query.id });
    } else if (result.status === 200 && req.method === "PATCH") {
      const body = result.body as { featured?: boolean };
      logger.info("Updated applet", { id: req.query.id, featured: body.featured });
    } else if (result.status >= 500) {
      logger.error("Error in share-applet API");
    }

    if (result.headers) {
      Object.entries(result.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
    }
    logger.response(result.status, Date.now() - startTime);
    res.status(result.status).send(
      typeof result.body === "string" ? result.body : JSON.stringify(result.body)
    );
  } catch (error: unknown) {
    logger.error("Error in share-applet API", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    logger.response(500, Date.now() - startTime);
    res.status(500).json({ error: errorMessage });
  }
}
