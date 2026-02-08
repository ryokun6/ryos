import type { VercelRequest, VercelResponse } from "@vercel/node";
import { validateAuth } from "../_utils/auth/index.js";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  setCorsHeaders,
} from "../_utils/_cors.js";
import { initLogger } from "../_utils/_logging.js";
import {
  getApnsConfigFromEnv,
  getMissingApnsEnvVars,
  sendApnsAlert,
} from "../_utils/_push-apns.js";
import { mapWithConcurrency } from "./_concurrency.js";
import {
  getApnsSendConcurrency,
  getPushMetadataLookupConcurrency,
} from "./_config.js";
import {
  respondInternalServerError,
  respondMissingEnvConfig,
} from "./_errors.js";
import { getTokenOwnershipEntries, splitTokenOwnership } from "./_ownership.js";
import { normalizePushTestPayload } from "./_payload.js";
import { createPushRedis, getMissingPushRedisEnvVars } from "./_redis.js";
import { summarizePushSendResults } from "./_results.js";
import {
  removeTokensAndMetadata,
  removeTokensFromUserSet,
} from "./_set-ops.js";
import {
  extractAuthFromHeaders,
  getPushTokenSuffix,
  isRedisPositiveCount,
  parseStoredPushTokens,
  getTokenMetaKey,
  getUserTokensKey,
} from "./_shared.js";

export const runtime = "nodejs";
export const maxDuration = 20;

const APNS_STALE_REASONS = new Set([
  "BadDeviceToken",
  "Unregistered",
  "DeviceTokenNotForTopic",
]);

function createTokenNotRegisteredResponse(
  staleOwnershipTokensRemoved: number,
  pushMetadataLookupConcurrency: number,
  invalidStoredTokensRemoved: number = 0,
  skippedNonStringTokenCount: number = 0
) {
  return {
    error: "Token is not registered for this user",
    staleOwnershipTokensRemoved,
    pushMetadataLookupConcurrency,
    invalidStoredTokensRemoved,
    skippedNonStringTokenCount,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);

  logger.request(req.method || "POST", req.url || "/api/push/test");

  if (req.method === "OPTIONS") {
    if (!isAllowedOrigin(origin)) {
      logger.response(403, Date.now() - startTime);
      return res.status(403).json({ error: "Unauthorized" });
    }
    setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"] });
    logger.response(204, Date.now() - startTime);
    return res.status(204).end();
  }

  if (!isAllowedOrigin(origin)) {
    logger.response(403, Date.now() - startTime);
    return res.status(403).json({ error: "Unauthorized" });
  }

  setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"] });

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    logger.response(405, Date.now() - startTime);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { username, token } = extractAuthFromHeaders(req.headers);
    if (!username || !token) {
      logger.response(401, Date.now() - startTime);
      return res.status(401).json({ error: "Unauthorized - missing credentials" });
    }

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
    const authResult = await validateAuth(redis, username, token, {
      allowExpired: false,
    });
    if (!authResult.valid || authResult.expired) {
      logger.response(401, Date.now() - startTime);
      return res.status(401).json({ error: "Unauthorized - invalid token" });
    }

    const tokenMetadataLookupConcurrency = getPushMetadataLookupConcurrency();
    const apnsSendConcurrency = getApnsSendConcurrency();

    const apnsConfig = getApnsConfigFromEnv();
    if (!apnsConfig) {
      const missingEnvVars = getMissingApnsEnvVars();
      return respondMissingEnvConfig(
        res,
        logger,
        startTime,
        "APNs",
        missingEnvVars
      );
    }

    const normalizedPayload = normalizePushTestPayload(req.body);
    if (!normalizedPayload.ok) {
      logger.response(400, Date.now() - startTime);
      return res.status(400).json({ error: normalizedPayload.error });
    }
    const payload = normalizedPayload.value;
    const title = payload.title;
    const message = payload.body;
    const requestedToken = payload.token;

    const userTokensKey = getUserTokensKey(username);
    let invalidStoredTokensRemoved = 0;
    let skippedNonStringTokenCount = 0;
    let tokensForOwnershipLookup: string[] = [];

    if (requestedToken) {
      const isRequestedTokenRegistered = await redis.sismember(
        userTokensKey,
        requestedToken
      );
      if (!isRedisPositiveCount(isRequestedTokenRegistered)) {
        logger.warn("Push test rejected: requested token not in user set", {
          username,
          requestedTokenSuffix: getPushTokenSuffix(requestedToken),
          staleOwnershipTokensRemoved: 0,
          pushMetadataLookupConcurrency: 0,
          invalidStoredTokensRemoved: 0,
          skippedNonStringTokenCount: 0,
        });
        logger.response(403, Date.now() - startTime);
        return res
          .status(403)
          .json(createTokenNotRegisteredResponse(0, 0, 0, 0));
      }

      tokensForOwnershipLookup = [requestedToken];
    } else {
      const rawUserTokens = await redis.smembers<unknown[]>(userTokensKey);
      const {
        validTokens: userTokens,
        invalidTokensToRemove: invalidStoredTokens,
        skippedNonStringCount,
      } = parseStoredPushTokens(rawUserTokens);
      skippedNonStringTokenCount = skippedNonStringCount;

      invalidStoredTokensRemoved = await removeTokensFromUserSet(
        redis,
        userTokensKey,
        invalidStoredTokens
      );

      if (invalidStoredTokensRemoved > 0 || skippedNonStringTokenCount > 0) {
        logger.warn("Cleaned invalid stored push tokens before send", {
          username,
          invalidStoredTokensRemoved,
          skippedNonStringTokenCount,
        });
      }

      if (userTokens.length === 0) {
        logger.warn("Push test aborted: no valid tokens after cleanup", {
          username,
          invalidStoredTokensRemoved,
          skippedNonStringTokenCount,
        });
        logger.response(400, Date.now() - startTime);
        return res.status(400).json({
          error: "No registered push tokens for this user",
          invalidStoredTokensRemoved,
          skippedNonStringTokenCount,
        });
      }

      tokensForOwnershipLookup = userTokens;
    }

    const ownershipEntries = await getTokenOwnershipEntries(
      redis,
      username,
      tokensForOwnershipLookup,
      tokenMetadataLookupConcurrency
    );
    const {
      ownedTokens: targetTokens,
      unownedTokens: staleOwnershipTokens,
    } = splitTokenOwnership(ownershipEntries);
    const staleOwnershipTokensRemoved = await removeTokensFromUserSet(
      redis,
      userTokensKey,
      staleOwnershipTokens
    );

    if (requestedToken && targetTokens.length === 0) {
      logger.warn("Push test rejected: requested token failed ownership check", {
        username,
        requestedTokenSuffix: getPushTokenSuffix(requestedToken),
        staleOwnershipTokensRemoved,
        pushMetadataLookupConcurrency: tokenMetadataLookupConcurrency,
        invalidStoredTokensRemoved,
        skippedNonStringTokenCount,
      });
      logger.response(403, Date.now() - startTime);
      return res.status(403).json(
        createTokenNotRegisteredResponse(
          staleOwnershipTokensRemoved,
          tokenMetadataLookupConcurrency,
          invalidStoredTokensRemoved,
          skippedNonStringTokenCount
        )
      );
    }

    if (targetTokens.length === 0) {
      logger.warn("Push test aborted: no owned tokens after ownership cleanup", {
        username,
        staleOwnershipTokensRemoved,
        pushMetadataLookupConcurrency: tokenMetadataLookupConcurrency,
        invalidStoredTokensRemoved,
        skippedNonStringTokenCount,
      });
      logger.response(400, Date.now() - startTime);
      return res.status(400).json({
        error: "No owned push tokens for this user",
        staleOwnershipTokensRemoved,
        pushMetadataLookupConcurrency: tokenMetadataLookupConcurrency,
        invalidStoredTokensRemoved,
        skippedNonStringTokenCount,
      });
    }

    const results = await mapWithConcurrency(
      targetTokens,
      apnsSendConcurrency,
      (deviceToken) =>
        sendApnsAlert(apnsConfig, deviceToken, {
          title,
          body: message,
          data: payload.data,
          badge: payload.badge,
          sound: payload.sound,
        })
    );

    const staleTokens = results
      .filter((result) => !result.ok && result.reason && APNS_STALE_REASONS.has(result.reason))
      .map((result) => result.token);
    const staleTokensRemoved = await removeTokensAndMetadata(
      redis,
      userTokensKey,
      staleTokens,
      getTokenMetaKey
    );

    const { successCount, failureCount, failureReasons } = summarizePushSendResults(results);

    logger.info("Push test sent", {
      username,
      successCount,
      failureCount,
      failureReasons,
      apnsSendConcurrency,
      pushMetadataLookupConcurrency: tokenMetadataLookupConcurrency,
      invalidStoredTokensRemoved,
      skippedNonStringTokenCount,
      staleTokensRemoved,
      staleOwnershipTokensRemoved,
    });
    logger.response(200, Date.now() - startTime);

    return res.status(200).json({
      successCount,
      failureCount,
      failureReasons,
      apnsSendConcurrency,
      pushMetadataLookupConcurrency: tokenMetadataLookupConcurrency,
      invalidStoredTokensRemoved,
      skippedNonStringTokenCount,
      staleTokensRemoved,
      staleOwnershipTokensRemoved,
      results,
    });
  } catch (error) {
    return respondInternalServerError(
      res,
      logger,
      startTime,
      "Unexpected error in push test handler",
      error
    );
  }
}
