/**
 * POST /api/auth/password/set
 * 
 * Set or update user's password (Node.js runtime for bcrypt)
 */

import {
  validateAuth,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "../../_utils/auth/index.js";
import { hashPassword, setUserPasswordHash } from "../../_utils/auth/_password.js";
import { createApiHandler } from "../../_utils/middleware.js";

export const runtime = "nodejs";
export const maxDuration = 15;

interface SetPasswordRequest {
  password: string;
}

export default createApiHandler(
  {
    methods: ["POST"],
    action: "auth/password/set",
    cors: { methods: ["POST", "OPTIONS"] },
  },
  async (ctx): Promise<void> => {
    const { username, token } = ctx.auth.extract();
    const authResult = await validateAuth(ctx.redis, username, token, {
      allowExpired: true,
    });

    if (!username || !token) {
      ctx.response.error("Unauthorized - missing credentials", 401);
      return;
    }

    if (!authResult.valid) {
      ctx.response.error("Unauthorized - invalid token", 401);
      return;
    }

    const body = ctx.req.body as SetPasswordRequest;
    const { password } = body || {};

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

    try {
      const passwordHash = await hashPassword(password);
      await setUserPasswordHash(
        ctx.redis,
        username.toLowerCase(),
        passwordHash
      );

      ctx.response.ok({ success: true });
    } catch (error) {
      ctx.logger.error("Error setting password", error);
      ctx.response.error("Failed to set password", 500);
    }
  }
);
