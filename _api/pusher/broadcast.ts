/**
 * POST /api/pusher/broadcast
 * Broadcast events via Pusher (Node.js runtime required)
 * This endpoint is called by Edge functions that need to send Pusher events
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Pusher from "pusher";
import { initLogger } from "../_utils/_logging.js";
import { executePusherBroadcastCore } from "../cores/pusher-broadcast-core.js";

export const runtime = "nodejs";
export const maxDuration = 15;

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
});

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();

  logger.request(req.method || "POST", req.url || "/api/pusher/broadcast", "broadcast");

  const internalSecret = req.headers["x-internal-secret"];
  const result = await executePusherBroadcastCore({
    method: req.method,
    providedInternalSecret: internalSecret,
    expectedInternalSecret: process.env.INTERNAL_API_SECRET,
    body: req.body,
    trigger: (channel, event, data) => pusher.trigger(channel, event, data),
  });

  if (result.status === 403) {
    logger.warn("Forbidden - invalid internal secret");
  } else if (result.status === 200) {
    const payload = req.body as { channel?: string; event?: string } | undefined;
    logger.info("Pusher broadcast sent", {
      channel: payload?.channel,
      event: payload?.event,
    });
  } else if (result.status === 500) {
    logger.error("Pusher broadcast error");
  }

  logger.response(result.status, Date.now() - startTime);
  res.status(result.status).json(result.body);
}
