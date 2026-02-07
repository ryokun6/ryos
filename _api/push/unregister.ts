import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import { validateAuth } from "../_utils/auth/index.js";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  setCorsHeaders,
} from "../_utils/_cors.js";
import { initLogger } from "../_utils/_logging.js";

export const runtime = "nodejs";
export const maxDuration = 15;

interface UnregisterPushTokenBody {
  token?: string;
}

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}

function extractAuth(req: VercelRequest): { username: string | null; token: string | null } {
  const authHeader = req.headers.authorization as string | undefined;
  const usernameHeader = req.headers["x-username"] as string | undefined;

  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const username = usernameHeader?.trim().toLowerCase() || null;

  return { username, token };
}

function getUserTokensKey(username: string): string {
  return `push:user:${username}:tokens`;
}

function getTokenMetaKey(token: string): string {
  return `push:token:${token}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);

  logger.request(req.method || "POST", req.url || "/api/push/unregister");

  if (req.method === "OPTIONS") {
    setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"] });
    logger.response(204, Date.now() - startTime);
    return res.status(204).end();
  }

  setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"] });

  if (!isAllowedOrigin(origin)) {
    logger.response(403, Date.now() - startTime);
    return res.status(403).json({ error: "Unauthorized" });
  }

  if (req.method !== "POST") {
    logger.response(405, Date.now() - startTime);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const redis = createRedis();
  const { username, token } = extractAuth(req);
  if (!username || !token) {
    logger.response(401, Date.now() - startTime);
    return res.status(401).json({ error: "Unauthorized - missing credentials" });
  }

  const authResult = await validateAuth(redis, username, token, {
    allowExpired: false,
  });
  if (!authResult.valid || authResult.expired) {
    logger.response(401, Date.now() - startTime);
    return res.status(401).json({ error: "Unauthorized - invalid token" });
  }

  const body = (req.body || {}) as UnregisterPushTokenBody;
  const pushToken = body.token?.trim();
  const userTokensKey = getUserTokensKey(username);

  if (pushToken) {
    const pipeline = redis.pipeline();
    pipeline.srem(userTokensKey, pushToken);
    pipeline.del(getTokenMetaKey(pushToken));
    await pipeline.exec();

    logger.info("Unregistered push token", {
      username,
      tokenSuffix: pushToken.slice(-8),
    });
    logger.response(200, Date.now() - startTime);
    return res.status(200).json({ success: true, removed: 1 });
  }

  const userTokens = await redis.smembers<string[]>(userTokensKey);
  if (!userTokens || userTokens.length === 0) {
    logger.response(200, Date.now() - startTime);
    return res.status(200).json({ success: true, removed: 0 });
  }

  const pipeline = redis.pipeline();
  pipeline.del(userTokensKey);
  for (const storedToken of userTokens) {
    pipeline.del(getTokenMetaKey(storedToken));
  }
  await pipeline.exec();

  logger.info("Unregistered all push tokens for user", {
    username,
    removed: userTokens.length,
  });
  logger.response(200, Date.now() - startTime);

  return res.status(200).json({ success: true, removed: userTokens.length });
}
