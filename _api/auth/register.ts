/**
 * POST /api/auth/register
 *
 * Create a new user account with password (Node.js runtime for bcrypt)
 */

import {
  CHAT_USERS_PREFIX,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  generateAuthToken,
  storeToken,
} from "../_utils/auth/index.js";
import {
  getUserPasswordHash,
  hashPassword,
  setUserPasswordHash,
  verifyPassword,
} from "../_utils/auth/_password.js";
import { createApiHandler } from "../_utils/handler.js";
import { assertValidUsername, isProfaneUsername } from "../_utils/_validation.js";

export const runtime = "nodejs";
export const maxDuration = 15;

interface RegisterRequest {
  username: string;
  password: string;
}

export default createApiHandler(
  {
    operation: "auth-register",
    methods: ["POST"],
  },
  async (_req, _res, ctx): Promise<void> => {
    const blockKey = `rl:block:register:ip:${ctx.ip}`;
    const blocked = await ctx.redis.get(blockKey);
    if (blocked) {
      ctx.response.tooManyRequests(
        "Too many registration attempts. Please try again later."
      );
      return;
    }

    if (
      !(await ctx.applyRateLimit({
        prefix: "auth:register",
        windowSeconds: 60,
        limit: 5,
        by: "ip",
        message: "Too many registration attempts. Please try again later.",
        onExceeded: async (apiCtx) => {
          await apiCtx.redis.set(blockKey, "1", { ex: 86400 });
        },
      }))
    ) {
      return;
    }

    const { data: body, error } = ctx.parseJsonBody<RegisterRequest>();
    if (error || !body) {
      ctx.response.badRequest(error ?? "Invalid JSON body");
      return;
    }

    const { username: rawUsername, password } = body;

    if (!rawUsername || typeof rawUsername !== "string") {
      ctx.response.badRequest("Username is required");
      return;
    }

    try {
      assertValidUsername(rawUsername, "register");
    } catch (validationError) {
      ctx.response.badRequest(
        validationError instanceof Error
          ? validationError.message
          : "Invalid username"
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
            ctx.logger.info("Existing user re-authenticated during register", {
              username,
            });
            ctx.response.ok({ token, user: { username } });
            return;
          }
        }
      } catch (loginError) {
        ctx.logger.error("Error attempting login for existing user", loginError);
      }

      ctx.response.conflict("Username already taken");
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

      ctx.logger.info("User registered", { username });
      ctx.response.created({ token, user: { username } });
    } catch (routeError) {
      ctx.logger.error("Error creating user", routeError);
      ctx.response.serverError("Failed to create user");
    }
  }
);
