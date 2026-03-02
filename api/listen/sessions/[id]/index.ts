/**
 * GET /api/listen/sessions/[id]
 * Fetch session state
 */

import { apiHandler } from "../../../_utils/api-handler.js";
import { assertValidRoomId } from "../../../_utils/_validation.js";
import { getSession, touchSession } from "../../_helpers/_redis.js";
import { runtime, maxDuration } from "../../_helpers/_constants.js";

export { runtime, maxDuration };

export default apiHandler(
  { methods: ["GET"] },
  async ({ req, res, logger, startTime }) => {
    const sessionId = req.query.id as string | undefined;

    if (!sessionId) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Session ID is required" });
      return;
    }

    try {
      assertValidRoomId(sessionId, "listen-session-get");
    } catch (error) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid session ID" });
      return;
    }

    try {
      const session = await getSession(sessionId);
      if (!session) {
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "Session not found" });
        return;
      }

      await touchSession(sessionId);

      logger.info("Listen session fetched", { sessionId });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ session });
    } catch (error) {
      logger.error("Failed to fetch listen session", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to fetch session" });
    }
  }
);
