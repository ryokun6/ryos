/**
 * POST /api/pusher/broadcast
 * Broadcast events via Pusher (Node.js runtime required)
 * This endpoint is called by Edge functions that need to send Pusher events
 */

import { apiHandler } from "../_utils/api-handler.js";
import { triggerRealtimeEvent } from "../_utils/realtime.js";

export const runtime = "nodejs";
export const maxDuration = 15;

interface BroadcastRequest {
  channel: string;
  event: string;
  data: unknown;
}

export default apiHandler(
  { methods: ["POST"], auth: "none", parseJsonBody: true },
  async (ctx) => {
    const { req, res, logger } = ctx;

    // Only allow internal calls (check for internal secret)
    const expectedSecret = process.env.INTERNAL_API_SECRET?.trim();
    if (!expectedSecret) {
      logger.error("Internal API secret is not configured");
      res.status(503).json({ error: "Internal broadcast secret not configured" });
      return;
    }

    const internalSecret = req.headers["x-internal-secret"];
    if (internalSecret !== expectedSecret) {
      logger.warn("Forbidden - invalid internal secret");
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const body = ctx.body as BroadcastRequest | null;
    const { channel, event, data } = body || {};

    if (!channel || !event) {
      res.status(400).json({ error: "Channel and event are required" });
      return;
    }

    await triggerRealtimeEvent(channel, event, data);
    logger.info("Pusher broadcast sent", { channel, event });
    res.status(200).json({ success: true });
  }
);
