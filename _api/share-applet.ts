import { z } from "zod";
import { generateAuthToken } from "./_utils/auth/index.js";
import { createApiHandler } from "./_utils/handler.js";
import * as RateLimit from "./_utils/_rate-limit.js";

export const runtime = "nodejs";
export const maxDuration = 30;

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

type SharedAppletRecord = {
  content?: string;
  title?: string;
  name?: string;
  icon?: string;
  windowWidth?: number;
  windowHeight?: number;
  createdAt?: number;
  featured?: boolean;
  createdBy?: string;
};

type AppletListItem = {
  id: string;
  title?: string;
  name?: string;
  icon?: string;
  createdAt: number;
  featured: boolean;
  createdBy?: string;
};

export default createApiHandler(
  {
    operation: "share-applet",
    methods: ["GET", "POST", "DELETE", "PATCH"],
  },
  async (_req, _res, ctx): Promise<void> => {
    try {
      if (ctx.method === "GET") {
        const listParam = ctx.getQueryParam("list");
        const rlConfig = listParam === "true" ? RATE_LIMITS.list : RATE_LIMITS.get;
        const rlKey = RateLimit.makeKey([
          "rl",
          "applet",
          listParam === "true" ? "list" : "get",
          "ip",
          ctx.ip,
        ]);
        const rlResult = await RateLimit.checkCounterLimit({
          key: rlKey,
          windowSeconds: rlConfig.windowSeconds,
          limit: rlConfig.limit,
        });

        if (!rlResult.allowed) {
          ctx.logger.warn("Rate limit exceeded", { ip: ctx.ip });
          ctx.response.tooManyRequests("rate_limit_exceeded", {
            limit: rlResult.limit,
            retryAfter: rlResult.resetSeconds,
          });
          return;
        }

        if (listParam === "true") {
          const appletIds: string[] = [];
          let cursor = 0;

          do {
            const [newCursor, keys] = await ctx.redis.scan(cursor, {
              match: `${APPLET_SHARE_PREFIX}*`,
              count: 100,
            });
            cursor = parseInt(newCursor as unknown as string, 10);
            for (const key of keys) {
              const id = key.substring(APPLET_SHARE_PREFIX.length);
              if (id) appletIds.push(id);
            }
          } while (cursor !== 0);

          const applets: AppletListItem[] = [];
          if (appletIds.length > 0) {
            const appletKeys = appletIds.map((id) => `${APPLET_SHARE_PREFIX}${id}`);
            const appletsData = await ctx.redis.mget(...appletKeys);

            for (let i = 0; i < appletsData.length; i++) {
              const appletData = appletsData[i];
              if (!appletData) continue;

              try {
                const parsed = (typeof appletData === "string"
                  ? JSON.parse(appletData)
                  : appletData) as SharedAppletRecord;

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

          ctx.logger.info("Listed applets", { count: applets.length });
          ctx.response.ok({ applets });
          return;
        }

        const id = ctx.getQueryParam("id");
        if (!id) {
          ctx.response.badRequest("Missing id parameter");
          return;
        }

        const key = `${APPLET_SHARE_PREFIX}${id}`;
        const appletData = await ctx.redis.get(key);
        if (!appletData) {
          ctx.response.notFound("Applet not found");
          return;
        }

        let parsed: unknown;
        try {
          parsed = typeof appletData === "string" ? JSON.parse(appletData) : appletData;
        } catch (error) {
          ctx.logger.error("Error parsing applet data", error);
          ctx.response.serverError("Invalid applet data");
          return;
        }

        ctx.logger.info("Retrieved applet", { id });
        ctx.response.ok(parsed);
        return;
      }

      if (ctx.method === "POST") {
        const user = await ctx.requireAuth({
          missingMessage: "Unauthorized",
          invalidMessage: "Unauthorized",
        });
        if (!user) {
          return;
        }

        const rlKey = RateLimit.makeKey(["rl", "applet", "save", "user", user.username]);
        const rlResult = await RateLimit.checkCounterLimit({
          key: rlKey,
          windowSeconds: RATE_LIMITS.save.windowSeconds,
          limit: RATE_LIMITS.save.limit,
        });

        if (!rlResult.allowed) {
          ctx.logger.warn("Rate limit exceeded", { username: user.username });
          ctx.response.tooManyRequests("rate_limit_exceeded", {
            limit: rlResult.limit,
            retryAfter: rlResult.resetSeconds,
          });
          return;
        }

        const validation = SaveAppletRequestSchema.safeParse(ctx.req.body);
        if (!validation.success) {
          ctx.response.badRequest("Invalid request body", {
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

        if (shareId) {
          const existingKey = `${APPLET_SHARE_PREFIX}${shareId}`;
          const existingData = await ctx.redis.get(existingKey);

          if (existingData) {
            try {
              const parsed = (typeof existingData === "string"
                ? JSON.parse(existingData)
                : existingData) as SharedAppletRecord;

              if (
                parsed &&
                parsed.createdBy &&
                parsed.createdBy.toLowerCase() === user.username.toLowerCase()
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
              : (user.username || undefined),
          featured:
            isUpdate && existingAppletData?.featured !== undefined
              ? existingAppletData.featured
              : undefined,
        };

        await ctx.redis.set(key, JSON.stringify(appletData));
        const shareUrl = `${ctx.origin}/applet-viewer/${id}`;

        ctx.logger.info("Saved applet", { id, isUpdate });
        ctx.response.ok({
          id,
          shareUrl,
          updated: isUpdate,
          createdAt: appletData.createdAt,
        });
        return;
      }

      if (ctx.method === "DELETE") {
        const admin = await ctx.requireAuth({
          requireAdmin: true,
          missingMessage: "Forbidden",
          invalidMessage: "Forbidden",
          forbiddenMessage: "Forbidden",
          missingStatus: 403,
          invalidStatus: 403,
          forbiddenStatus: 403,
        });
        if (!admin) {
          return;
        }

        const rlKey = RateLimit.makeKey(["rl", "applet", "delete", "user", admin.username]);
        const rlResult = await RateLimit.checkCounterLimit({
          key: rlKey,
          windowSeconds: RATE_LIMITS.delete.windowSeconds,
          limit: RATE_LIMITS.delete.limit,
        });

        if (!rlResult.allowed) {
          ctx.response.tooManyRequests("rate_limit_exceeded", {
            limit: rlResult.limit,
            retryAfter: rlResult.resetSeconds,
          });
          return;
        }

        const id = ctx.getQueryParam("id");
        if (!id) {
          ctx.response.badRequest("Missing id parameter");
          return;
        }

        const key = `${APPLET_SHARE_PREFIX}${id}`;
        const deleted = await ctx.redis.del(key);
        if (deleted === 0) {
          ctx.response.notFound("Applet not found");
          return;
        }

        ctx.logger.info("Deleted applet", { id });
        ctx.response.ok({ success: true });
        return;
      }

      if (ctx.method === "PATCH") {
        const admin = await ctx.requireAuth({
          requireAdmin: true,
          missingMessage: "Forbidden",
          invalidMessage: "Forbidden",
          forbiddenMessage: "Forbidden",
          missingStatus: 403,
          invalidStatus: 403,
          forbiddenStatus: 403,
        });
        if (!admin) {
          return;
        }

        const rlKey = RateLimit.makeKey(["rl", "applet", "patch", "user", admin.username]);
        const rlResult = await RateLimit.checkCounterLimit({
          key: rlKey,
          windowSeconds: RATE_LIMITS.patch.windowSeconds,
          limit: RATE_LIMITS.patch.limit,
        });

        if (!rlResult.allowed) {
          ctx.response.tooManyRequests("rate_limit_exceeded", {
            limit: rlResult.limit,
            retryAfter: rlResult.resetSeconds,
          });
          return;
        }

        const id = ctx.getQueryParam("id");
        if (!id) {
          ctx.response.badRequest("Missing id parameter");
          return;
        }

        const { featured } = (ctx.req.body || {}) as { featured?: unknown };
        if (typeof featured !== "boolean") {
          ctx.response.badRequest("Invalid request body: featured must be boolean");
          return;
        }

        const key = `${APPLET_SHARE_PREFIX}${id}`;
        const appletData = await ctx.redis.get(key);
        if (!appletData) {
          ctx.response.notFound("Applet not found");
          return;
        }

        const parsed = (typeof appletData === "string"
          ? JSON.parse(appletData)
          : appletData) as Record<string, unknown>;
        parsed.featured = featured;
        await ctx.redis.set(key, JSON.stringify(parsed));

        ctx.logger.info("Updated applet", { id, featured });
        ctx.response.ok({ success: true, featured });
      }
    } catch (error: unknown) {
      ctx.logger.error("Error in share-applet API", error);
      const errorMessage =
        error instanceof Error ? error.message : "Internal server error";
      ctx.response.serverError(errorMessage);
    }
  }
);
