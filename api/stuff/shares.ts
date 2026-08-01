import { z } from "zod";
import { generateAuthToken } from "../_utils/auth/index.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import { apiHandler } from "../_utils/api-handler.js";
import { getAppPublicOrigin } from "../_utils/runtime-config.js";
import { redisKeys } from "../../src/shared/redisKeys.js";
import type { StuffShareRecord } from "./_helpers/_types.js";

const RATE_LIMITS = {
  get: { windowSeconds: 60, limit: 120 },
  save: { windowSeconds: 60, limit: 20 },
  delete: { windowSeconds: 60, limit: 10 },
};

const StuffPricesSchema = z.object({
  original: z.number().optional(),
  discounted: z.number().optional(),
  sold: z.number().optional(),
  currency: z.string().min(1).max(8).default("USD"),
});

const StuffSharedItemSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  notes: z.string().max(4000).default(""),
  imageDataUrl: z.string().max(2_000_000).optional(),
  barcode: z.string().max(128).optional(),
  brand: z.string().max(200).optional(),
  tagNames: z.array(z.string().max(64)).max(20).default([]),
  status: z.enum([
    "in_use",
    "stowed",
    "for_sale",
    "reserved",
    "sold",
    "discarded",
  ]),
  prices: StuffPricesSchema,
  quantity: z.number().int().min(1).max(9999).default(1),
});

const SaveShareSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  shareId: z.string().min(1).max(64).optional(),
  items: z.array(StuffSharedItemSchema).min(1).max(200),
});

const generateId = (): string => generateAuthToken().substring(0, 32);

export default apiHandler(
  {
    methods: ["GET", "POST", "DELETE"],
    auth: "optional",
    parseJsonBody: true,
  },
  async ({ req, res, redis, logger, startTime, body, user }) => {
    if (req.method === "GET") {
      const ip = getClientIp(req);
      const rl = await RateLimit.checkCounterLimit({
        key: RateLimit.makeKey(["rl", "stuff", "share", "get", "ip", ip]),
        windowSeconds: RATE_LIMITS.get.windowSeconds,
        limit: RATE_LIMITS.get.limit,
      });
      if (!rl.allowed) {
        logger.response(429, Date.now() - startTime);
        res.setHeader("Retry-After", String(rl.resetSeconds));
        res.status(429).json({ error: "rate_limit_exceeded" });
        return;
      }

      const id = typeof req.query.id === "string" ? req.query.id : "";
      if (!id) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "missing_id" });
        return;
      }

      const raw = await redis.get(redisKeys.media.stuffShare(id));
      if (!raw) {
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "not_found" });
        return;
      }

      const share =
        typeof raw === "string" ? (JSON.parse(raw) as StuffShareRecord) : (raw as StuffShareRecord);
      logger.response(200, Date.now() - startTime);
      res.status(200).json(share);
      return;
    }

    if (req.method === "POST") {
      if (!user) {
        logger.response(401, Date.now() - startTime);
        res.status(401).json({ error: "unauthorized" });
        return;
      }

      const ip = getClientIp(req);
      const rl = await RateLimit.checkCounterLimit({
        key: RateLimit.makeKey([
          "rl",
          "stuff",
          "share",
          "save",
          "user",
          user.username,
        ]),
        windowSeconds: RATE_LIMITS.save.windowSeconds,
        limit: RATE_LIMITS.save.limit,
      });
      if (!rl.allowed) {
        logger.response(429, Date.now() - startTime);
        res.setHeader("Retry-After", String(rl.resetSeconds));
        res.status(429).json({ error: "rate_limit_exceeded" });
        return;
      }

      const parsed = SaveShareSchema.safeParse(body);
      if (!parsed.success) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "validation_error", issues: parsed.error.issues });
        return;
      }

      const now = Date.now();
      let shareId = parsed.data.shareId || generateId();
      let existing: StuffShareRecord | null = null;

      if (parsed.data.shareId) {
        const raw = await redis.get(redisKeys.media.stuffShare(parsed.data.shareId));
        if (raw) {
          existing =
            typeof raw === "string"
              ? (JSON.parse(raw) as StuffShareRecord)
              : (raw as StuffShareRecord);
          if (existing.ownerUsername !== user.username) {
            // Someone else's share — create a new one instead of hijacking
            shareId = generateId();
            existing = null;
          }
        }
      }

      const record: StuffShareRecord = {
        id: shareId,
        ownerUsername: user.username,
        title: parsed.data.title,
        description: parsed.data.description,
        items: parsed.data.items,
        reservations: existing?.reservations ?? [],
        bids: existing?.bids ?? [],
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      await redis.set(redisKeys.media.stuffShare(shareId), JSON.stringify(record));

      const origin = getAppPublicOrigin();
      logger.info("stuff share saved", { shareId, username: user.username });
      logger.response(existing ? 200 : 201, Date.now() - startTime);
      res.status(existing ? 200 : 201).json({
        id: shareId,
        updated: Boolean(existing),
        url: `${origin}/stuff/${shareId}`,
      });
      return;
    }

    if (req.method === "DELETE") {
      if (!user) {
        logger.response(401, Date.now() - startTime);
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      const id = typeof req.query.id === "string" ? req.query.id : "";
      if (!id) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "missing_id" });
        return;
      }
      const raw = await redis.get(redisKeys.media.stuffShare(id));
      if (!raw) {
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "not_found" });
        return;
      }
      const share =
        typeof raw === "string" ? (JSON.parse(raw) as StuffShareRecord) : (raw as StuffShareRecord);
      if (share.ownerUsername !== user.username) {
        logger.response(403, Date.now() - startTime);
        res.status(403).json({ error: "forbidden" });
        return;
      }
      await redis.del(redisKeys.media.stuffShare(id));
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true });
      return;
    }
  }
);
