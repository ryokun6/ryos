/**
 * /api/share-applet
 * 
 * GET    - Retrieve applet by ID or list featured applets
 * POST   - Save applet
 * DELETE - Delete applet (admin only)
 * PATCH  - Update applet (admin only, for setting featured status)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import {
  isAdmin,
  createRedis,
  getEffectiveOriginNode,
  isAllowedOrigin,
  setCorsHeadersNode,
  handlePreflightNode,
  getClientIpNode,
} from "./_utils/middleware.js";
import { validateAuth, generateAuthToken } from "./_utils/auth/index.js";
import * as RateLimit from "./_utils/_rate-limit.js";

export const runtime = "nodejs";
export const maxDuration = 30;

// Rate limiting configuration
const RATE_LIMITS = {
  list: { windowSeconds: 60, limit: 60 },      // 60/min for listing
  get: { windowSeconds: 60, limit: 120 },      // 120/min for getting
  save: { windowSeconds: 60, limit: 20 },      // 20/min for saving
  delete: { windowSeconds: 60, limit: 10 },    // 10/min for delete (admin)
  patch: { windowSeconds: 60, limit: 10 },     // 10/min for patch (admin)
};

// Applet sharing key prefix
const APPLET_SHARE_PREFIX = "applet:share:";

// Generate unique ID for applets (uses shared token generator)
const generateId = (): string => generateAuthToken().substring(0, 32);

// Request schemas
const SaveAppletRequestSchema = z.object({
  content: z.string().min(1),
  title: z.string().optional(),
  icon: z.string().optional(),
  name: z.string().optional(),
  windowWidth: z.number().optional(),
  windowHeight: z.number().optional(),
  shareId: z.string().optional(), // Optional: if provided, update existing applet
});

function getHeader(req: VercelRequest, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

/**
 * Main handler
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const effectiveOrigin = getEffectiveOriginNode(req);

  // Handle CORS preflight
  if (handlePreflightNode(req, res, ["GET", "POST", "DELETE", "PATCH", "OPTIONS"])) {
    return;
  }

  setCorsHeadersNode(res, effectiveOrigin, ["GET", "POST", "DELETE", "PATCH", "OPTIONS"]);

  if (!isAllowedOrigin(effectiveOrigin)) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  if (req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE" && req.method !== "PATCH") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Create Redis client
  const redis = createRedis();

  try {
    // GET: Retrieve applet by ID or list featured applets
    if (req.method === "GET") {
      const listParam = req.query.list as string | undefined;
      
      // Rate limiting for GET requests
      const ip = getClientIpNode(req);
      const rlConfig = listParam === "true" ? RATE_LIMITS.list : RATE_LIMITS.get;
      const rlKey = RateLimit.makeKey(["rl", "applet", listParam === "true" ? "list" : "get", "ip", ip]);
      const rlResult = await RateLimit.checkCounterLimit({
        key: rlKey,
        windowSeconds: rlConfig.windowSeconds,
        limit: rlConfig.limit,
      });
      
      if (!rlResult.allowed) {
        res.setHeader("Retry-After", String(rlResult.resetSeconds));
        res.status(429).json({
          error: "rate_limit_exceeded",
          limit: rlResult.limit,
          retryAfter: rlResult.resetSeconds,
        });
        return;
      }
      
      // If list=true, return all applets
      if (listParam === "true") {
        // Scan Redis for all applet keys
        const appletIds: string[] = [];
        let cursor = 0;
        
        do {
          const [newCursor, keys] = await redis.scan(cursor, {
            match: `${APPLET_SHARE_PREFIX}*`,
            count: 100,
          });
          cursor = parseInt(newCursor as unknown as string, 10);
          
          // Extract IDs from keys (remove prefix)
          for (const key of keys) {
            const id = key.substring(APPLET_SHARE_PREFIX.length);
            if (id) {
              appletIds.push(id);
            }
          }
        } while (cursor !== 0);
        
        // Fetch applet metadata for all IDs
        const applets: {
          id: string;
          title?: string;
          name?: string;
          icon?: string;
          createdAt: number;
          featured: boolean;
          createdBy?: string;
        }[] = [];
        
        if (appletIds.length > 0) {
          const appletKeys = appletIds.map((id) => `${APPLET_SHARE_PREFIX}${id}`);
          const appletsData = await redis.mget(...appletKeys);
          
          for (let i = 0; i < appletsData.length; i++) {
            const appletData = appletsData[i];
            if (!appletData) continue;
            
            try {
              const parsed = typeof appletData === "string" 
                ? JSON.parse(appletData) 
                : appletData;
              
              applets.push({
                id: appletIds[i],
                title: parsed.title,
                name: parsed.name,
                icon: parsed.icon,
                createdAt: parsed.createdAt || 0,
                featured: parsed.featured || false,
                createdBy: parsed.createdBy || undefined,
              });
            } catch {
              // Skip invalid applet data
              continue;
            }
          }
          
          // Sort: featured first, then by createdAt (newest first)
          applets.sort((a, b) => {
            if (a.featured && !b.featured) return -1;
            if (!a.featured && b.featured) return 1;
            return (b.createdAt || 0) - (a.createdAt || 0);
          });
        }
        
        res.status(200).json({ applets });
        return;
      }
      
      // Otherwise, retrieve by ID
      const id = req.query.id as string | undefined;

      if (!id) {
        res.status(400).json({ error: "Missing id parameter" });
        return;
      }

      const key = `${APPLET_SHARE_PREFIX}${id}`;
      const appletData = await redis.get(key);

      if (!appletData) {
        res.status(404).json({ error: "Applet not found" });
        return;
      }

      // Parse stored data (could be string or object)
      let parsed;
      try {
        parsed =
          typeof appletData === "string"
            ? JSON.parse(appletData)
            : appletData;
      } catch (e) {
        console.error("Error parsing applet data:", e);
        res.status(500).json({ error: "Invalid applet data" });
        return;
      }

      res.status(200).json(parsed);
      return;
    }

    // POST: Save applet
    if (req.method === "POST") {
      // Extract authentication from headers
      const authHeader = getHeader(req, "authorization");
      const usernameHeader = getHeader(req, "x-username");

      const authToken = authHeader?.replace("Bearer ", "") || null;
      const username = usernameHeader || null;

      // Validate authentication
      const authResult = await validateAuth(redis, username, authToken);
      if (!authResult.valid) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Rate limiting for POST (save) - by user
      const rlKey = RateLimit.makeKey(["rl", "applet", "save", "user", username || "unknown"]);
      const rlResult = await RateLimit.checkCounterLimit({
        key: rlKey,
        windowSeconds: RATE_LIMITS.save.windowSeconds,
        limit: RATE_LIMITS.save.limit,
      });
      
      if (!rlResult.allowed) {
        res.setHeader("Retry-After", String(rlResult.resetSeconds));
        res.status(429).json({
          error: "rate_limit_exceeded",
          limit: rlResult.limit,
          retryAfter: rlResult.resetSeconds,
        });
        return;
      }

      // Parse and validate request body
      const body = req.body;
      const validation = SaveAppletRequestSchema.safeParse(body);

      if (!validation.success) {
        res.status(400).json({
          error: "Invalid request body",
          details: validation.error.format(),
        });
        return;
      }
      const { content, title, icon, name, windowWidth, windowHeight, shareId } = validation.data;

      let id: string;
      let isUpdate = false;
      let existingAppletData: {
        createdAt?: number;
        createdBy?: string;
        featured?: boolean;
      } | null = null;

      // If shareId is provided, check if we can update existing applet
      if (shareId) {
        const existingKey = `${APPLET_SHARE_PREFIX}${shareId}`;
        const existingData = await redis.get(existingKey);

        if (existingData) {
          // Parse existing applet data
          let parsed;
          try {
            parsed =
              typeof existingData === "string"
                ? JSON.parse(existingData)
                : existingData;

            // Check if author matches
            if (parsed && parsed.createdBy && parsed.createdBy.toLowerCase() === username?.toLowerCase()) {
              // Author matches, update existing applet
              id = shareId;
              isUpdate = true;
              existingAppletData = {
                createdAt: parsed.createdAt,
                createdBy: parsed.createdBy,
                featured: parsed.featured,
              };
            } else {
              // Author doesn't match or no author, create new share
              id = generateId();
            }
          } catch {
            // If we can't parse, we can't verify author - generate new ID for security
            id = generateId();
          }
        } else {
          // Applet doesn't exist on server, but client has shareId - reuse it to recreate
          // This handles cases where the applet was deleted from server but local file still has the ID
          id = shareId;
        }
      } else {
        // No shareId provided, generate new ID
        id = generateId();
      }

      const key = `${APPLET_SHARE_PREFIX}${id}`;

      // Prepare applet data
      const appletData: {
        content: string;
        title?: string;
        icon?: string;
        name?: string;
        windowWidth?: number;
        windowHeight?: number;
        createdAt: number;
        createdBy?: string;
        featured?: boolean;
      } = {
        content,
        title: title || undefined,
        icon: icon || undefined,
        name: name || undefined,
        windowWidth: windowWidth || undefined,
        windowHeight: windowHeight || undefined,
        // Always update createdAt to current time for simpler update detection
        // This makes it easier to detect updates by comparing createdAt
        createdAt: Date.now(),
        createdBy: isUpdate && existingAppletData?.createdBy
          ? existingAppletData.createdBy
          : (username || undefined),
        featured:
          isUpdate && existingAppletData?.featured !== undefined
            ? existingAppletData.featured
            : undefined,
      };

      try {
        await redis.set(key, JSON.stringify(appletData));
      } catch (redisError) {
        console.error("Redis write error:", redisError);
        res.status(500).json({ error: "Failed to save applet" });
        return;
      }

      // Generate share URL
      const shareUrl = `${effectiveOrigin}/applet-viewer/${id}`;

      res.status(200).json({
        id,
        shareUrl,
        updated: isUpdate,
        createdAt: appletData.createdAt, // Return createdAt so client can update local metadata
      });
      return;
    }

    // DELETE: Delete applet (admin only - ryo)
    if (req.method === "DELETE") {
      const authHeader = getHeader(req, "authorization");
      const usernameHeader = getHeader(req, "x-username");

      const authToken = authHeader?.replace("Bearer ", "") || null;
      const username = usernameHeader || null;

      // Check if user is admin (ryo) with valid token
      const adminAccess = await isAdmin(redis, username, authToken);
      if (!adminAccess) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      // Rate limiting for DELETE - by admin user
      const rlKey = RateLimit.makeKey(["rl", "applet", "delete", "user", username || "unknown"]);
      const rlResult = await RateLimit.checkCounterLimit({
        key: rlKey,
        windowSeconds: RATE_LIMITS.delete.windowSeconds,
        limit: RATE_LIMITS.delete.limit,
      });
      
      if (!rlResult.allowed) {
        res.setHeader("Retry-After", String(rlResult.resetSeconds));
        res.status(429).json({
          error: "rate_limit_exceeded",
          limit: rlResult.limit,
          retryAfter: rlResult.resetSeconds,
        });
        return;
      }

      const id = req.query.id as string | undefined;

      if (!id) {
        res.status(400).json({ error: "Missing id parameter" });
        return;
      }

      const key = `${APPLET_SHARE_PREFIX}${id}`;
      const deleted = await redis.del(key);

      if (deleted === 0) {
        res.status(404).json({ error: "Applet not found" });
        return;
      }

      res.status(200).json({ success: true });
      return;
    }

    // PATCH: Update applet (admin only - ryo) - for setting featured status
    if (req.method === "PATCH") {
      const authHeader = getHeader(req, "authorization");
      const usernameHeader = getHeader(req, "x-username");

      const authToken = authHeader?.replace("Bearer ", "") || null;
      const username = usernameHeader || null;

      // Check if user is admin (ryo) with valid token
      const adminAccess = await isAdmin(redis, username, authToken);
      if (!adminAccess) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      // Rate limiting for PATCH - by admin user
      const rlKey = RateLimit.makeKey(["rl", "applet", "patch", "user", username || "unknown"]);
      const rlResult = await RateLimit.checkCounterLimit({
        key: rlKey,
        windowSeconds: RATE_LIMITS.patch.windowSeconds,
        limit: RATE_LIMITS.patch.limit,
      });
      
      if (!rlResult.allowed) {
        res.setHeader("Retry-After", String(rlResult.resetSeconds));
        res.status(429).json({
          error: "rate_limit_exceeded",
          limit: rlResult.limit,
          retryAfter: rlResult.resetSeconds,
        });
        return;
      }

      const id = req.query.id as string | undefined;

      if (!id) {
        res.status(400).json({ error: "Missing id parameter" });
        return;
      }

      // Parse request body
      const body = req.body;
      const { featured } = body || {};
      if (typeof featured !== "boolean") {
        res.status(400).json({ error: "Invalid request body: featured must be boolean" });
        return;
      }

      const key = `${APPLET_SHARE_PREFIX}${id}`;
      const appletData = await redis.get(key);

      if (!appletData) {
        res.status(404).json({ error: "Applet not found" });
        return;
      }

      // Parse and update
      const parsed = typeof appletData === "string" 
        ? JSON.parse(appletData) 
        : appletData;
      
      parsed.featured = featured;

      await redis.set(key, JSON.stringify(parsed));

      res.status(200).json({ success: true, featured });
      return;
    }
  } catch (error: unknown) {
    console.error("Error in share-applet API:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";

    res.status(500).json({ error: errorMessage });
  }
}
