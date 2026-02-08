import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initLogger } from "../_utils/_logging.js";
import {
  extractPushAuthCredentialsOrRespond,
  validatePushAuthOrRespond,
} from "./_auth-guard.js";
import {
  respondInternalServerError,
} from "./_errors.js";
import { handlePushPostRequestGuards } from "./_request-guard.js";
import { createPushRedisOrRespond } from "./_redis-guard.js";
import {
  PUSH_TOKEN_TTL_SECONDS,
  extractTokenMetadataOwner,
  getPushTokenSuffix,
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

  if (
    handlePushPostRequestGuards(
      req,
      res,
      logger,
      startTime,
      "/api/push/register"
    )
  ) {
    return;
  }

  try {
    const credentials = extractPushAuthCredentialsOrRespond(
      req.headers,
      res,
      logger,
      startTime
    );
    if (!credentials) return;

    const { username } = credentials;

    const redis = createPushRedisOrRespond(res, logger, startTime);
    if (!redis) return;

    const isAuthorized = await validatePushAuthOrRespond(
      redis,
      credentials,
      res,
      logger,
      startTime
    );
    if (!isAuthorized) return;

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
      tokenSuffix: getPushTokenSuffix(pushToken),
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
