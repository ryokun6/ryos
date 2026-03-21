/**
 * POST /api/listen/sessions/[id]/assign-dj
 * Session host sets which member is the playback device (DJ).
 */

import { apiHandler } from "../../../_utils/api-handler.js";
import {
  assertValidRoomId,
  assertValidUsername,
  isProfaneUsername,
} from "../../../_utils/_validation.js";
import { getCurrentTimestamp, getSession, setSession } from "../../_helpers/_redis.js";
import { runtime, maxDuration } from "../../_helpers/_constants.js";
import type { AssignDjRequest } from "../../_helpers/_types.js";
import { broadcastDjChanged } from "../../_helpers/_pusher.js";

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

    const body = (req.body || {}) as AssignDjRequest;
    const claimedUsername = body?.username?.toLowerCase();
    const username = user!.username;
    const nextDjUsername = body?.nextDjUsername?.toLowerCase();

    if (claimedUsername && claimedUsername !== username) {
      logger.warn("Username mismatch in listen assign-dj body", {
        claimedUsername,
        authenticatedUsername: username,
      });
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Forbidden - username mismatch" });
      return;
    }

    if (!nextDjUsername) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "nextDjUsername is required" });
      return;
    }

    try {
      assertValidUsername(username, "listen-assign-dj");
      assertValidUsername(nextDjUsername, "listen-assign-dj-target");
      assertValidRoomId(sessionId, "listen-assign-dj");
    } catch (error) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: error instanceof Error ? error.message : "Validation error" });
      return;
    }

    if (isProfaneUsername(username) || isProfaneUsername(nextDjUsername)) {
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
        res.status(403).json({ error: "Only the host can assign playback device" });
        return;
      }

      if (nextDjUsername === session.djUsername) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "User is already the playback device" });
        return;
      }

      const isMember = session.users.some((u) => u.username === nextDjUsername);
      if (!isMember) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "Playback device must be an active session member" });
        return;
      }

      const previousDj = session.djUsername;
      session.djUsername = nextDjUsername;
      session.lastSyncAt = getCurrentTimestamp();

      await setSession(sessionId, session);
      await broadcastDjChanged(sessionId, { previousDj, newDj: nextDjUsername });

      logger.info("Listen session DJ assigned by host", {
        sessionId,
        previousDj,
        newDj: nextDjUsername,
      });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true, session });
    } catch (error) {
      logger.error("Failed to assign listen session DJ", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to assign playback device" });
    }
  }
);
