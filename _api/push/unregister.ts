import type { VercelRequest, VercelResponse } from "@vercel/node";
import { validateAuth } from "../_utils/auth/index.js";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  setCorsHeaders,
} from "../_utils/_cors.js";
import { initLogger } from "../_utils/_logging.js";
import { getPushMetadataLookupConcurrency } from "./_config.js";
import {
  respondInternalServerError,
  respondMissingEnvConfig,
} from "./_errors.js";
import { getTokenOwnershipEntries, splitTokenOwnership } from "./_ownership.js";
import { normalizeUnregisterPushPayload } from "./_request-payloads.js";
import { createPushRedis, getMissingPushRedisEnvVars } from "./_redis.js";
import {
  removeTokenMetadataKeys,
  removeTokensFromUserSet,
} from "./_set-ops.js";
import {
  extractAuthFromHeaders,
  extractTokenMetadataOwner,
  parseStoredPushTokens,
  getTokenMetaKey,
  getUserTokensKey,
  type PushTokenMetadata,
} from "./_shared.js";

export const runtime = "nodejs";
export const maxDuration = 15;

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
    const tokenMetadataLookupConcurrency = getPushMetadataLookupConcurrency();
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

    const parsedPayload = normalizeUnregisterPushPayload(req.body);
    if (!parsedPayload.ok) {
      logger.response(400, Date.now() - startTime);
      return res.status(400).json({ error: parsedPayload.error });
    }

    const { token: pushToken } = parsedPayload.value;
    const userTokensKey = getUserTokensKey(username);

    if (pushToken) {
      const tokenMetaKey = getTokenMetaKey(pushToken);
      const tokenMeta = await redis.get<Partial<PushTokenMetadata> | null>(tokenMetaKey);
      const metadataBelongsToUser = extractTokenMetadataOwner(tokenMeta) === username;

      const removedFromUserSet = await redis.srem(userTokensKey, pushToken);
      let removedMetadataCount = 0;
      if (metadataBelongsToUser) {
        removedMetadataCount = await redis.del(tokenMetaKey);
      }

      logger.info("Unregistered push token", {
        username,
        tokenSuffix: pushToken.slice(-8),
        removedFromUserSet,
        removedMetadataCount,
      });
      logger.response(200, Date.now() - startTime);
      return res.status(200).json({
        success: true,
        removed: removedFromUserSet,
        metadataRemoved: removedMetadataCount,
        invalidStoredTokensRemoved: 0,
        skippedNonStringTokenCount: 0,
        pushMetadataLookupConcurrency: 0,
      });
    }

    const rawUserTokens = await redis.smembers<unknown[]>(userTokensKey);
    const {
      validTokens: userTokens,
      invalidTokensToRemove: invalidStoredTokens,
      skippedNonStringCount: skippedNonStringTokenCount,
    } = parseStoredPushTokens(rawUserTokens);

    const invalidStoredTokensRemoved = await removeTokensFromUserSet(
      redis,
      userTokensKey,
      invalidStoredTokens
    );

    if (invalidStoredTokensRemoved > 0 || skippedNonStringTokenCount > 0) {
      logger.warn("Cleaned invalid stored push tokens during unregister", {
        username,
        invalidStoredTokensRemoved,
        skippedNonStringTokenCount,
      });
    }

    if (userTokens.length === 0) {
      logger.response(200, Date.now() - startTime);
      return res.status(200).json({
        success: true,
        removed: invalidStoredTokensRemoved,
        metadataRemoved: 0,
        invalidStoredTokensRemoved,
        skippedNonStringTokenCount,
        pushMetadataLookupConcurrency: 0,
      });
    }

    await redis.del(userTokensKey);

    const tokenOwnership = await getTokenOwnershipEntries(
      redis,
      username,
      userTokens,
      tokenMetadataLookupConcurrency
    );
    const { ownedTokens } = splitTokenOwnership(tokenOwnership);

    const metadataRemoved = await removeTokenMetadataKeys(
      redis,
      ownedTokens,
      getTokenMetaKey
    );

    logger.info("Unregistered all push tokens for user", {
      username,
      removed: userTokens.length + invalidStoredTokensRemoved,
      removedMetadata: metadataRemoved,
      invalidStoredTokensRemoved,
      skippedNonStringTokenCount,
      pushMetadataLookupConcurrency: tokenMetadataLookupConcurrency,
    });
    logger.response(200, Date.now() - startTime);

    return res.status(200).json({
      success: true,
      removed: userTokens.length + invalidStoredTokensRemoved,
      metadataRemoved,
      invalidStoredTokensRemoved,
      skippedNonStringTokenCount,
      pushMetadataLookupConcurrency: tokenMetadataLookupConcurrency,
    });
  } catch (error) {
    return respondInternalServerError(
      res,
      logger,
      startTime,
      "Unexpected error in push unregister handler",
      error
    );
  }
}
