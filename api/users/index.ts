/**
 * GET /api/users
 * Search users by username
 */

import { z } from "zod";
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
import type { User } from "../_lib/types.js";

// =============================================================================
// Configuration
// =============================================================================

export const runtime = API_CONFIG.EDGE_RUNTIME;
export const maxDuration = API_CONFIG.DEFAULT_MAX_DURATION;

// =============================================================================
// Schema
// =============================================================================

const SearchSchema = z.object({
  search: z.string().min(2).optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
});

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
    // Parse query params
    const url = new URL(req.url);
    const queryParams: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });

    const parsed = SearchSchema.safeParse(queryParams);
    if (!parsed.success) {
      const response = jsonError(validationError("Invalid query parameters", parsed.error.format()));
      return withCors(response, origin);
    }

    const { search, limit } = parsed.data;

    logInfo(requestId, `Searching users`, { search, limit });

    // If no search query or too short, return empty
    if (!search || search.length < 2) {
      const response = jsonSuccess({ users: [], count: 0 });
      return withCors(response, origin);
    }

    const redis = getRedis();
    const users: User[] = [];
    let cursor = 0;
    const pattern = `${REDIS_KEYS.USER}*${search.toLowerCase()}*`;

    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: pattern,
        count: 100,
      });

      cursor = parseInt(String(newCursor));

      if (keys.length > 0) {
        const usersData = await redis.mget<(User | string | null)[]>(...keys);
        const foundUsers = usersData
          .map((user) => {
            try {
              if (!user) return null;
              return typeof user === "string" ? JSON.parse(user) : user;
            } catch {
              return null;
            }
          })
          .filter((u): u is User => u !== null);

        users.push(...foundUsers);

        if (users.length >= limit) {
          break;
        }
      }
    } while (cursor !== 0 && users.length < limit);

    const limitedUsers = users.slice(0, limit);

    // Return only public user info (strip sensitive data)
    const publicUsers = limitedUsers.map(user => ({
      username: user.username,
      lastActive: user.lastActive,
    }));

    logInfo(requestId, `Found ${publicUsers.length} users matching "${search}"`);
    logComplete(requestId, startTime, 200);

    const response = jsonSuccess({
      users: publicUsers,
      count: publicUsers.length,
    });
    return withCors(response, origin);

  } catch (error) {
    logError(requestId, "User search error", error);
    logComplete(requestId, startTime, 500);
    const response = jsonError(internalError());
    return withCors(response, origin);
  }
}
