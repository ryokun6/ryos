/**
 * GET /api/auth/tokens
 * List all active tokens for the authenticated user
 * Node.js runtime with terminal logging
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import { initLogger } from "../_utils/_logging.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../_utils/_cors.js";
import { executeAuthTokensCore } from "../cores/auth-tokens-core.js";

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

  logger.request(req.method || "GET", req.url || "/api/auth/tokens", "tokens");

  if (req.method === "OPTIONS") {
    setCorsHeaders(res, origin, { methods: ["GET", "OPTIONS"] });
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  setCorsHeaders(res, origin, { methods: ["GET", "OPTIONS"] });

  if (req.method !== "GET") {
    logger.response(405, Date.now() - startTime);
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const originAllowed = isAllowedOrigin(origin);

  const redis = createRedis();
  const authHeader = req.headers.authorization;
  const usernameHeader = req.headers["x-username"] as string | undefined;
  const currentToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const username = usernameHeader || null;

  if (!username || !currentToken) {
    logger.response(401, Date.now() - startTime);
    res.status(401).json({ error: "Unauthorized - missing credentials" });
    return;
  }

  const result = await executeAuthTokensCore({
    originAllowed,
    username,
    currentToken,
    redis,
  });

  if (result.status === 200) {
    logger.info("Listed tokens", {
      username,
      count: (result.body as { count?: number })?.count,
    });
  }
  logger.response(result.status, Date.now() - startTime);
  res.status(result.status).json(result.body);
}
