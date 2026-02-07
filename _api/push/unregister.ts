import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import { validateAuth } from "../_utils/auth/index.js";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  setCorsHeaders,
} from "../_utils/_cors.js";
import { initLogger } from "../_utils/_logging.js";
import { mapWithConcurrency, resolveBoundedConcurrency } from "./_concurrency.js";
import { normalizeUnregisterPushPayload } from "./_request-payloads.js";
import {
  type PushTokenMetadata,
  extractAuthFromHeaders,
  extractTokenMetadataOwner,
  parseStoredPushTokens,
  getTokenMetaKey,
  getUserTokensKey,
} from "./_shared.js";

export const runtime = "nodejs";
export const maxDuration = 15;
const TOKEN_METADATA_LOOKUP_CONCURRENCY = resolveBoundedConcurrency(
  process.env.PUSH_METADATA_LOOKUP_CONCURRENCY,
  8
);

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
    });
  }

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
    logger.warn("Cleaned invalid stored push tokens during unregister", {
      username,
      invalidStoredTokensRemoved: invalidStoredTokens.length,
      skippedNonStringTokenCount,
    });
  }

  if (userTokens.length === 0) {
    logger.response(200, Date.now() - startTime);
    return res.status(200).json({
      success: true,
      removed: invalidStoredTokens.length,
      metadataRemoved: 0,
      invalidStoredTokensRemoved: invalidStoredTokens.length,
    });
  }

  await redis.del(userTokensKey);

  const tokenOwnership = await mapWithConcurrency(
    userTokens,
    TOKEN_METADATA_LOOKUP_CONCURRENCY,
    async (storedToken) => {
      const tokenMeta = await redis.get<Partial<PushTokenMetadata> | null>(
        getTokenMetaKey(storedToken)
      );
      return {
        storedToken,
        ownedByCurrentUser: extractTokenMetadataOwner(tokenMeta) === username,
      };
    }
  );

  const ownedTokens = tokenOwnership
    .filter((entry) => entry.ownedByCurrentUser)
    .map((entry) => entry.storedToken);

  if (ownedTokens.length > 0) {
    const pipeline = redis.pipeline();
    for (const ownedToken of ownedTokens) {
      pipeline.del(getTokenMetaKey(ownedToken));
    }
    await pipeline.exec();
  }

  logger.info("Unregistered all push tokens for user", {
    username,
    removed: userTokens.length + invalidStoredTokens.length,
    removedMetadata: ownedTokens.length,
    invalidStoredTokensRemoved: invalidStoredTokens.length,
    skippedNonStringTokenCount,
  });
  logger.response(200, Date.now() - startTime);

  return res.status(200).json({
    success: true,
    removed: userTokens.length + invalidStoredTokens.length,
    metadataRemoved: ownedTokens.length,
    invalidStoredTokensRemoved: invalidStoredTokens.length,
  });
}
