/**
 * POST /api/auth/password/set
 *
 * Set or update user's password (Node.js runtime for bcrypt)
 */

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "../../_utils/auth/index.js";
import { hashPassword, setUserPasswordHash } from "../../_utils/auth/_password.js";
import { createApiHandler } from "../../_utils/handler.js";

export const runtime = "nodejs";
export const maxDuration = 15;

interface SetPasswordRequest {
  password: string;
}

export default createApiHandler(
  {
    operation: "password-set",
    methods: ["POST"],
  },
  async (_req, _res, ctx): Promise<void> => {
    const user = await ctx.requireAuth({ allowExpired: true });
    if (!user) {
      return;
    }

    const { data: body, error } = ctx.parseJsonBody<SetPasswordRequest>();
    if (error || !body) {
      ctx.response.badRequest(error ?? "Invalid JSON body");
      return;
    }

    const { password } = body;
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
      await setUserPasswordHash(ctx.redis, user.username, passwordHash);
      ctx.logger.info("Password updated", { username: user.username });
      ctx.response.ok({ success: true });
    } catch (routeError) {
      ctx.logger.error("Error setting password", routeError);
      ctx.response.serverError("Failed to set password");
    }
  }
);
