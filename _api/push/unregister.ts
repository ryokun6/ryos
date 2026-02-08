import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initLogger } from "../_utils/_logging.js";
import {
  extractPushAuthCredentialsOrRespond,
  validatePushAuthOrRespond,
} from "./_auth-guard.js";
import { getPushMetadataLookupConcurrency } from "./_config.js";
import {
  respondInternalServerError,
} from "./_errors.js";
import { getTokenOwnershipEntries, splitTokenOwnership } from "./_ownership.js";
import { normalizeUnregisterPushPayload } from "./_request-payloads.js";
import { handlePushPostRequestGuards } from "./_request-guard.js";
import { createPushRedisOrRespond } from "./_redis-guard.js";
import {
  removeTokenMetadataKeys,
  removeTokensFromUserSet,
} from "./_set-ops.js";
import {
  extractTokenMetadataOwner,
  normalizeRedisNonNegativeCount,
  parseStoredPushTokens,
  getPushTokenSuffix,
  getTokenMetaKey,
  getUserTokensKey,
  type PushTokenMetadata,
} from "./_shared.js";

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
      "/api/push/unregister"
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

      const removedFromUserSet = normalizeRedisNonNegativeCount(
        await redis.srem(userTokensKey, pushToken)
      );
      let removedMetadataCount = 0;
      if (metadataBelongsToUser) {
        removedMetadataCount = normalizeRedisNonNegativeCount(
          await redis.del(tokenMetaKey)
        );
      }

      logger.info("Unregistered push token", {
        username,
        tokenSuffix: getPushTokenSuffix(pushToken),
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
        removedUserTokenSet: 0,
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
        removedUserTokenSet: 0,
      });
    }

    const tokenMetadataLookupConcurrency = getPushMetadataLookupConcurrency();
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
    const userTokenSetRemoved = normalizeRedisNonNegativeCount(
      await redis.del(userTokensKey)
    );

    logger.info("Unregistered all push tokens for user", {
      username,
      removed: userTokens.length + invalidStoredTokensRemoved,
      removedMetadata: metadataRemoved,
      removedUserTokenSet: userTokenSetRemoved,
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
      removedUserTokenSet: userTokenSetRemoved,
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
