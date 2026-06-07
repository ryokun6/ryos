import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { initLogger } from "./_logging.js";
import type { Redis } from "./redis.js";
import {
  resolveRequestAuth,
  type AuthenticatedRequestUser,
} from "./request-auth.js";

type ApiLogger = ReturnType<typeof initLogger>["logger"];

export const RYO_ADMIN_USERNAME = "ryo";

export function isRyoAdmin(
  username: string | null | undefined
): username is typeof RYO_ADMIN_USERNAME {
  return username === RYO_ADMIN_USERNAME;
}

/**
 * Require the authenticated apiHandler user to be ryo.
 * Sends 403 and returns false when access is denied.
 */
export function requireRyoAdminUser(
  user: AuthenticatedRequestUser | null | undefined,
  res: VercelResponse,
  logger: ApiLogger,
  startTime: number,
  options?: { message?: string }
): user is AuthenticatedRequestUser {
  if (!user || !isRyoAdmin(user.username)) {
    logger.warn("Admin access denied", { username: user?.username ?? null });
    logger.response(403, Date.now() - startTime);
    res.status(403).json({
      error: options?.message ?? "Forbidden - Admin access required",
    });
    return false;
  }
  return true;
}

/**
 * Resolve request auth and require the ryo admin account.
 * Sends 403 and returns null when access is denied.
 */
export async function requireRyoAdmin(
  req: VercelRequest,
  res: VercelResponse,
  redis: Redis,
  logger: ApiLogger,
  startTime: number,
  options?: { message?: string; allowExpired?: boolean }
): Promise<AuthenticatedRequestUser | null> {
  const authResolution = await resolveRequestAuth(req, redis, {
    required: false,
    allowExpired: options?.allowExpired ?? false,
  });

  const username = authResolution.user?.username ?? null;
  logger.info("Processing admin request", {
    username,
    hasToken: !!authResolution.user?.token,
  });

  if (authResolution.error || !authResolution.user || !isRyoAdmin(username)) {
    logger.warn("Admin access denied", {
      username,
      authError: authResolution.error,
    });
    logger.response(403, Date.now() - startTime);
    res.status(403).json({
      error: options?.message ?? "Forbidden - Admin access required",
    });
    return null;
  }

  return authResolution.user;
}
