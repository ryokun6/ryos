/**
 * POST /api/auth/login
 *
 * Authenticate user with password (Node.js runtime for bcrypt)
 */

import {
  CHAT_USERS_PREFIX,
  TOKEN_GRACE_PERIOD,
  deleteToken,
  generateAuthToken,
  storeLastValidToken,
  storeToken,
} from "../_utils/auth/index.js";
import { getUserPasswordHash, verifyPassword } from "../_utils/auth/_password.js";
import { createApiHandler } from "../_utils/handler.js";
import { RATE_LIMITS } from "../_utils/middleware.js";

export const runtime = "nodejs";
export const maxDuration = 15;

interface LoginRequest {
  username: string;
  password: string;
  oldToken?: string;
}

export default createApiHandler(
  {
    operation: "auth-login",
    methods: ["POST"],
  },
  async (_req, _res, ctx): Promise<void> => {
    if (
      !(await ctx.applyRateLimit({
        ...RATE_LIMITS.burst("auth:login"),
        message: "Too many login attempts. Please try again later.",
      }))
    ) {
      return;
    }

    const { data: body, error } = ctx.parseJsonBody<LoginRequest>();
    if (error || !body) {
      ctx.response.badRequest(error ?? "Invalid JSON body");
      return;
    }

    const { username: rawUsername, password, oldToken } = body;

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

    try {
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

      ctx.logger.info("User logged in", { username });
      ctx.response.ok({ token, username });
    } catch (routeError) {
      ctx.logger.error("Error during login", routeError);
      ctx.response.serverError("Login failed");
    }
  }
);
