/**
 * /api/irc/message
 * 
 * POST - Send a message to an IRC channel
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initLogger } from "../_utils/_logging.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../_utils/_cors.js";
import { getIrcServer } from "./_helpers/_redis.js";
import { broadcastIrcChannelEvent } from "./_helpers/_pusher.js";
import type { SendMessageRequest } from "./_helpers/_types.js";

export const runtime = "nodejs";
export const maxDuration = 30;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { requestId, logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);

  logger.request(req.method || "POST", req.url || "/api/irc/message", "irc-message");

  if (req.method === "OPTIONS") {
    setCorsHeaders(res, origin);
    res.setHeader("Content-Type", "application/json");
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  setCorsHeaders(res, origin);
  res.setHeader("Content-Type", "application/json");

  if (!isAllowedOrigin(origin)) {
    logger.response(403, Date.now() - startTime);
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  if (req.method !== "POST") {
    logger.response(405, Date.now() - startTime);
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { serverId, channel, content } = req.body as SendMessageRequest;

    if (!serverId || !channel || !content) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "serverId, channel, and content are required" });
      return;
    }

    const normalizedChannel = channel.startsWith("#") ? channel : `#${channel}`;
    const server = await getIrcServer(serverId);

    if (!server) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "Server not found" });
      return;
    }

    if (!server.connected) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Server not connected" });
      return;
    }

    // Broadcast message request (for connection service to pick up and send to IRC)
    await broadcastIrcChannelEvent(serverId, normalizedChannel, "irc-message-request", {
      serverId,
      channel: normalizedChannel,
      content: content.trim(),
      nickname: server.nickname,
    });

    logger.info("IRC message send requested", { serverId, channel: normalizedChannel });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ success: true });
    return;
  } catch (error) {
    logger.error("Error sending IRC message", error);
    logger.response(500, Date.now() - startTime);
    res.status(500).json({ error: "Failed to send IRC message" });
    return;
  }
}
