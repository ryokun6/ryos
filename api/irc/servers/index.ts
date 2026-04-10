/**
 * /api/irc/servers
 *
 * GET  - List all configured IRC servers (anyone can read)
 * POST - Add a new IRC server (admin only)
 */

import { apiHandler } from "../../_utils/api-handler.js";
import {
  generateIrcServerId,
  listIrcServers,
  normalizeIrcServerInput,
  setIrcServer,
  type IrcServer,
} from "../../_utils/irc/_servers.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default apiHandler(
  { methods: ["GET", "POST"], auth: "optional" },
  async ({ req, res, logger, startTime, user }) => {
    const method = (req.method || "GET").toUpperCase();

    if (method === "GET") {
      try {
        const servers = await listIrcServers();
        logger.info("Listed IRC servers", { count: servers.length });
        logger.response(200, Date.now() - startTime);
        res.status(200).json({ servers });
      } catch (error) {
        logger.error("Error listing IRC servers", error);
        logger.response(500, Date.now() - startTime);
        res.status(500).json({ error: "Failed to list IRC servers" });
      }
      return;
    }

    if (!user) {
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Unauthorized - missing credentials" });
      return;
    }

    if (user.username !== "ryo") {
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Forbidden - admin access required" });
      return;
    }

    const body = req.body || {};
    const normalized = normalizeIrcServerInput({
      label: body.label,
      host: body.host,
      port: body.port,
      tls: body.tls,
    });

    if (!normalized.ok) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: normalized.error });
      return;
    }

    const server: IrcServer = {
      id: generateIrcServerId(),
      ...normalized.value,
      createdAt: Date.now(),
    };

    try {
      await setIrcServer(server);
      logger.info("IRC server added", {
        id: server.id,
        host: server.host,
        port: server.port,
        tls: server.tls,
      });
      logger.response(201, Date.now() - startTime);
      res.status(201).json({ server });
    } catch (error) {
      logger.error("Error adding IRC server", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to add IRC server" });
    }
  }
);
