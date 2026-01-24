/**
 * POST /api/pusher/broadcast
 * Broadcast events via Pusher (Node.js runtime required)
 * This endpoint is called by Edge functions that need to send Pusher events
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Pusher from "pusher";
import { initLogger } from "../_utils/_logging.js";

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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();

  logger.request(req.method || "POST", req.url || "/api/pusher/broadcast", "broadcast");

  // Only allow internal calls (check for internal secret)
  const internalSecret = req.headers["x-internal-secret"];
  if (internalSecret !== process.env.INTERNAL_API_SECRET) {
    logger.warn("Forbidden - invalid internal secret");
    logger.response(403, Date.now() - startTime);
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (req.method !== "POST") {
    logger.response(405, Date.now() - startTime);
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { channel, event, data } = req.body as BroadcastRequest;

  if (!channel || !event) {
    logger.response(400, Date.now() - startTime);
    res.status(400).json({ error: "Channel and event are required" });
    return;
  }

  try {
    await pusher.trigger(channel, event, data);
    logger.info("Pusher broadcast sent", { channel, event });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error("Pusher broadcast error", error);
    logger.response(500, Date.now() - startTime);
    res.status(500).json({ error: "Failed to broadcast" });
  }
}
