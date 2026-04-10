/**
 * /api/irc/servers/[id]/channels
 *
 * GET - List the channels currently advertised by an IRC server.
 *
 * The bridge runs an IRC LIST against the configured server and returns
 * the parsed result. Admin only because it requires opening (or reusing)
 * a real IRC connection.
 */

import { apiHandler } from "../../../_utils/api-handler.js";
import { getIrcServer } from "../../../_utils/irc/_servers.js";
import {
  getIrcBridge,
  isIrcBridgeEnabled,
} from "../../../_utils/irc/_bridge.js";

export const runtime = "nodejs";
export const maxDuration = 30;

export default apiHandler(
  { methods: ["GET"], auth: "required" },
  async ({ req, res, logger, startTime, user }) => {
    const id = (req.query.id as string | undefined)?.trim();
    if (!id) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Server id is required" });
      return;
    }

    if (user!.username !== "ryo") {
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Forbidden - admin access required" });
      return;
    }

    if (!isIrcBridgeEnabled()) {
      logger.response(503, Date.now() - startTime);
      res.status(503).json({
        error: "IRC bridge is disabled in this environment",
      });
      return;
    }

    const server = await getIrcServer(id);
    if (!server) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "Server not found" });
      return;
    }

    const limitParam = req.query.limit as string | undefined;
    const requestedLimit = limitParam ? parseInt(limitParam, 10) : NaN;
    const maxChannels = Number.isFinite(requestedLimit)
      ? Math.min(2000, Math.max(1, requestedLimit))
      : 500;
    const timeoutParam = req.query.timeoutMs as string | undefined;
    const requestedTimeout = timeoutParam ? parseInt(timeoutParam, 10) : NaN;
    const timeoutMs = Number.isFinite(requestedTimeout)
      ? Math.min(30000, Math.max(1000, requestedTimeout))
      : 15000;

    try {
      const channels = await getIrcBridge().listChannels(
        server.host,
        server.port,
        server.tls,
        { maxChannels, timeoutMs }
      );

      logger.info("IRC channel list retrieved", {
        host: server.host,
        port: server.port,
        count: channels.length,
      });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({
        server,
        channels,
        truncated: channels.length >= maxChannels,
      });
    } catch (error) {
      logger.error("Error listing IRC channels", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to list IRC channels" });
    }
  }
);
