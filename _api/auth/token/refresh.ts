/**
 * POST /api/auth/token/refresh
 * 
 * Refresh an existing token
 */

import {
  generateAuthToken,
  storeToken,
  deleteToken,
  storeLastValidToken,
  validateAuth,
  CHAT_USERS_PREFIX,
  TOKEN_GRACE_PERIOD,
} from "../../_utils/auth/index.js";
import * as RateLimit from "../../_utils/_rate-limit.js";
import { getClientIp } from "../../_utils/_rate-limit.js";
import { apiHandler } from "../../_utils/api-handler.js";

export const runtime = "nodejs";

interface RefreshRequest {
  username: string;
  oldToken: string;
}

export default apiHandler<RefreshRequest>(
  {
    methods: ["POST"],
    parseJsonBody: true,
  },
  async ({ req, res, redis, logger, startTime, body }) => {
    // Rate limiting: 10/min per IP
    const ip = getClientIp(req);
    const rlKey = RateLimit.makeKey(["rl", "auth:refresh", "ip", ip]);
    const rlResult = await RateLimit.checkCounterLimit({
      key: rlKey,
      windowSeconds: 60,
      limit: 10,
    });

    if (!rlResult.allowed) {
      logger.warn("Rate limit exceeded", { ip });
      logger.response(429, Date.now() - startTime);
      res.status(429).json({
        error: "Too many refresh attempts. Please try again later.",
      });
      return;
    }

    const rawUsername = body?.username;
    const oldToken = body?.oldToken;

    if (!rawUsername || typeof rawUsername !== "string") {
      logger.warn("Missing username");
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Username is required" });
      return;
    }

    if (!oldToken || typeof oldToken !== "string") {
      logger.warn("Missing old token");
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Old token is required" });
      return;
    }

    const username = rawUsername.toLowerCase();

    // Check if user exists
    const userKey = `${CHAT_USERS_PREFIX}${username}`;
    const userData = await redis.get(userKey);
    if (!userData) {
      logger.warn("User not found", { username });
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Validate old token (allow expired for grace period refresh)
    const validationResult = await validateAuth(redis, username, oldToken, {
      allowExpired: true,
    });
    if (!validationResult.valid) {
      logger.warn("Invalid authentication token", { username });
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Invalid authentication token" });
      return;
    }

    // Store old token for grace period
    await storeLastValidToken(redis, username, oldToken, Date.now(), TOKEN_GRACE_PERIOD);

    // Delete old token
    await deleteToken(redis, oldToken);

    // Generate new token
    const newToken = generateAuthToken();
    await storeToken(redis, username, newToken);

    logger.info("Token refreshed successfully", { username });
    logger.response(201, Date.now() - startTime);
    res.status(201).json({ token: newToken });
  }
);
