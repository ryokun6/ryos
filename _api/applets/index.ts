/**
 * GET /api/applets - List applets
 * POST /api/applets - Create/save applet
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
import {
  getAuthContext,
  generateToken,
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

const SaveAppletSchema = z.object({
  content: z.string().min(1),
  title: z.string().optional(),
  icon: z.string().optional(),
  name: z.string().optional(),
  windowWidth: z.number().optional(),
  windowHeight: z.number().optional(),
  shareId: z.string().optional(), // If provided, update existing applet
});

// =============================================================================
// Helper
// =============================================================================

function generateAppletId(): string {
  return generateToken().substring(0, 32);
}

// =============================================================================
// Handler
// =============================================================================

export default async function handler(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const startTime = performance.now();
  
  // CORS handling
  const origin = getEffectiveOrigin(req);
  const preflightResponse = handleCorsPreflightIfNeeded(req, ["GET", "POST", "OPTIONS"]);
  if (preflightResponse) return preflightResponse;
  
  if (!isAllowedOrigin(origin)) {
    return jsonError(validationError("Unauthorized origin"));
  }

  const redis = getRedis();

  try {
    // GET - List applets
    if (req.method === "GET") {
      const url = new URL(req.url);
      const listAll = url.searchParams.get("list") === "true";
      const id = url.searchParams.get("id");

      // If specific ID requested, redirect to /api/applets/:id
      if (id && !listAll) {
        const key = `${REDIS_KEYS.APPLET_SHARE}${id}`;
        const appletData = await redis.get<Applet | string>(key);

        if (!appletData) {
          const response = jsonError(validationError("Applet not found"));
          return withCors(response, origin);
        }

        const applet = typeof appletData === "string" ? JSON.parse(appletData) : appletData;

        logComplete(requestId, startTime, 200);
        const response = jsonSuccess({ applet });
        return withCors(response, origin);
      }

      // List all applets
      logInfo(requestId, "Listing all applets");

      const appletIds: string[] = [];
      let cursor = 0;

      do {
        const [newCursor, keys] = await redis.scan(cursor, {
          match: `${REDIS_KEYS.APPLET_SHARE}*`,
          count: 100,
        });
        cursor = parseInt(String(newCursor));
        
        for (const key of keys) {
          const id = key.substring(REDIS_KEYS.APPLET_SHARE.length);
          if (id) appletIds.push(id);
        }
      } while (cursor !== 0);

      const applets: Array<{
        id: string;
        title?: string;
        name?: string;
        icon?: string;
        createdAt: number;
        featured: boolean;
        createdBy?: string;
      }> = [];

      if (appletIds.length > 0) {
        const appletKeys = appletIds.map((id) => `${REDIS_KEYS.APPLET_SHARE}${id}`);
        const appletsData = await redis.mget<(Applet | string | null)[]>(...appletKeys);

        for (let i = 0; i < appletsData.length; i++) {
          const data = appletsData[i];
          if (!data) continue;

          try {
            const parsed = typeof data === "string" ? JSON.parse(data) : data;
            applets.push({
              id: appletIds[i],
              title: parsed.title,
              name: parsed.name,
              icon: parsed.icon,
              createdAt: parsed.createdAt || 0,
              featured: parsed.featured || false,
              createdBy: parsed.createdBy,
            });
          } catch {
            continue;
          }
        }

        // Sort: featured first, then by createdAt
        applets.sort((a, b) => {
          if (a.featured && !b.featured) return -1;
          if (!a.featured && b.featured) return 1;
          return (b.createdAt || 0) - (a.createdAt || 0);
        });
      }

      logInfo(requestId, `Found ${applets.length} applets`);
      logComplete(requestId, startTime, 200);

      const response = jsonSuccess({ applets });
      return withCors(response, origin);
    }

    // POST - Save applet
    if (req.method === "POST") {
      // Authenticate
      const auth = await getAuthContext(req);
      if (!auth.valid || !auth.username) {
        const response = jsonError(validationError("Authentication required"));
        return withCors(response, origin);
      }

      // Parse body
      let body: z.infer<typeof SaveAppletSchema>;
      try {
        const rawBody = await req.json();
        const parsed = SaveAppletSchema.safeParse(rawBody);
        if (!parsed.success) {
          const response = jsonError(validationError("Invalid request body", parsed.error.format()));
          return withCors(response, origin);
        }
        body = parsed.data;
      } catch {
        const response = jsonError(validationError("Invalid JSON body"));
        return withCors(response, origin);
      }

      const { content, title, icon, name, windowWidth, windowHeight, shareId } = body;

      let id: string;
      let isUpdate = false;
      let existingCreatedBy: string | undefined;
      let existingFeatured: boolean | undefined;

      // Check if updating existing applet
      if (shareId) {
        const existingKey = `${REDIS_KEYS.APPLET_SHARE}${shareId}`;
        const existingData = await redis.get<Applet | string>(existingKey);

        if (existingData) {
          const parsed = typeof existingData === "string" ? JSON.parse(existingData) : existingData;
          
          // Check if author matches
          if (parsed.createdBy?.toLowerCase() === auth.username) {
            id = shareId;
            isUpdate = true;
            existingCreatedBy = parsed.createdBy;
            existingFeatured = parsed.featured;
          } else {
            id = generateAppletId();
          }
        } else {
          // Applet doesn't exist, reuse ID
          id = shareId;
        }
      } else {
        id = generateAppletId();
      }

      logInfo(requestId, `${isUpdate ? "Updating" : "Creating"} applet: ${id}`);

      const appletData: Applet = {
        id,
        content,
        title,
        icon,
        name,
        windowWidth,
        windowHeight,
        createdAt: Date.now(),
        createdBy: isUpdate && existingCreatedBy ? existingCreatedBy : auth.username,
        featured: isUpdate && existingFeatured !== undefined ? existingFeatured : false,
      };

      const key = `${REDIS_KEYS.APPLET_SHARE}${id}`;
      await redis.set(key, JSON.stringify(appletData));

      const shareUrl = `${origin}/applet-viewer/${id}`;

      logInfo(requestId, `Applet saved: ${id}`);
      logComplete(requestId, startTime, 200);

      const response = jsonSuccess({
        id,
        shareUrl,
        updated: isUpdate,
        createdAt: appletData.createdAt,
      });
      return withCors(response, origin);
    }

    // Method not allowed
    const response = jsonError(validationError("Method not allowed"));
    return withCors(response, origin);

  } catch (error) {
    logError(requestId, "Applets error", error);
    logComplete(requestId, startTime, 500);
    const response = jsonError(internalError());
    return withCors(response, origin);
  }
}
