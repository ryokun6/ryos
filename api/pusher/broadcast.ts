/**
 * POST /api/pusher/broadcast
 * Broadcast events via Pusher (Node.js runtime required)
 * This endpoint is called by Edge functions that need to send Pusher events
 */

import Pusher from "pusher";
import { apiHandler } from "../_utils/api-handler.js";

export const runtime = "nodejs";
export const maxDuration = 15;

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
});

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
    const internalSecret = req.headers["x-internal-secret"];
    if (internalSecret !== process.env.INTERNAL_API_SECRET) {
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

    await pusher.trigger(channel, event, data);
    logger.info("Pusher broadcast sent", { channel, event });
    res.status(200).json({ success: true });
  }
);
