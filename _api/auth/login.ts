/**
 * POST /api/auth/login
 * 
 * Authenticate user with password (Node.js runtime for bcrypt)
 */

import {
  generateAuthToken,
  storeToken,
  deleteToken,
  storeLastValidToken,
  CHAT_USERS_PREFIX,
  TOKEN_GRACE_PERIOD,
} from "../_utils/auth/index.js";
import { verifyPassword, getUserPasswordHash } from "../_utils/auth/_password.js";
import { createApiHandler } from "../_utils/middleware.js";

export const runtime = "nodejs";
export const maxDuration = 15;

interface LoginRequest {
  username: string;
  password: string;
  oldToken?: string;
}

export default createApiHandler(
  {
    methods: ["POST"],
    action: "auth/login",
    cors: { methods: ["POST", "OPTIONS"] },
  },
  async (ctx): Promise<void> => {
    // Rate limiting: 10/min per IP
    const rlResult = await ctx.rateLimit.check({
      keyParts: ["rl", "auth", "login", "ip", ctx.ip],
      windowSeconds: 60,
      limit: 10,
    });
    if (!rlResult.allowed) {
      ctx.response.json(
        { error: "Too many login attempts. Please try again later." },
        429
      );
      return;
    }

    const body = ctx.req.body as LoginRequest;
    const { username: rawUsername, password, oldToken } = body || {};

    if (!rawUsername || typeof rawUsername !== "string") {
      ctx.response.badRequest("Username is required");
      return;
    }

    if (!password || typeof password !== "string") {
      ctx.response.badRequest("Password is required");
      return;
    }

    const username = rawUsername.toLowerCase();
    const userKey = `${CHAT_USERS_PREFIX}${username}`;

    const userData = await ctx.redis.get(userKey);
    if (!userData) {
      ctx.response.unauthorized("Invalid credentials");
      return;
    }

    const passwordHash = await getUserPasswordHash(ctx.redis, username);
    if (!passwordHash) {
      ctx.response.unauthorized("Invalid credentials");
      return;
    }

    const passwordValid = await verifyPassword(password, passwordHash);
    if (!passwordValid) {
      ctx.response.unauthorized("Invalid credentials");
      return;
    }

    try {
      if (oldToken) {
        await storeLastValidToken(
          ctx.redis,
          username,
          oldToken,
          Date.now(),
          TOKEN_GRACE_PERIOD
        );
        await deleteToken(ctx.redis, oldToken);
      }

      const token = generateAuthToken();
      await storeToken(ctx.redis, username, token);

      ctx.response.ok({ token, username });
    } catch (error) {
      ctx.logger.error("Error during login", error);
      ctx.response.error("Login failed", 500);
    }
  }
);
