import { z } from "zod";
import { generateAuthToken } from "../../../_utils/auth/index.js";
import * as RateLimit from "../../../_utils/_rate-limit.js";
import { apiHandler } from "../../../_utils/api-handler.js";
import { redisKeys } from "../../../../src/shared/redisKeys.js";
import { withStuffShareLock } from "../../_helpers/_shareMutations.js";
import type { StuffShareRecord } from "../../_helpers/_types.js";

const BodySchema = z.object({
  itemId: z.string().min(1).max(64),
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
      key: RateLimit.makeKey([
        "rl",
        "stuff",
        "reserve",
        "user",
        user!.username,
      ]),
      windowSeconds: 60,
      limit: 30,
    });
    if (!rl.allowed) {
      logger.response(429, Date.now() - startTime);
      res.status(429).json({ error: "rate_limit_exceeded" });
      return;
    }

    try {
      await withStuffShareLock(redis, id, async () => {
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
          res.status(400).json({ error: "cannot_reserve_own_item" });
          return;
        }

        const existing = share.reservations.find(
          (r) => r.itemId === body!.itemId && r.status === "active"
        );
        if (existing) {
          if (existing.username === user!.username) {
            logger.response(200, Date.now() - startTime);
            res.status(200).json({ reservation: existing, alreadyReserved: true });
            return;
          }
          logger.response(409, Date.now() - startTime);
          res.status(409).json({ error: "already_reserved" });
          return;
        }

        const reservation = {
          id: generateAuthToken().substring(0, 24),
          itemId: body!.itemId,
          username: user!.username,
          createdAt: Date.now(),
          status: "active" as const,
        };

        share.reservations.push(reservation);
        share.updatedAt = Date.now();
        share.items = share.items.map((entry) =>
          entry.id === body!.itemId ? { ...entry, status: "reserved" } : entry
        );

        await redis.set(redisKeys.media.stuffShare(id), JSON.stringify(share));
        logger.response(201, Date.now() - startTime);
        res.status(201).json({ reservation });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "stuff_share_busy") {
        logger.response(503, Date.now() - startTime);
        res.status(503).json({ error: "share_busy" });
        return;
      }
      throw error;
    }
  }
);
