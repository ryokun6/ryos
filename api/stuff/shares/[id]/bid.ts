import { z } from "zod";
import { generateAuthToken } from "../../_utils/auth/index.js";
import * as RateLimit from "../../_utils/_rate-limit.js";
import { apiHandler } from "../../_utils/api-handler.js";
import { redisKeys } from "../../../src/shared/redisKeys.js";
import type { StuffShareRecord } from "../_helpers/_types.js";

const BodySchema = z.object({
  itemId: z.string().min(1).max(64),
  amount: z.number().positive().max(1_000_000_000),
  currency: z.string().min(1).max(8).default("USD"),
});

async function loadShare(
  redis: { get: (key: string) => Promise<unknown> },
  id: string
): Promise<StuffShareRecord | null> {
  const raw = await redis.get(redisKeys.media.stuffShare(id));
  if (!raw) return null;
  return typeof raw === "string"
    ? (JSON.parse(raw) as StuffShareRecord)
    : (raw as StuffShareRecord);
}

export default apiHandler(
  {
    methods: ["POST"],
    auth: "required",
    parseJsonBody: true,
    bodySchema: BodySchema,
  },
  async ({ req, res, redis, logger, startTime, body, user }) => {
    const id = typeof req.query.id === "string" ? req.query.id : "";

    if (!id) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "missing_id" });
      return;
    }

    const rl = await RateLimit.checkCounterLimit({
      key: RateLimit.makeKey(["rl", "stuff", "bid", "user", user!.username]),
      windowSeconds: 60,
      limit: 40,
    });
    if (!rl.allowed) {
      logger.response(429, Date.now() - startTime);
      res.status(429).json({ error: "rate_limit_exceeded" });
      return;
    }

    const share = await loadShare(redis, id);
    if (!share) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "not_found" });
      return;
    }

    const item = share.items.find((entry) => entry.id === body!.itemId);
    if (!item) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "item_not_found" });
      return;
    }

    if (share.ownerUsername === user!.username) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "cannot_bid_on_own_item" });
      return;
    }

    const currentTop = share.bids
      .filter((bid) => bid.itemId === body!.itemId)
      .sort((a, b) => b.amount - a.amount)[0];

    if (currentTop && body!.amount <= currentTop.amount) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({
        error: "bid_too_low",
        currentHigh: currentTop.amount,
        currency: currentTop.currency,
      });
      return;
    }

    // Keep only the highest offer per user per item
    share.bids = share.bids.filter(
      (bid) =>
        !(bid.itemId === body!.itemId && bid.username === user!.username)
    );

    const bid = {
      id: generateAuthToken().substring(0, 24),
      itemId: body!.itemId,
      username: user!.username,
      amount: body!.amount,
      currency: body!.currency || item.prices.currency || "USD",
      createdAt: Date.now(),
    };
    share.bids.push(bid);
    share.updatedAt = Date.now();

    await redis.set(redisKeys.media.stuffShare(id), JSON.stringify(share));
    logger.response(201, Date.now() - startTime);
    res.status(201).json({ bid });
  }
);
