/**
 * GET /api/admin/stats
 * Get system statistics (admin only)
 */

import { getRedis } from "../_lib/redis.js";
import { REDIS_KEYS, API_CONFIG } from "../_lib/constants.js";
import { 
  validationError, 
  internalError,
} from "../_lib/errors.js";
import { jsonSuccess, jsonError, withCors } from "../_lib/response.js";
import { generateRequestId, logInfo, logError, logComplete } from "../_lib/logging.js";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  handleCorsPreflightIfNeeded,
} from "../_middleware/cors.js";
import {
  getAuthContext,
} from "../_middleware/auth.js";
import {
  getAllRoomIds,
} from "../_services/index.js";

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

    logInfo(requestId, "Fetching admin stats");

    const redis = getRedis();

    // Count users
    let userCount = 0;
    let cursor = 0;
    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: `${REDIS_KEYS.USER}*`,
        count: 100,
      });
      cursor = parseInt(String(newCursor));
      userCount += keys.length;
    } while (cursor !== 0);

    // Count rooms
    const roomIds = await getAllRoomIds();
    const roomCount = roomIds.length;

    // Count applets
    let appletCount = 0;
    cursor = 0;
    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: `${REDIS_KEYS.APPLET_SHARE}*`,
        count: 100,
      });
      cursor = parseInt(String(newCursor));
      appletCount += keys.length;
    } while (cursor !== 0);

    const stats = {
      users: userCount,
      rooms: roomCount,
      applets: appletCount,
      timestamp: Date.now(),
    };

    logInfo(requestId, `Stats retrieved: ${JSON.stringify(stats)}`);
    logComplete(requestId, startTime, 200);

    const response = jsonSuccess(stats);
    return withCors(response, origin);

  } catch (error) {
    logError(requestId, "Admin stats error", error);
    logComplete(requestId, startTime, 500);
    const response = jsonError(internalError());
    return withCors(response, origin);
  }
}
