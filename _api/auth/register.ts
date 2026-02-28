/**
 * POST /api/auth/register
 * 
 * Create a new user account with password (Node.js runtime for bcrypt)
 */

import {
  generateAuthToken,
  storeToken,
  CHAT_USERS_PREFIX,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "../_utils/auth/index.js";
import { hashPassword, setUserPasswordHash, verifyPassword, getUserPasswordHash } from "../_utils/auth/_password.js";
import { isProfaneUsername, assertValidUsername } from "../_utils/_validation.js";
import { createApiHandler } from "../_utils/middleware.js";

export const runtime = "nodejs";
export const maxDuration = 15;

interface RegisterRequest {
  username: string;
  password: string;
}

export default createApiHandler(
  {
    methods: ["POST"],
    action: "auth/register",
    cors: { methods: ["POST", "OPTIONS"] },
  },
  async (ctx): Promise<void> => {
    const blockKey = `rl:block:register:ip:${ctx.ip}`;
    const blocked = await ctx.redis.get(blockKey);
    if (blocked) {
      ctx.response.json(
        { error: "Too many registration attempts. Please try again later." },
        429
      );
      return;
    }

    const rlResult = await ctx.rateLimit.check({
      keyParts: ["rl", "auth", "register", "ip", ctx.ip],
      windowSeconds: 60,
      limit: 5,
    });
    if (!rlResult.allowed) {
      await ctx.redis.set(blockKey, "1", { ex: 86400 });
      ctx.response.json(
        { error: "Too many registration attempts. Please try again later." },
        429
      );
      return;
    }

    const body = ctx.req.body as RegisterRequest;
    const { username: rawUsername, password } = body || {};

    if (!rawUsername || typeof rawUsername !== "string") {
      ctx.response.badRequest("Username is required");
      return;
    }

    try {
      assertValidUsername(rawUsername, "register");
    } catch (error) {
      ctx.response.badRequest(
        error instanceof Error ? error.message : "Invalid username"
      );
      return;
    }

    if (isProfaneUsername(rawUsername)) {
      ctx.response.badRequest("Username contains inappropriate language");
      return;
    }

    if (!password || typeof password !== "string") {
      ctx.response.badRequest("Password is required");
      return;
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      ctx.response.badRequest(
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
      );
      return;
    }

    if (password.length > PASSWORD_MAX_LENGTH) {
      ctx.response.badRequest(
        `Password must be ${PASSWORD_MAX_LENGTH} characters or less`
      );
      return;
    }

    const username = rawUsername.toLowerCase();
    const userKey = `${CHAT_USERS_PREFIX}${username}`;

    const existingUser = await ctx.redis.get(userKey);
    if (existingUser) {
      try {
        const storedHash = await getUserPasswordHash(ctx.redis, username);
        if (storedHash) {
          const passwordValid = await verifyPassword(password, storedHash);
          if (passwordValid) {
            const token = generateAuthToken();
            await storeToken(ctx.redis, username, token);
            ctx.response.json({ token, user: { username } }, 200);
            return;
          }
        }
      } catch (loginError) {
        ctx.logger.error("Error attempting login for existing user", loginError);
      }

      ctx.response.json({ error: "Username already taken" }, 409);
      return;
    }

    try {
      const userData = {
        username,
        createdAt: Date.now(),
        lastActive: Date.now(),
      };
      await ctx.redis.set(userKey, JSON.stringify(userData));

      const passwordHash = await hashPassword(password);
      await setUserPasswordHash(ctx.redis, username, passwordHash);

      const token = generateAuthToken();
      await storeToken(ctx.redis, username, token);

      ctx.response.json({ token, user: { username } }, 201);
    } catch (error) {
      ctx.logger.error("Error creating user", error);
      ctx.response.error("Failed to create user", 500);
    }
  }
);
