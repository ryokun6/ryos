/**
 * /api/irc/part
 * 
 * POST - Leave an IRC channel
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initLogger } from "../_utils/_logging.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../_utils/_cors.js";
import { getIrcServer, setIrcServer, removeIrcChannel } from "./_helpers/_redis.js";
import { broadcastIrcChannelEvent } from "./_helpers/_pusher.js";
import type { PartChannelRequest } from "./_helpers/_types.js";

export const runtime = "nodejs";
export const maxDuration = 30;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { requestId, logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);

  logger.request(req.method || "POST", req.url || "/api/irc/part", "irc-part");

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
    const { serverId, channel } = req.body as PartChannelRequest;

    if (!serverId || !channel) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "serverId and channel are required" });
      return;
    }

    const normalizedChannel = channel.startsWith("#") ? channel : `#${channel}`;
    const server = await getIrcServer(serverId);

    if (!server) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "Server not found" });
      return;
    }

    // Remove channel from server's channel list
    if (server.channels.includes(normalizedChannel)) {
      server.channels = server.channels.filter(c => c !== normalizedChannel);
      await setIrcServer(serverId, server);
    }

    // Remove channel data
    await removeIrcChannel(serverId, normalizedChannel);

    // Broadcast part request (for connection service to pick up)
    await broadcastIrcChannelEvent(serverId, normalizedChannel, "irc-part-request", {
      serverId,
      channel: normalizedChannel,
    });

    logger.info("IRC channel part requested", { serverId, channel: normalizedChannel });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ success: true });
    return;
  } catch (error) {
    logger.error("Error leaving IRC channel", error);
    logger.response(500, Date.now() - startTime);
    res.status(500).json({ error: "Failed to leave IRC channel" });
    return;
  }
}
