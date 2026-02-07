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
import { getTokenOwnershipEntries, splitTokenOwnership } from "./_ownership.js";
import { normalizePushTestPayload } from "./_payload.js";
import { createPushRedis } from "./_redis.js";
import { summarizePushSendResults } from "./_results.js";
import {
  extractAuthFromHeaders,
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
const TOKEN_METADATA_LOOKUP_CONCURRENCY = getPushMetadataLookupConcurrency();
const APNS_SEND_CONCURRENCY = getApnsSendConcurrency();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);

  logger.request(req.method || "POST", req.url || "/api/push/test");

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

  const apnsConfig = getApnsConfigFromEnv();
  if (!apnsConfig) {
    const missingEnvVars = getMissingApnsEnvVars();
    logger.response(500, Date.now() - startTime);
    return res.status(500).json({
      error: "APNs is not configured.",
      missingEnvVars,
    });
  }

  const normalizedPayload = normalizePushTestPayload(req.body);
  if (!normalizedPayload.ok) {
    logger.response(400, Date.now() - startTime);
    return res.status(400).json({ error: normalizedPayload.error });
  }
  const payload = normalizedPayload.value;
  const title = payload.title;
  const message = payload.body;

  const userTokensKey = getUserTokensKey(username);
  const rawUserTokens = await redis.smembers<unknown[]>(userTokensKey);
  const {
    validTokens: userTokens,
    invalidTokensToRemove: invalidStoredTokens,
    skippedNonStringCount: skippedNonStringTokenCount,
  } = parseStoredPushTokens(rawUserTokens);

  if (invalidStoredTokens.length > 0) {
    const cleanupPipeline = redis.pipeline();
    for (const invalidToken of invalidStoredTokens) {
      cleanupPipeline.srem(userTokensKey, invalidToken);
    }
    await cleanupPipeline.exec();
  }

  if (invalidStoredTokens.length > 0 || skippedNonStringTokenCount > 0) {
    logger.warn("Cleaned invalid stored push tokens before send", {
      username,
      invalidStoredTokensRemoved: invalidStoredTokens.length,
      skippedNonStringTokenCount,
    });
  }

  if (userTokens.length === 0) {
    logger.response(400, Date.now() - startTime);
    return res.status(400).json({ error: "No registered push tokens for this user" });
  }

  const ownershipEntries = await getTokenOwnershipEntries(
    redis,
    username,
    userTokens,
    TOKEN_METADATA_LOOKUP_CONCURRENCY
  );
  const {
    ownedTokens,
    unownedTokens: staleOwnershipTokens,
  } = splitTokenOwnership(ownershipEntries);

  if (staleOwnershipTokens.length > 0) {
    const cleanupPipeline = redis.pipeline();
    for (const staleToken of staleOwnershipTokens) {
      cleanupPipeline.srem(userTokensKey, staleToken);
    }
    await cleanupPipeline.exec();
  }

  const requestedToken = payload.token;

  let targetTokens: string[] = [];
  if (requestedToken) {
    if (!ownedTokens.includes(requestedToken)) {
      logger.response(403, Date.now() - startTime);
      return res.status(403).json({ error: "Token is not registered for this user" });
    }
    targetTokens = [requestedToken];
  } else {
    targetTokens = ownedTokens;
  }

  if (targetTokens.length === 0) {
    logger.response(400, Date.now() - startTime);
    return res.status(400).json({ error: "No owned push tokens for this user" });
  }

  const results = await mapWithConcurrency(
    targetTokens,
    APNS_SEND_CONCURRENCY,
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

  if (staleTokens.length > 0) {
    const pipeline = redis.pipeline();
    for (const staleToken of staleTokens) {
      pipeline.srem(userTokensKey, staleToken);
      pipeline.del(getTokenMetaKey(staleToken));
    }
    await pipeline.exec();
  }

  const { successCount, failureCount, failureReasons } = summarizePushSendResults(results);

  logger.info("Push test sent", {
    username,
    successCount,
    failureCount,
    failureReasons,
    apnsSendConcurrency: APNS_SEND_CONCURRENCY,
    invalidStoredTokensRemoved: invalidStoredTokens.length,
    skippedNonStringTokenCount,
    staleTokensRemoved: staleTokens.length,
    staleOwnershipTokensRemoved: staleOwnershipTokens.length,
  });
  logger.response(200, Date.now() - startTime);

  return res.status(200).json({
    successCount,
    failureCount,
    failureReasons,
    apnsSendConcurrency: APNS_SEND_CONCURRENCY,
    invalidStoredTokensRemoved: invalidStoredTokens.length,
    staleTokensRemoved: staleTokens.length,
    staleOwnershipTokensRemoved: staleOwnershipTokens.length,
    results,
  });
}
