import { Redis } from "@upstash/redis";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
} from "./utils/cors.js";
import { z } from "zod";

// Vercel Edge Function configuration
export const config = {
  runtime: "edge",
};

// Authentication constants
const AUTH_TOKEN_PREFIX = "chat:token:";
const TOKEN_LAST_PREFIX = "chat:token:last:";
const USER_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days (for tokens only)

// Applet sharing key prefix
const APPLET_SHARE_PREFIX = "applet:share:";

// Generate unique ID (128-bit random identifier encoded as hex, 32 chars)
const generateId = (): string => {
  // For edge runtime, use crypto.getRandomValues
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

// Validate authentication token function
async function validateAuthToken(
  redis: Redis,
  username: string | undefined | null,
  authToken: string | undefined | null
): Promise<{ valid: boolean; newToken?: string }> {
  if (!username || !authToken) {
    return { valid: false };
  }

  const normalizedUsername = username.toLowerCase();
  // 1) New multi-token scheme: chat:token:user:{username}:{token}
  const userScopedKey = `chat:token:user:${normalizedUsername}:${authToken}`;
  const exists = await redis.exists(userScopedKey);
  if (exists) {
    await redis.expire(userScopedKey, USER_TTL_SECONDS);
    return { valid: true };
  }

  // 2) Fallback to legacy single-token mapping (username -> token)
  const legacyKey = `${AUTH_TOKEN_PREFIX}${normalizedUsername}`;
  const storedToken = await redis.get(legacyKey);

  if (storedToken && storedToken === authToken) {
    await redis.expire(legacyKey, USER_TTL_SECONDS);
    return { valid: true };
  }

  return { valid: false };
}

// Request schemas
const SaveAppletRequestSchema = z.object({
  content: z.string().min(1),
  title: z.string().optional(),
  icon: z.string().optional(),
  name: z.string().optional(),
});

type SaveAppletRequest = z.infer<typeof SaveAppletRequestSchema>;

/**
 * Main handler
 */
export default async function handler(req: Request) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    const effectiveOrigin = getEffectiveOrigin(req);
    const resp = preflightIfNeeded(req, ["GET", "POST", "OPTIONS"], effectiveOrigin);
    if (resp) return resp;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Create Redis client inside handler (like lyrics.ts does)
  const redis = new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });

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
    // GET: Retrieve applet by ID
    if (req.method === "GET") {
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
      } catch (parseError) {
        console.error("Error parsing applet data:", parseError);
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
      const authResult = await validateAuthToken(redis, username, authToken);
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

      // Parse and validate request body
      let body;
      try {
        body = await req.json();
      } catch (parseError) {
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

      const { content, title, icon, name } = validation.data;

      // Generate unique ID
      const id = generateId();
      const key = `${APPLET_SHARE_PREFIX}${id}`;

      // Store applet data in Redis (no TTL - forever)
      const appletData = {
        content,
        title: title || undefined,
        icon: icon || undefined,
        name: name || undefined,
        createdAt: Date.now(),
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
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": effectiveOrigin,
          },
        }
      );
    }

    // Method not allowed (shouldn't reach here due to early return)
    return new Response("Method not allowed", {
      status: 405,
      headers: {
        "Access-Control-Allow-Origin": effectiveOrigin!,
        "Allow": "GET, POST, OPTIONS",
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
