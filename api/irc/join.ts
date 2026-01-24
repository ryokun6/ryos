/**
 * /api/irc/join
 * 
 * POST - Join an IRC channel
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initLogger } from "../_utils/_logging.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../_utils/_cors.js";
import { getIrcServer, setIrcServer, setIrcChannel } from "./_helpers/_redis.js";
import { broadcastIrcChannelEvent } from "./_helpers/_pusher.js";
import type { JoinChannelRequest, IrcChannelData } from "./_helpers/_types.js";

export const runtime = "nodejs";
export const maxDuration = 30;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { requestId, logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);

  logger.request(req.method || "POST", req.url || "/api/irc/join", "irc-join");

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
    const { serverId, channel } = req.body as JoinChannelRequest;

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

    if (!server.connected) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Server not connected" });
      return;
    }

    // Add channel to server's channel list if not already present
    if (!server.channels.includes(normalizedChannel)) {
      server.channels.push(normalizedChannel);
      await setIrcServer(serverId, server);
    }

    // Create/update channel data
    const channelData: IrcChannelData = {
      name: normalizedChannel,
      serverId,
      users: [],
    };
    await setIrcChannel(serverId, normalizedChannel, channelData);

    // Broadcast join request (for connection service to pick up)
    await broadcastIrcChannelEvent(serverId, normalizedChannel, "irc-join-request", {
      serverId,
      channel: normalizedChannel,
    });

    logger.info("IRC channel join requested", { serverId, channel: normalizedChannel });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ success: true });
    return;
  } catch (error) {
    logger.error("Error joining IRC channel", error);
    logger.response(500, Date.now() - startTime);
    res.status(500).json({ error: "Failed to join IRC channel" });
    return;
  }
}
