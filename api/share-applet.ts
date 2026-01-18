import { z } from "zod";
import {
  isAdmin,
  createRedis,
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
  getClientIp,
} from "./_utils/middleware.js";
import { validateAuth, generateAuthToken } from "./_utils/auth/index.js";
import * as RateLimit from "./_utils/_rate-limit.js";

// Vercel Edge Function configuration
export const config = {
  runtime: "edge",
};

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

/**
 * Main handler
 */
export default async function handler(req: Request) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    const effectiveOrigin = getEffectiveOrigin(req);
    const resp = preflightIfNeeded(req, ["GET", "POST", "DELETE", "PATCH", "OPTIONS"], effectiveOrigin);
    if (resp) return resp;
  }

  if (req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE" && req.method !== "PATCH" && req.method !== "OPTIONS") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Create Redis client
  const redis = createRedis();

  // Parse and validate request
  let effectiveOrigin: string | null;
  try {
    effectiveOrigin = getEffectiveOrigin(req);
    if (!isAllowedOrigin(effectiveOrigin)) {
      return new Response("Unauthorized", { status: 403 });
    }
  } catch {
    return new Response("Unauthorized", { status: 403 });
  }

  try {
    // GET: Retrieve applet by ID or list featured applets
    if (req.method === "GET") {
      const url = new URL(req.url);
      const listParam = url.searchParams.get("list");
      
      // Rate limiting for GET requests
      const ip = getClientIp(req);
      const rlConfig = listParam === "true" ? RATE_LIMITS.list : RATE_LIMITS.get;
      const rlKey = RateLimit.makeKey(["rl", "applet", listParam === "true" ? "list" : "get", "ip", ip]);
      const rlResult = await RateLimit.checkCounterLimit({
        key: rlKey,
        windowSeconds: rlConfig.windowSeconds,
        limit: rlConfig.limit,
      });
      
      if (!rlResult.allowed) {
        return new Response(
          JSON.stringify({
            error: "rate_limit_exceeded",
            limit: rlResult.limit,
            retryAfter: rlResult.resetSeconds,
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
              "Retry-After": String(rlResult.resetSeconds),
            },
          }
        );
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
        
        return new Response(JSON.stringify({ applets }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": effectiveOrigin!,
          },
        });
      }
      
      // Otherwise, retrieve by ID
      const id = url.searchParams.get("id");

      if (!id) {
        return new Response(
          JSON.stringify({ error: "Missing id parameter" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      const key = `${APPLET_SHARE_PREFIX}${id}`;
      const appletData = await redis.get(key);

      if (!appletData) {
        return new Response(
          JSON.stringify({ error: "Applet not found" }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
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
        return new Response(
          JSON.stringify({ error: "Invalid applet data" }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      return new Response(JSON.stringify(parsed), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": effectiveOrigin!,
        },
      });
    }

    // POST: Save applet
    if (req.method === "POST") {
      // Extract authentication from headers
      const authHeader = req.headers.get("Authorization");
      const usernameHeader = req.headers.get("X-Username");

      const authToken = authHeader?.replace("Bearer ", "") || null;
      const username = usernameHeader || null;

      // Validate authentication
      const authResult = await validateAuth(redis, username, authToken);
      if (!authResult.valid) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      // Rate limiting for POST (save) - by user
      const rlKey = RateLimit.makeKey(["rl", "applet", "save", "user", username || "unknown"]);
      const rlResult = await RateLimit.checkCounterLimit({
        key: rlKey,
        windowSeconds: RATE_LIMITS.save.windowSeconds,
        limit: RATE_LIMITS.save.limit,
      });
      
      if (!rlResult.allowed) {
        return new Response(
          JSON.stringify({
            error: "rate_limit_exceeded",
            limit: rlResult.limit,
            retryAfter: rlResult.resetSeconds,
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
              "Retry-After": String(rlResult.resetSeconds),
            },
          }
        );
      }

      // Parse and validate request body
      let body;
      try {
        body = await req.json();
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid JSON in request body" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      const validation = SaveAppletRequestSchema.safeParse(body);

      if (!validation.success) {
        return new Response(
          JSON.stringify({
            error: "Invalid request body",
            details: validation.error.format(),
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
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
        return new Response(
          JSON.stringify({ error: "Failed to save applet" }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      // Generate share URL
      const shareUrl = `${effectiveOrigin}/applet-viewer/${id}`;

      return new Response(
        JSON.stringify({
          id,
          shareUrl,
          updated: isUpdate,
          createdAt: appletData.createdAt, // Return createdAt so client can update local metadata
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": effectiveOrigin || "*",
          },
        }
      );
    }

    // DELETE: Delete applet (admin only - ryo)
    if (req.method === "DELETE") {
      const authHeader = req.headers.get("Authorization");
      const usernameHeader = req.headers.get("X-Username");

      const authToken = authHeader?.replace("Bearer ", "") || null;
      const username = usernameHeader || null;

      // Check if user is admin (ryo) with valid token
      const adminAccess = await isAdmin(redis, username, authToken);
      if (!adminAccess) {
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          {
            status: 403,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      // Rate limiting for DELETE - by admin user
      const rlKey = RateLimit.makeKey(["rl", "applet", "delete", "user", username || "unknown"]);
      const rlResult = await RateLimit.checkCounterLimit({
        key: rlKey,
        windowSeconds: RATE_LIMITS.delete.windowSeconds,
        limit: RATE_LIMITS.delete.limit,
      });
      
      if (!rlResult.allowed) {
        return new Response(
          JSON.stringify({
            error: "rate_limit_exceeded",
            limit: rlResult.limit,
            retryAfter: rlResult.resetSeconds,
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
              "Retry-After": String(rlResult.resetSeconds),
            },
          }
        );
      }

      const url = new URL(req.url);
      const id = url.searchParams.get("id");

      if (!id) {
        return new Response(
          JSON.stringify({ error: "Missing id parameter" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      const key = `${APPLET_SHARE_PREFIX}${id}`;
      const deleted = await redis.del(key);

      if (deleted === 0) {
        return new Response(
          JSON.stringify({ error: "Applet not found" }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": effectiveOrigin!,
          },
        }
      );
    }

    // PATCH: Update applet (admin only - ryo) - for setting featured status
    if (req.method === "PATCH") {
      const authHeader = req.headers.get("Authorization");
      const usernameHeader = req.headers.get("X-Username");

      const authToken = authHeader?.replace("Bearer ", "") || null;
      const username = usernameHeader || null;

      // Check if user is admin (ryo) with valid token
      const adminAccess = await isAdmin(redis, username, authToken);
      if (!adminAccess) {
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          {
            status: 403,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      // Rate limiting for PATCH - by admin user
      const rlKey = RateLimit.makeKey(["rl", "applet", "patch", "user", username || "unknown"]);
      const rlResult = await RateLimit.checkCounterLimit({
        key: rlKey,
        windowSeconds: RATE_LIMITS.patch.windowSeconds,
        limit: RATE_LIMITS.patch.limit,
      });
      
      if (!rlResult.allowed) {
        return new Response(
          JSON.stringify({
            error: "rate_limit_exceeded",
            limit: rlResult.limit,
            retryAfter: rlResult.resetSeconds,
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
              "Retry-After": String(rlResult.resetSeconds),
            },
          }
        );
      }

      const url = new URL(req.url);
      const id = url.searchParams.get("id");

      if (!id) {
        return new Response(
          JSON.stringify({ error: "Missing id parameter" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      // Parse request body
      let body;
      try {
        body = await req.json();
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid JSON in request body" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      const { featured } = body;
      if (typeof featured !== "boolean") {
        return new Response(
          JSON.stringify({ error: "Invalid request body: featured must be boolean" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      const key = `${APPLET_SHARE_PREFIX}${id}`;
      const appletData = await redis.get(key);

      if (!appletData) {
        return new Response(
          JSON.stringify({ error: "Applet not found" }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      // Parse and update
      const parsed = typeof appletData === "string" 
        ? JSON.parse(appletData) 
        : appletData;
      
      parsed.featured = featured;

      await redis.set(key, JSON.stringify(parsed));

      return new Response(
        JSON.stringify({ success: true, featured }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": effectiveOrigin!,
          },
        }
      );
    }

    // Method not allowed (shouldn't reach here due to early return)
    return new Response("Method not allowed", {
      status: 405,
      headers: {
        "Access-Control-Allow-Origin": effectiveOrigin!,
        "Allow": "GET, POST, DELETE, PATCH, OPTIONS",
      },
    });
  } catch (error: unknown) {
    console.error("Error in share-applet API:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";

    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": effectiveOrigin!,
        },
      }
    );
  }
}