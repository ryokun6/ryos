/**
 * POST /api/auth/logout-all
 * Logout all sessions (invalidate all tokens for user)
 * Node.js runtime with terminal logging
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import { initLogger } from "../_utils/_logging.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../_utils/_cors.js";
import { executeAuthLogoutAllCore } from "../cores/auth-logout-all-core.js";

export const runtime = "nodejs";
export const maxDuration = 15;

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);

  logger.request(req.method || "POST", req.url || "/api/auth/logout-all", "logout-all");

  if (req.method === "OPTIONS") {
    setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"] });
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"] });

  if (req.method !== "POST") {
    logger.response(405, Date.now() - startTime);
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const originAllowed = isAllowedOrigin(origin);

  const redis = createRedis();
  const authHeader = req.headers.authorization;
  const usernameHeader = req.headers["x-username"] as string | undefined;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const username = usernameHeader || null;

  if (!username || !token) {
    logger.response(401, Date.now() - startTime);
    res.status(401).json({ error: "Unauthorized - missing credentials" });
    return;
  }

  const result = await executeAuthLogoutAllCore({
    originAllowed,
    username,
    token,
    redis,
  });

  if (result.status === 200) {
    logger.info("Logged out from all devices", {
      username,
      deletedCount: (result.body as { deletedCount?: number })?.deletedCount,
    });
  }
  logger.response(result.status, Date.now() - startTime);
  res.status(result.status).json(result.body);
}
