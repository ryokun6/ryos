import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { validateAuth, generateAuthToken } from "./_utils/auth/index.js";
import * as RateLimit from "./_utils/_rate-limit.js";
import { getClientIp } from "./_utils/_rate-limit.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "./_utils/_cors.js";
import { Redis } from "@upstash/redis";
import { initLogger } from "./_utils/_logging.js";

export const runtime = "nodejs";
export const maxDuration = 30;

// Helper functions for Node.js runtime
function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

async function isAdmin(redis: Redis, username: string | null, token: string | null): Promise<boolean> {
  if (!username || !token) return false;
  if (username.toLowerCase() !== "ryo") return false;
  const authResult = await validateAuth(redis, username, token, { allowExpired: false });
  return authResult.valid;
}

// Rate limiting configuration
const RATE_LIMITS = {
  list: { windowSeconds: 60, limit: 60 },
  get: { windowSeconds: 60, limit: 120 },
  save: { windowSeconds: 60, limit: 20 },
  delete: { windowSeconds: 60, limit: 10 },
  patch: { windowSeconds: 60, limit: 10 },
};

// Applet sharing key prefix
const APPLET_SHARE_PREFIX = "applet:share:";

// Generate unique ID for applets
const generateId = (): string => generateAuthToken().substring(0, 32);

// Request schemas
const SaveAppletRequestSchema = z.object({
  content: z.string().min(1),
  title: z.string().optional(),
  icon: z.string().optional(),
  name: z.string().optional(),
  windowWidth: z.number().optional(),
  windowHeight: z.number().optional(),
  shareId: z.string().optional(),
});

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { requestId: _requestId, logger } = initLogger();
  const startTime = Date.now();
  const effectiveOrigin = getEffectiveOrigin(req);

  logger.request(req.method || "GET", req.url || "/api/share-applet", "share-applet");

  if (req.method === "OPTIONS") {
    res.setHeader("Content-Type", "application/json");
    setCorsHeaders(res, effectiveOrigin, { methods: ["GET", "POST", "DELETE", "PATCH", "OPTIONS"] });
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  if (!["GET", "POST", "DELETE", "PATCH"].includes(req.method || "")) {
    logger.response(405, Date.now() - startTime);
    res.status(405).send("Method not allowed");
    return;
  }

  res.setHeader("Content-Type", "application/json");
  setCorsHeaders(res, effectiveOrigin, { methods: ["GET", "POST", "DELETE", "PATCH", "OPTIONS"] });

  if (!isAllowedOrigin(effectiveOrigin)) {
    logger.warn("Unauthorized origin", { origin: effectiveOrigin });
    logger.response(403, Date.now() - startTime);
    res.status(403).send("Unauthorized");
    return;
  }

  const redis = createRedis();

  try {
    // GET: Retrieve applet by ID or list featured applets
    if (req.method === "GET") {
      const listParam = req.query.list as string | undefined;
      const ip = getClientIp(req);
      const rlConfig = listParam === "true" ? RATE_LIMITS.list : RATE_LIMITS.get;
      const rlKey = RateLimit.makeKey(["rl", "applet", listParam === "true" ? "list" : "get", "ip", ip]);
      const rlResult = await RateLimit.checkCounterLimit({
        key: rlKey,
        windowSeconds: rlConfig.windowSeconds,
        limit: rlConfig.limit,
      });
      
      if (!rlResult.allowed) {
        logger.warn("Rate limit exceeded", { ip });
        logger.response(429, Date.now() - startTime);
        res.setHeader("Retry-After", String(rlResult.resetSeconds));
        res.status(429).json({ error: "rate_limit_exceeded", limit: rlResult.limit, retryAfter: rlResult.resetSeconds });
        return;
      }
      
      if (listParam === "true") {
        const appletIds: string[] = [];
        let cursor = 0;
        
        do {
          const [newCursor, keys] = await redis.scan(cursor, { match: `${APPLET_SHARE_PREFIX}*`, count: 100 });
          cursor = parseInt(newCursor as unknown as string, 10);
          for (const key of keys) {
            const id = key.substring(APPLET_SHARE_PREFIX.length);
            if (id) appletIds.push(id);
          }
        } while (cursor !== 0);
        
        const applets: { id: string; title?: string; name?: string; icon?: string; createdAt: number; featured: boolean; createdBy?: string }[] = [];
        
        if (appletIds.length > 0) {
          const appletKeys = appletIds.map((id) => `${APPLET_SHARE_PREFIX}${id}`);
          const appletsData = await redis.mget(...appletKeys);
          
          for (let i = 0; i < appletsData.length; i++) {
            const appletData = appletsData[i];
            if (!appletData) continue;
            try {
              const parsed = typeof appletData === "string" ? JSON.parse(appletData) : appletData;
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
              continue;
            }
          }
          
          applets.sort((a, b) => {
            if (a.featured && !b.featured) return -1;
            if (!a.featured && b.featured) return 1;
            return (b.createdAt || 0) - (a.createdAt || 0);
          });
        }
        
        logger.info("Listed applets", { count: applets.length });
        logger.response(200, Date.now() - startTime);
        res.status(200).json({ applets });
        return;
      }
      
      const id = req.query.id as string | undefined;
      if (!id) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "Missing id parameter" });
        return;
      }

      const key = `${APPLET_SHARE_PREFIX}${id}`;
      const appletData = await redis.get(key);

      if (!appletData) {
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "Applet not found" });
        return;
      }

      let parsed;
      try {
        parsed = typeof appletData === "string" ? JSON.parse(appletData) : appletData;
      } catch (e) {
        logger.error("Error parsing applet data", e);
        logger.response(500, Date.now() - startTime);
        res.status(500).json({ error: "Invalid applet data" });
        return;
      }

      logger.info("Retrieved applet", { id });
      logger.response(200, Date.now() - startTime);
      res.status(200).json(parsed);
      return;
    }

    // POST: Save applet
    if (req.method === "POST") {
      const authHeader = req.headers.authorization;
      const usernameHeader = req.headers["x-username"] as string | undefined;
      const authToken = authHeader?.replace("Bearer ", "") || null;
      const username = usernameHeader || null;

      const authResult = await validateAuth(redis, username, authToken);
      if (!authResult.valid) {
        logger.response(401, Date.now() - startTime);
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const rlKey = RateLimit.makeKey(["rl", "applet", "save", "user", username || "unknown"]);
      const rlResult = await RateLimit.checkCounterLimit({
        key: rlKey,
        windowSeconds: RATE_LIMITS.save.windowSeconds,
        limit: RATE_LIMITS.save.limit,
      });
      
      if (!rlResult.allowed) {
        logger.warn("Rate limit exceeded", { username });
        logger.response(429, Date.now() - startTime);
        res.setHeader("Retry-After", String(rlResult.resetSeconds));
        res.status(429).json({ error: "rate_limit_exceeded", limit: rlResult.limit, retryAfter: rlResult.resetSeconds });
        return;
      }

      const validation = SaveAppletRequestSchema.safeParse(req.body);
      if (!validation.success) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "Invalid request body", details: validation.error.format() });
        return;
      }

      const { content, title, icon, name, windowWidth, windowHeight, shareId } = validation.data;

      let id: string;
      let isUpdate = false;
      let existingAppletData: { createdAt?: number; createdBy?: string; featured?: boolean } | null = null;

      if (shareId) {
        const existingKey = `${APPLET_SHARE_PREFIX}${shareId}`;
        const existingData = await redis.get(existingKey);

        if (existingData) {
          try {
            const parsed = typeof existingData === "string" ? JSON.parse(existingData) : existingData;
            if (parsed && parsed.createdBy && parsed.createdBy.toLowerCase() === username?.toLowerCase()) {
              id = shareId;
              isUpdate = true;
              existingAppletData = { createdAt: parsed.createdAt, createdBy: parsed.createdBy, featured: parsed.featured };
            } else {
              id = generateId();
            }
          } catch {
            id = generateId();
          }
        } else {
          id = shareId;
        }
      } else {
        id = generateId();
      }

      const key = `${APPLET_SHARE_PREFIX}${id}`;
      const appletData = {
        content,
        title: title || undefined,
        icon: icon || undefined,
        name: name || undefined,
        windowWidth: windowWidth || undefined,
        windowHeight: windowHeight || undefined,
        createdAt: Date.now(),
        createdBy: isUpdate && existingAppletData?.createdBy ? existingAppletData.createdBy : (username || undefined),
        featured: isUpdate && existingAppletData?.featured !== undefined ? existingAppletData.featured : undefined,
      };

      await redis.set(key, JSON.stringify(appletData));
      const shareUrl = `${effectiveOrigin}/applet-viewer/${id}`;

      logger.info("Saved applet", { id, isUpdate });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ id, shareUrl, updated: isUpdate, createdAt: appletData.createdAt });
      return;
    }

    // DELETE: Delete applet (admin only)
    if (req.method === "DELETE") {
      const authHeader = req.headers.authorization;
      const usernameHeader = req.headers["x-username"] as string | undefined;
      const authToken = authHeader?.replace("Bearer ", "") || null;
      const username = usernameHeader || null;

      const adminAccess = await isAdmin(redis, username, authToken);
      if (!adminAccess) {
        logger.response(403, Date.now() - startTime);
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const rlKey = RateLimit.makeKey(["rl", "applet", "delete", "user", username || "unknown"]);
      const rlResult = await RateLimit.checkCounterLimit({
        key: rlKey,
        windowSeconds: RATE_LIMITS.delete.windowSeconds,
        limit: RATE_LIMITS.delete.limit,
      });
      
      if (!rlResult.allowed) {
        logger.response(429, Date.now() - startTime);
        res.setHeader("Retry-After", String(rlResult.resetSeconds));
        res.status(429).json({ error: "rate_limit_exceeded", limit: rlResult.limit, retryAfter: rlResult.resetSeconds });
        return;
      }

      const id = req.query.id as string | undefined;
      if (!id) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "Missing id parameter" });
        return;
      }

      const key = `${APPLET_SHARE_PREFIX}${id}`;
      const deleted = await redis.del(key);

      if (deleted === 0) {
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "Applet not found" });
        return;
      }

      logger.info("Deleted applet", { id });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true });
      return;
    }

    // PATCH: Update applet (admin only)
    if (req.method === "PATCH") {
      const authHeader = req.headers.authorization;
      const usernameHeader = req.headers["x-username"] as string | undefined;
      const authToken = authHeader?.replace("Bearer ", "") || null;
      const username = usernameHeader || null;

      const adminAccess = await isAdmin(redis, username, authToken);
      if (!adminAccess) {
        logger.response(403, Date.now() - startTime);
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const rlKey = RateLimit.makeKey(["rl", "applet", "patch", "user", username || "unknown"]);
      const rlResult = await RateLimit.checkCounterLimit({
        key: rlKey,
        windowSeconds: RATE_LIMITS.patch.windowSeconds,
        limit: RATE_LIMITS.patch.limit,
      });
      
      if (!rlResult.allowed) {
        logger.response(429, Date.now() - startTime);
        res.setHeader("Retry-After", String(rlResult.resetSeconds));
        res.status(429).json({ error: "rate_limit_exceeded", limit: rlResult.limit, retryAfter: rlResult.resetSeconds });
        return;
      }

      const id = req.query.id as string | undefined;
      if (!id) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "Missing id parameter" });
        return;
      }

      const { featured } = req.body || {};
      if (typeof featured !== "boolean") {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "Invalid request body: featured must be boolean" });
        return;
      }

      const key = `${APPLET_SHARE_PREFIX}${id}`;
      const appletData = await redis.get(key);

      if (!appletData) {
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "Applet not found" });
        return;
      }

      const parsed = typeof appletData === "string" ? JSON.parse(appletData) : appletData;
      parsed.featured = featured;
      await redis.set(key, JSON.stringify(parsed));

      logger.info("Updated applet", { id, featured });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true, featured });
      return;
    }

    logger.response(405, Date.now() - startTime);
    res.status(405).json({ error: "Method not allowed" });

  } catch (error: unknown) {
    logger.error("Error in share-applet API", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    logger.response(500, Date.now() - startTime);
    res.status(500).json({ error: errorMessage });
  }
}
