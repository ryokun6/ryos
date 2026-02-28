import { z } from "zod";
import { Redis } from "@upstash/redis";
import { validateAuth, generateAuthToken } from "../_utils/auth/index.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import type { CoreResponse } from "../_runtime/core-types.js";

const RATE_LIMITS = {
  list: { windowSeconds: 60, limit: 60 },
  get: { windowSeconds: 60, limit: 120 },
  save: { windowSeconds: 60, limit: 20 },
  delete: { windowSeconds: 60, limit: 10 },
  patch: { windowSeconds: 60, limit: 10 },
};

const APPLET_SHARE_PREFIX = "applet:share:";
const generateId = (): string => generateAuthToken().substring(0, 32);

const SaveAppletRequestSchema = z.object({
  content: z.string().min(1),
  title: z.string().optional(),
  icon: z.string().optional(),
  name: z.string().optional(),
  windowWidth: z.number().optional(),
  windowHeight: z.number().optional(),
  shareId: z.string().optional(),
});

interface ShareAppletCoreInput {
  redis: Redis;
  method: string | undefined;
  query: Record<string, string | string[] | undefined>;
  body: unknown;
  authHeader: string | undefined;
  usernameHeader: string | undefined;
  effectiveOrigin: string | null;
  clientIp: string;
}

function withRetryAfter(
  result: { resetSeconds: number; limit: number },
  status: number = 429
): CoreResponse {
  return {
    status,
    headers: {
      "Retry-After": String(result.resetSeconds),
    },
    body: {
      error: "rate_limit_exceeded",
      limit: result.limit,
      retryAfter: result.resetSeconds,
    },
  };
}

async function isAdmin(
  redis: Redis,
  username: string | null,
  token: string | null
): Promise<boolean> {
  if (!username || !token) return false;
  if (username.toLowerCase() !== "ryo") return false;
  const authResult = await validateAuth(redis, username, token, {
    allowExpired: false,
  });
  return authResult.valid;
}

async function handleGet(input: ShareAppletCoreInput): Promise<CoreResponse> {
  const listParam = input.query.list as string | undefined;
  const rlConfig = listParam === "true" ? RATE_LIMITS.list : RATE_LIMITS.get;
  const rlKey = RateLimit.makeKey([
    "rl",
    "applet",
    listParam === "true" ? "list" : "get",
    "ip",
    input.clientIp,
  ]);
  const rlResult = await RateLimit.checkCounterLimit({
    key: rlKey,
    windowSeconds: rlConfig.windowSeconds,
    limit: rlConfig.limit,
  });
  if (!rlResult.allowed) return withRetryAfter(rlResult);

  if (listParam === "true") {
    const appletIds: string[] = [];
    let cursor = 0;
    do {
      const [newCursor, keys] = await input.redis.scan(cursor, {
        match: `${APPLET_SHARE_PREFIX}*`,
        count: 100,
      });
      cursor = parseInt(newCursor as unknown as string, 10);
      for (const key of keys) {
        const id = key.substring(APPLET_SHARE_PREFIX.length);
        if (id) appletIds.push(id);
      }
    } while (cursor !== 0);

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
      const appletsData = await input.redis.mget(...appletKeys);
      for (let i = 0; i < appletsData.length; i++) {
        const appletData = appletsData[i];
        if (!appletData) continue;
        try {
          const parsed =
            typeof appletData === "string" ? JSON.parse(appletData) : appletData;
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

    return { status: 200, body: { applets } };
  }

  const id = input.query.id as string | undefined;
  if (!id) return { status: 400, body: { error: "Missing id parameter" } };
  const key = `${APPLET_SHARE_PREFIX}${id}`;
  const appletData = await input.redis.get(key);
  if (!appletData) return { status: 404, body: { error: "Applet not found" } };

  try {
    const parsed = typeof appletData === "string" ? JSON.parse(appletData) : appletData;
    return { status: 200, body: parsed };
  } catch {
    return { status: 500, body: { error: "Invalid applet data" } };
  }
}

async function handlePost(input: ShareAppletCoreInput): Promise<CoreResponse> {
  const authToken = input.authHeader?.replace("Bearer ", "") || null;
  const username = input.usernameHeader || null;

  const authResult = await validateAuth(input.redis, username, authToken);
  if (!authResult.valid) return { status: 401, body: { error: "Unauthorized" } };

  const rlKey = RateLimit.makeKey(["rl", "applet", "save", "user", username || "unknown"]);
  const rlResult = await RateLimit.checkCounterLimit({
    key: rlKey,
    windowSeconds: RATE_LIMITS.save.windowSeconds,
    limit: RATE_LIMITS.save.limit,
  });
  if (!rlResult.allowed) return withRetryAfter(rlResult);

  const validation = SaveAppletRequestSchema.safeParse(input.body);
  if (!validation.success) {
    return {
      status: 400,
      body: { error: "Invalid request body", details: validation.error.format() },
    };
  }

  const { content, title, icon, name, windowWidth, windowHeight, shareId } =
    validation.data;

  let id: string;
  let isUpdate = false;
  let existingAppletData: {
    createdAt?: number;
    createdBy?: string;
    featured?: boolean;
  } | null = null;

  if (shareId) {
    const existingKey = `${APPLET_SHARE_PREFIX}${shareId}`;
    const existingData = await input.redis.get(existingKey);

    if (existingData) {
      try {
        const parsed =
          typeof existingData === "string" ? JSON.parse(existingData) : existingData;
        if (
          parsed &&
          parsed.createdBy &&
          parsed.createdBy.toLowerCase() === username?.toLowerCase()
        ) {
          id = shareId;
          isUpdate = true;
          existingAppletData = {
            createdAt: parsed.createdAt,
            createdBy: parsed.createdBy,
            featured: parsed.featured,
          };
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
    createdBy:
      isUpdate && existingAppletData?.createdBy
        ? existingAppletData.createdBy
        : username || undefined,
    featured:
      isUpdate && existingAppletData?.featured !== undefined
        ? existingAppletData.featured
        : undefined,
  };

  await input.redis.set(key, JSON.stringify(appletData));
  const shareUrl = `${input.effectiveOrigin}/applet-viewer/${id}`;
  return {
    status: 200,
    body: { id, shareUrl, updated: isUpdate, createdAt: appletData.createdAt },
  };
}

async function handleDelete(input: ShareAppletCoreInput): Promise<CoreResponse> {
  const authToken = input.authHeader?.replace("Bearer ", "") || null;
  const username = input.usernameHeader || null;

  const adminAccess = await isAdmin(input.redis, username, authToken);
  if (!adminAccess) return { status: 403, body: { error: "Forbidden" } };

  const rlKey = RateLimit.makeKey([
    "rl",
    "applet",
    "delete",
    "user",
    username || "unknown",
  ]);
  const rlResult = await RateLimit.checkCounterLimit({
    key: rlKey,
    windowSeconds: RATE_LIMITS.delete.windowSeconds,
    limit: RATE_LIMITS.delete.limit,
  });
  if (!rlResult.allowed) return withRetryAfter(rlResult);

  const id = input.query.id as string | undefined;
  if (!id) return { status: 400, body: { error: "Missing id parameter" } };

  const key = `${APPLET_SHARE_PREFIX}${id}`;
  const deleted = await input.redis.del(key);
  if (deleted === 0) return { status: 404, body: { error: "Applet not found" } };
  return { status: 200, body: { success: true } };
}

async function handlePatch(input: ShareAppletCoreInput): Promise<CoreResponse> {
  const authToken = input.authHeader?.replace("Bearer ", "") || null;
  const username = input.usernameHeader || null;

  const adminAccess = await isAdmin(input.redis, username, authToken);
  if (!adminAccess) return { status: 403, body: { error: "Forbidden" } };

  const rlKey = RateLimit.makeKey([
    "rl",
    "applet",
    "patch",
    "user",
    username || "unknown",
  ]);
  const rlResult = await RateLimit.checkCounterLimit({
    key: rlKey,
    windowSeconds: RATE_LIMITS.patch.windowSeconds,
    limit: RATE_LIMITS.patch.limit,
  });
  if (!rlResult.allowed) return withRetryAfter(rlResult);

  const id = input.query.id as string | undefined;
  if (!id) return { status: 400, body: { error: "Missing id parameter" } };

  const { featured } = (input.body || {}) as { featured?: unknown };
  if (typeof featured !== "boolean") {
    return {
      status: 400,
      body: { error: "Invalid request body: featured must be boolean" },
    };
  }

  const key = `${APPLET_SHARE_PREFIX}${id}`;
  const appletData = await input.redis.get(key);
  if (!appletData) return { status: 404, body: { error: "Applet not found" } };

  const parsed = typeof appletData === "string" ? JSON.parse(appletData) : appletData;
  parsed.featured = featured;
  await input.redis.set(key, JSON.stringify(parsed));

  return { status: 200, body: { success: true, featured } };
}

export async function executeShareAppletCore(
  input: ShareAppletCoreInput
): Promise<CoreResponse> {
  if (input.method === "GET") return handleGet(input);
  if (input.method === "POST") return handlePost(input);
  if (input.method === "DELETE") return handleDelete(input);
  if (input.method === "PATCH") return handlePatch(input);
  return { status: 405, body: "Method not allowed" };
}
