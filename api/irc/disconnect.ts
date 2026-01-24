/**
 * /api/irc/disconnect
 * 
 * POST - Disconnect from an IRC server
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initLogger } from "../_utils/_logging.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../_utils/_cors.js";
import { getIrcServer, removeIrcServer } from "./_helpers/_redis.js";
import { broadcastIrcServerEvent } from "./_helpers/_pusher.js";
import type { DisconnectIrcRequest } from "./_helpers/_types.js";

export const runtime = "nodejs";
export const maxDuration = 30;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { requestId, logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);

  logger.request(req.method || "POST", req.url || "/api/irc/disconnect", "irc-disconnect");

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
    const { serverId } = req.body as DisconnectIrcRequest;

    if (!serverId) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "serverId is required" });
      return;
    }

    const server = await getIrcServer(serverId);
    if (!server) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "Server not found" });
      return;
    }

    // Broadcast disconnect request (for connection service to pick up)
    await broadcastIrcServerEvent(serverId, "irc-disconnect-request", {
      serverId,
    });

    // Remove server config from Redis
    await removeIrcServer(serverId);

    logger.info("IRC disconnection requested", { serverId });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ success: true });
    return;
  } catch (error) {
    logger.error("Error disconnecting from IRC server", error);
    logger.response(500, Date.now() - startTime);
    res.status(500).json({ error: "Failed to disconnect from IRC server" });
    return;
  }
}
