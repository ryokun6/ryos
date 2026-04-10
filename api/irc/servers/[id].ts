/**
 * /api/irc/servers/[id]
 *
 * DELETE - Remove an IRC server from the registry (admin only)
 */

import { apiHandler } from "../../_utils/api-handler.js";
import {
  __DEFAULT_IRC_SERVER_ID,
  deleteIrcServer,
  getIrcServer,
} from "../../_utils/irc/_servers.js";

export const runtime = "nodejs";
export const maxDuration = 10;

export default apiHandler(
  { methods: ["DELETE"], auth: "required" },
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

    if (id === __DEFAULT_IRC_SERVER_ID) {
      logger.response(400, Date.now() - startTime);
      res
        .status(400)
        .json({ error: "Cannot delete the default irc.pieter.com server" });
      return;
    }

    const existing = await getIrcServer(id);
    if (!existing) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "Server not found" });
      return;
    }

    try {
      await deleteIrcServer(id);
      logger.info("IRC server deleted", { id, host: existing.host });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true });
    } catch (error) {
      logger.error("Error deleting IRC server", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to delete IRC server" });
    }
  }
);
