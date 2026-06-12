import { apiHandler } from "../../_utils/api-handler.js";
import type { SyncOp } from "../../../src/shared/sync2/types.js";
import {
  applySyncOps,
  broadcastSyncOps,
  validateSyncOps,
} from "./_core.js";

export const runtime = "nodejs";
export const maxDuration = 15;

const RATE_LIMIT_WINDOW = 60;
const RATE_LIMIT_MAX = 240;

interface PostOpsBody {
  clientId?: string;
  ops?: SyncOp[];
}

function isValidClientId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 64;
}

export default apiHandler<PostOpsBody>(
  {
    methods: ["POST"],
    auth: "required",
    parseJsonBody: true,
  },
  async ({ res, redis, user, body }): Promise<void> => {
    const username = user?.username || "";
    const clientId = body?.clientId;

    if (!isValidClientId(clientId)) {
      res.status(400).json({ error: "Missing or invalid clientId" });
      return;
    }

    const validationError = validateSyncOps(body?.ops);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const rateLimitKey = `rl:sync2:ops:${username}`;
    const current = await redis.incr(rateLimitKey);
    if (current === 1) {
      await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW);
    }
    if (current > RATE_LIMIT_MAX) {
      res.status(429).json({ error: "Too many sync writes. Please try again shortly." });
      return;
    }

    try {
      const result = await applySyncOps(redis, username, body!.ops!, clientId);
      await broadcastSyncOps(username, result.seq, result.accepted, clientId);
      res.status(200).json({
        ok: true,
        seq: result.seq,
        results: result.results,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[sync2] ops write failed:", message, error);
      res.status(503).json({ error: `Sync write failed: ${message}` });
    }
  }
);
