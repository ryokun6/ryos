/**
 * /api/irc/connect
 * 
 * POST - Connect to an IRC server
 * 
 * Note: This endpoint stores connection intent in Redis.
 * Actual IRC connection handling requires a persistent service/worker.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initLogger } from "../_utils/_logging.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../_utils/_cors.js";
import { setIrcServer, getIrcServer } from "./_helpers/_redis.js";
import { broadcastIrcServerEvent } from "./_helpers/_pusher.js";
import type { IrcServerConfig, ConnectIrcRequest } from "./_helpers/_types.js";

export const runtime = "nodejs";
export const maxDuration = 30;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { requestId, logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);

  logger.request(req.method || "POST", req.url || "/api/irc/connect", "irc-connect");

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
    const { host, port, nickname } = req.body as ConnectIrcRequest;

    if (!host || !port || !nickname) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "host, port, and nickname are required" });
      return;
    }

    const serverId = `${host}:${port}`;
    const existingServer = await getIrcServer(serverId);

    if (existingServer && existingServer.connected) {
      logger.response(409, Date.now() - startTime);
      res.status(409).json({ error: "Already connected to this server" });
      return;
    }

    const serverConfig: IrcServerConfig = {
      id: serverId,
      host,
      port: Number(port),
      nickname,
      connected: false, // Will be set to true by connection service
      channels: existingServer?.channels || [],
      connectedAt: Date.now(),
    };

    await setIrcServer(serverId, serverConfig);

    // Broadcast connection intent (for connection service to pick up)
    await broadcastIrcServerEvent(serverId, "irc-connect-request", {
      serverId,
      host,
      port,
      nickname,
    });

    logger.info("IRC connection requested", { serverId, host, port, nickname });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ serverId, connected: false });
    return;
  } catch (error) {
    logger.error("Error connecting to IRC server", error);
    logger.response(500, Date.now() - startTime);
    res.status(500).json({ error: "Failed to connect to IRC server" });
    return;
  }
}
