import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import { validateAuth } from "../_utils/auth/index.js";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  setCorsHeaders,
} from "../_utils/_cors.js";
import { initLogger } from "../_utils/_logging.js";
import {
  type PushPlatform,
  type PushTokenMetadata,
  PUSH_TOKEN_TTL_SECONDS,
  extractAuthFromHeaders,
  extractTokenMetadataOwner,
  getOptionalTrimmedString,
  getRequestBodyObject,
  getTokenMetaKey,
  getUserTokensKey,
  isPushPlatform,
  isValidPushToken,
} from "./_shared.js";

export const runtime = "nodejs";
export const maxDuration = 15;

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);

  logger.request(req.method || "POST", req.url || "/api/push/register");

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
  const { username, token } = extractAuthFromHeaders(req.headers);
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

  const body = getRequestBodyObject(req.body);
  if (!body) {
    logger.response(400, Date.now() - startTime);
    return res.status(400).json({ error: "Request body must be a JSON object" });
  }

  if (typeof body.token !== "undefined" && typeof body.token !== "string") {
    logger.response(400, Date.now() - startTime);
    return res.status(400).json({ error: "Invalid push token format" });
  }

  if (typeof body.platform !== "undefined" && typeof body.platform !== "string") {
    logger.response(400, Date.now() - startTime);
    return res.status(400).json({ error: "Unsupported push platform" });
  }

  const pushToken = getOptionalTrimmedString(body.token);
  const platform = (body.platform as PushPlatform | undefined) ?? "ios";

  if (!pushToken) {
    logger.response(400, Date.now() - startTime);
    return res.status(400).json({ error: "Push token is required" });
  }

  if (!isValidPushToken(pushToken)) {
    logger.response(400, Date.now() - startTime);
    return res.status(400).json({ error: "Invalid push token format" });
  }

  if (!isPushPlatform(platform)) {
    logger.response(400, Date.now() - startTime);
    return res.status(400).json({ error: "Unsupported push platform" });
  }

  const tokenMetaKey = getTokenMetaKey(pushToken);
  const existingMeta = await redis.get<Partial<PushTokenMetadata> | null>(tokenMetaKey);
  const previousUsername = extractTokenMetadataOwner(existingMeta);

  const now = Date.now();
  const metadata: PushTokenMetadata = {
    username,
    platform,
    updatedAt: now,
  };
  const pipeline = redis.pipeline();
  if (previousUsername && previousUsername !== username) {
    pipeline.srem(getUserTokensKey(previousUsername), pushToken);
  }
  pipeline.sadd(getUserTokensKey(username), pushToken);
  pipeline.set(tokenMetaKey, metadata, { ex: PUSH_TOKEN_TTL_SECONDS });
  await pipeline.exec();

  logger.info("Registered push token", {
    username,
    platform,
    tokenSuffix: pushToken.slice(-8),
    transferredFromUser: previousUsername && previousUsername !== username ? previousUsername : null,
  });
  logger.response(200, Date.now() - startTime);

  return res.status(200).json({
    success: true,
    token: pushToken,
    platform,
  });
}
