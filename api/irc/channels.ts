/**
 * /api/irc/channels
 * 
 * GET - List channels for an IRC server
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initLogger } from "../_utils/_logging.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../_utils/_cors.js";
import { getIrcServer } from "./_helpers/_redis.js";

export const runtime = "nodejs";
export const maxDuration = 30;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { requestId, logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);

  logger.request(req.method || "GET", req.url || "/api/irc/channels", "irc-channels");

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

  if (req.method !== "GET") {
    logger.response(405, Date.now() - startTime);
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const serverId = req.query.serverId as string;

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

    logger.info("IRC channels listed", { serverId, channelCount: server.channels.length });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ channels: server.channels });
    return;
  } catch (error) {
    logger.error("Error listing IRC channels", error);
    logger.response(500, Date.now() - startTime);
    res.status(500).json({ error: "Failed to list IRC channels" });
    return;
  }
}
