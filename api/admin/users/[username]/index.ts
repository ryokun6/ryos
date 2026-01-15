/**
 * GET /api/admin/users/:username - Get user details
 * DELETE /api/admin/users/:username - Delete user
 * PATCH /api/admin/users/:username - Ban/unban user
 */

import { z } from "zod";
import { getRedis } from "../../../_lib/redis.js";
import { REDIS_KEYS, ADMIN_USERNAME, API_CONFIG } from "../../../_lib/constants.js";
import {
  validationError,
  notFound,
  forbidden,
  internalError,
} from "../../../_lib/errors.js";
import { jsonSuccess, jsonError, withCors } from "../../../_lib/response.js";
import {
  generateRequestId,
  logInfo,
  logError,
  logComplete,
} from "../../../_lib/logging.js";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  handleCorsPreflightIfNeeded,
} from "../../../_middleware/cors.js";
import { getAuthContext, deleteAllUserTokens } from "../../../_middleware/auth.js";
import type { User, UserProfile } from "../../../_lib/types.js";

// =============================================================================
// Configuration
// =============================================================================

export const runtime = API_CONFIG.DEFAULT_RUNTIME;
export const maxDuration = API_CONFIG.DEFAULT_MAX_DURATION;

// =============================================================================
// Schema
// =============================================================================

const BanUserSchema = z.object({
  banned: z.boolean(),
  reason: z.string().optional(),
});

// =============================================================================
// Handler
// =============================================================================

export default async function handler(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const startTime = performance.now();

  // CORS handling
  const origin = getEffectiveOrigin(req);
  const preflightResponse = handleCorsPreflightIfNeeded(req, [
    "GET",
    "DELETE",
    "PATCH",
    "OPTIONS",
  ]);
  if (preflightResponse) return preflightResponse;

  if (!isAllowedOrigin(origin)) {
    return jsonError(validationError("Unauthorized origin"));
  }

  // Authenticate admin
  const auth = await getAuthContext(req);
  if (!auth.valid || !auth.isAdmin) {
    const response = jsonError(validationError("Admin access required"));
    return withCors(response, origin);
  }

  // Extract username from URL
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const targetUsername = pathParts[pathParts.length - 1]?.toLowerCase();

  if (!targetUsername) {
    const response = jsonError(validationError("Username is required"));
    return withCors(response, origin);
  }

  const redis = getRedis();
  const userKey = `${REDIS_KEYS.USER}${targetUsername}`;

  try {
    // GET - Get user details
    if (req.method === "GET") {
      logInfo(requestId, `Getting user details: ${targetUsername}`);

      const userData = await redis.get<User | string>(userKey);
      if (!userData) {
        const response = jsonError(notFound("User"));
        return withCors(response, origin);
      }

      const user = typeof userData === "string" ? JSON.parse(userData) : userData;

      // Check for password
      const passwordKey = `${REDIS_KEYS.PASSWORD_HASH}${targetUsername}`;
      const hasPassword = (await redis.exists(passwordKey)) === 1;

      const profile: UserProfile & { hasPassword: boolean } = {
        ...user,
        hasPassword,
      };

      logComplete(requestId, startTime, 200);
      const response = jsonSuccess({ user: profile });
      return withCors(response, origin);
    }

    // DELETE - Delete user
    if (req.method === "DELETE") {
      // Can't delete admin
      if (targetUsername === ADMIN_USERNAME) {
        const response = jsonError(forbidden("Cannot delete admin user"));
        return withCors(response, origin);
      }

      logInfo(requestId, `Deleting user: ${targetUsername}`);

      // Check if user exists
      const exists = await redis.exists(userKey);
      if (!exists) {
        const response = jsonError(notFound("User"));
        return withCors(response, origin);
      }

      // Delete user record
      await redis.del(userKey);

      // Delete password hash
      const passwordKey = `${REDIS_KEYS.PASSWORD_HASH}${targetUsername}`;
      await redis.del(passwordKey);

      // Delete all tokens
      const deletedTokens = await deleteAllUserTokens(targetUsername);

      logInfo(
        requestId,
        `User deleted: ${targetUsername}, tokens revoked: ${deletedTokens}`
      );
      logComplete(requestId, startTime, 200);

      const response = jsonSuccess({
        success: true,
        tokensRevoked: deletedTokens,
      });
      return withCors(response, origin);
    }

    // PATCH - Ban/unban user
    if (req.method === "PATCH") {
      // Can't ban admin
      if (targetUsername === ADMIN_USERNAME) {
        const response = jsonError(forbidden("Cannot ban admin user"));
        return withCors(response, origin);
      }

      // Parse body
      let body: z.infer<typeof BanUserSchema>;
      try {
        const rawBody = await req.json();
        const parsed = BanUserSchema.safeParse(rawBody);
        if (!parsed.success) {
          const response = jsonError(
            validationError("Invalid request body", parsed.error.format())
          );
          return withCors(response, origin);
        }
        body = parsed.data;
      } catch {
        const response = jsonError(validationError("Invalid JSON body"));
        return withCors(response, origin);
      }

      logInfo(
        requestId,
        `${body.banned ? "Banning" : "Unbanning"} user: ${targetUsername}`
      );

      const userData = await redis.get<User | string>(userKey);
      if (!userData) {
        const response = jsonError(notFound("User"));
        return withCors(response, origin);
      }

      const user = typeof userData === "string" ? JSON.parse(userData) : userData;

      if (body.banned) {
        user.banned = true;
        user.banReason = body.reason || "No reason provided";
        user.bannedAt = Date.now();

        // Revoke all tokens when banning
        await deleteAllUserTokens(targetUsername);
        logInfo(requestId, `User ${targetUsername} banned and tokens revoked`);
      } else {
        user.banned = false;
        delete user.banReason;
        delete user.bannedAt;
        logInfo(requestId, `User ${targetUsername} unbanned`);
      }

      await redis.set(userKey, JSON.stringify(user));

      logComplete(requestId, startTime, 200);
      const response = jsonSuccess({
        success: true,
        banned: body.banned,
      });
      return withCors(response, origin);
    }

    // Method not allowed
    const response = jsonError(validationError("Method not allowed"));
    return withCors(response, origin);
  } catch (error) {
    logError(requestId, "Admin user error", error);
    logComplete(requestId, startTime, 500);
    const response = jsonError(internalError());
    return withCors(response, origin);
  }
}
