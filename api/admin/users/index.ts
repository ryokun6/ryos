/**
 * GET /api/admin/users - List all users (admin only)
 */

import { getRedis } from "../../_lib/redis.js";
import { REDIS_KEYS, API_CONFIG } from "../../_lib/constants.js";
import { 
  validationError, 
  internalError,
} from "../../_lib/errors.js";
import { jsonSuccess, jsonError, withCors } from "../../_lib/response.js";
import { generateRequestId, logInfo, logError, logComplete } from "../../_lib/logging.js";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  handleCorsPreflightIfNeeded,
} from "../../_middleware/cors.js";
import {
  getAuthContext,
} from "../../_middleware/auth.js";
import type { User } from "../../_lib/types.js";

// =============================================================================
// Configuration
// =============================================================================

export const runtime = API_CONFIG.DEFAULT_RUNTIME;
export const maxDuration = API_CONFIG.DEFAULT_MAX_DURATION;

// =============================================================================
// Handler
// =============================================================================

export default async function handler(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const startTime = performance.now();
  
  // CORS handling
  const origin = getEffectiveOrigin(req);
  const preflightResponse = handleCorsPreflightIfNeeded(req, ["GET", "OPTIONS"]);
  if (preflightResponse) return preflightResponse;
  
  if (!isAllowedOrigin(origin)) {
    return jsonError(validationError("Unauthorized origin"));
  }

  if (req.method !== "GET") {
    const response = jsonError(validationError("Method not allowed"));
    return withCors(response, origin);
  }

  try {
    // Authenticate admin
    const auth = await getAuthContext(req);
    if (!auth.valid || !auth.isAdmin) {
      const response = jsonError(validationError("Admin access required"));
      return withCors(response, origin);
    }

    logInfo(requestId, "Listing all users");

    const redis = getRedis();
    const userKeys: string[] = [];
    let cursor = 0;

    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: `${REDIS_KEYS.USER}*`,
        count: 100,
      });
      cursor = parseInt(String(newCursor));
      userKeys.push(...keys);
    } while (cursor !== 0);

    const users: Array<{
      username: string;
      lastActive: number;
      banned?: boolean;
    }> = [];

    if (userKeys.length > 0) {
      const usersData = await redis.mget<(User | string | null)[]>(...userKeys);

      for (const data of usersData) {
        if (!data) continue;
        try {
          const user = typeof data === "string" ? JSON.parse(data) : data;
          users.push({
            username: user.username,
            lastActive: user.lastActive,
            banned: user.banned,
          });
        } catch {
          continue;
        }
      }

      // Sort by lastActive (most recent first)
      users.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
    }

    logInfo(requestId, `Found ${users.length} users`);
    logComplete(requestId, startTime, 200);

    const response = jsonSuccess({ users, count: users.length });
    return withCors(response, origin);

  } catch (error) {
    logError(requestId, "Admin list users error", error);
    logComplete(requestId, startTime, 500);
    const response = jsonError(internalError());
    return withCors(response, origin);
  }
}
