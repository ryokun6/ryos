import type { VercelRequest, VercelResponse } from "@vercel/node";
import { validateAuth } from "../_utils/auth/index.js";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  setCorsHeaders,
} from "../_utils/_cors.js";
import { initLogger } from "../_utils/_logging.js";
import {
  respondInternalServerError,
  respondMissingEnvConfig,
} from "./_errors.js";
import { createPushRedis, getMissingPushRedisEnvVars } from "./_redis.js";
import {
  PUSH_TOKEN_TTL_SECONDS,
  extractAuthFromHeaders,
  extractTokenMetadataOwner,
  getTokenMetaKey,
  getUserTokensKey,
  type PushTokenMetadata,
} from "./_shared.js";
import { normalizeRegisterPushPayload } from "./_request-payloads.js";

export const runtime = "nodejs";
export const maxDuration = 15;

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

  try {
    const missingRedisEnvVars = getMissingPushRedisEnvVars();
    if (missingRedisEnvVars.length > 0) {
      return respondMissingEnvConfig(
        res,
        logger,
        startTime,
        "Redis",
        missingRedisEnvVars
      );
    }

    const redis = createPushRedis();
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

    const parsedPayload = normalizeRegisterPushPayload(req.body);
    if (!parsedPayload.ok) {
      logger.response(400, Date.now() - startTime);
      return res.status(400).json({ error: parsedPayload.error });
    }
    const { token: pushToken, platform } = parsedPayload.value;

    const tokenMetaKey = getTokenMetaKey(pushToken);
    const currentUserTokensKey = getUserTokensKey(username);
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
    pipeline.sadd(currentUserTokensKey, pushToken);
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
  } catch (error) {
    return respondInternalServerError(
      res,
      logger,
      startTime,
      "Unexpected error in push register handler",
      error
    );
  }
}
