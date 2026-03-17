/**
 * Middleware utilities for API endpoints (Node.js runtime only)
 * 
 * Re-exports commonly used utilities for convenience.
 */

import type { Redis } from "./redis.js";
import { validateAuth } from "./auth/index.js";

// ============================================================================
// Re-exports
// ============================================================================

export { createRedis } from "./redis.js";
export { getClientIp, getClientIpFromVercel } from "./_rate-limit.js";
export { getEffectiveOrigin, isAllowedOrigin, handlePreflight, setCorsHeaders } from "./_cors.js";
export type { SetCorsHeadersOptions } from "./_cors.js";
export { extractAuth, extractAuthNormalized } from "./auth/index.js";
export type { AuthenticatedUser } from "./auth/index.js";
export { apiHandler } from "./api-handler.js";
export type { ApiHandlerOptions, ApiHandlerContext } from "./api-handler.js";

export {
  REDIS_PREFIXES,
  TTL,
  RATE_LIMIT_TIERS,
  PASSWORD,
  VALIDATION,
  TOKEN,
} from "./constants.js";

// ============================================================================
// Admin Check
// ============================================================================

/**
 * Check if a user is admin (ryo) with a valid token
 */
export async function isAdmin(
  redis: Redis,
  username: string | null,
  token: string | null
): Promise<boolean> {
  if (!username || !token) return false;
  if (username.toLowerCase() !== "ryo") return false;
  
  const authResult = await validateAuth(redis, username, token, { allowExpired: false });
  return authResult.valid;
}

