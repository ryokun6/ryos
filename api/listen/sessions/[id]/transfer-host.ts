/**
 * POST /api/listen/sessions/[id]/transfer-host
 * Session host assigns another member as the new host (session ownership).
 */

import { apiHandler } from "../../../_utils/api-handler.js";
import {
  assertValidRoomId,
  assertValidUsername,
  isProfaneUsername,
} from "../../../_utils/_validation.js";
import { getCurrentTimestamp, getSession, setSession } from "../../_helpers/_redis.js";
import { runtime, maxDuration } from "../../_helpers/_constants.js";
import type { TransferHostRequest } from "../../_helpers/_types.js";
import { broadcastHostChanged } from "../../_helpers/_pusher.js";

export { runtime, maxDuration };

export default apiHandler(
  { methods: ["POST"], auth: "required" },
  async ({ req, res, logger, startTime, user }) => {
    const sessionId = req.query.id as string | undefined;

    if (!sessionId) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Session ID is required" });
      return;
    }

    const body = (req.body || {}) as TransferHostRequest;
    const claimedUsername = body?.username?.toLowerCase();
    const username = user!.username;
    const nextHostUsername = body?.nextHostUsername?.toLowerCase();

    if (claimedUsername && claimedUsername !== username) {
      logger.warn("Username mismatch in listen transfer-host body", {
        claimedUsername,
        authenticatedUsername: username,
      });
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Forbidden - username mismatch" });
      return;
    }

    if (!nextHostUsername) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "nextHostUsername is required" });
      return;
    }

    try {
      assertValidUsername(username, "listen-transfer-host");
      assertValidUsername(nextHostUsername, "listen-transfer-host-target");
      assertValidRoomId(sessionId, "listen-transfer-host");
    } catch (error) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: error instanceof Error ? error.message : "Validation error" });
      return;
    }

    if (isProfaneUsername(username) || isProfaneUsername(nextHostUsername)) {
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const session = await getSession(sessionId);

      if (!session) {
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "Session not found" });
        return;
      }

      if (session.hostUsername !== username) {
        logger.response(403, Date.now() - startTime);
        res.status(403).json({ error: "Only the host can transfer host" });
        return;
      }

      if (nextHostUsername === session.hostUsername) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "User is already the host" });
        return;
      }

      const isMember = session.users.some((u) => u.username === nextHostUsername);
      if (!isMember) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "New host must be an active session member" });
        return;
      }

      const previousHost = session.hostUsername;
      session.hostUsername = nextHostUsername;
      session.lastSyncAt = getCurrentTimestamp();

      await setSession(sessionId, session);
      await broadcastHostChanged(sessionId, { previousHost, newHost: nextHostUsername });

      logger.info("Listen session host transferred", {
        sessionId,
        previousHost,
        newHost: nextHostUsername,
      });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true, session });
    } catch (error) {
      logger.error("Failed to transfer listen session host", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to transfer host" });
    }
  }
);
