/**
 * GET /api/applets/:id - Get applet
 * DELETE /api/applets/:id - Delete applet (admin only)
 * PATCH /api/applets/:id - Update applet (admin only, for featured status)
 */

import { z } from "zod";
import { getRedis } from "../_lib/redis.js";
import { REDIS_KEYS, API_CONFIG } from "../_lib/constants.js";
import { 
  validationError, 
  notFound,
  forbidden,
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
import type { Applet } from "../_lib/types.js";

// =============================================================================
// Configuration
// =============================================================================

export const runtime = API_CONFIG.EDGE_RUNTIME;
export const maxDuration = API_CONFIG.DEFAULT_MAX_DURATION;

// =============================================================================
// Schema
// =============================================================================

const UpdateAppletSchema = z.object({
  featured: z.boolean(),
});

// =============================================================================
// Handler
// =============================================================================

export default async function handler(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const startTime = performance.now();
  
  // CORS handling
  const origin = getEffectiveOrigin(req);
  const preflightResponse = handleCorsPreflightIfNeeded(req, ["GET", "DELETE", "PATCH", "OPTIONS"]);
  if (preflightResponse) return preflightResponse;
  
  if (!isAllowedOrigin(origin)) {
    return jsonError(validationError("Unauthorized origin"));
  }

  // Extract applet ID from URL
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const id = pathParts[pathParts.length - 1];

  if (!id) {
    const response = jsonError(validationError("Applet ID is required"));
    return withCors(response, origin);
  }

  const redis = getRedis();
  const key = `${REDIS_KEYS.APPLET_SHARE}${id}`;

  try {
    // GET - Get applet
    if (req.method === "GET") {
      logInfo(requestId, `Getting applet: ${id}`);

      const appletData = await redis.get<Applet | string>(key);

      if (!appletData) {
        const response = jsonError(notFound("Applet"));
        return withCors(response, origin);
      }

      const applet = typeof appletData === "string" ? JSON.parse(appletData) : appletData;

      logComplete(requestId, startTime, 200);
      const response = jsonSuccess(applet);
      return withCors(response, origin);
    }

    // DELETE - Delete applet (admin only)
    if (req.method === "DELETE") {
      const auth = await getAuthContext(req);
      if (!auth.valid || !auth.isAdmin) {
        const response = jsonError(forbidden("Admin access required"));
        return withCors(response, origin);
      }

      logInfo(requestId, `Deleting applet: ${id}`);

      const deleted = await redis.del(key);

      if (deleted === 0) {
        const response = jsonError(notFound("Applet"));
        return withCors(response, origin);
      }

      logInfo(requestId, `Applet deleted: ${id}`);
      logComplete(requestId, startTime, 200);

      const response = jsonSuccess({ success: true });
      return withCors(response, origin);
    }

    // PATCH - Update applet (admin only, for featured status)
    if (req.method === "PATCH") {
      const auth = await getAuthContext(req);
      if (!auth.valid || !auth.isAdmin) {
        const response = jsonError(forbidden("Admin access required"));
        return withCors(response, origin);
      }

      // Parse body
      let body: z.infer<typeof UpdateAppletSchema>;
      try {
        const rawBody = await req.json();
        const parsed = UpdateAppletSchema.safeParse(rawBody);
        if (!parsed.success) {
          const response = jsonError(validationError("Invalid request body", parsed.error.format()));
          return withCors(response, origin);
        }
        body = parsed.data;
      } catch {
        const response = jsonError(validationError("Invalid JSON body"));
        return withCors(response, origin);
      }

      logInfo(requestId, `Updating applet: ${id}, featured: ${body.featured}`);

      const appletData = await redis.get<Applet | string>(key);

      if (!appletData) {
        const response = jsonError(notFound("Applet"));
        return withCors(response, origin);
      }

      const applet = typeof appletData === "string" ? JSON.parse(appletData) : appletData;
      applet.featured = body.featured;

      await redis.set(key, JSON.stringify(applet));

      logInfo(requestId, `Applet updated: ${id}`);
      logComplete(requestId, startTime, 200);

      const response = jsonSuccess({ success: true, featured: body.featured });
      return withCors(response, origin);
    }

    // Method not allowed
    const response = jsonError(validationError("Method not allowed"));
    return withCors(response, origin);

  } catch (error) {
    logError(requestId, "Applet error", error);
    logComplete(requestId, startTime, 500);
    const response = jsonError(internalError());
    return withCors(response, origin);
  }
}
