/**
 * POST /api/live/sessions/[id]/sync
 * Sync Live Desktop session state (host-only)
 */

import { apiHandler } from "../../../_utils/api-handler.js";
import {
  assertValidRoomId,
  assertValidUsername,
  isProfaneUsername,
} from "../../../_utils/_validation.js";
import { getCurrentTimestamp, getSession, setSession } from "../../_helpers/_redis.js";
import { runtime, maxDuration } from "../../_helpers/_constants.js";
import type { SyncLiveSessionRequest } from "../../_helpers/_types.js";
import { broadcastSync } from "../../_helpers/_pusher.js";

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

    const body = (req.body || {}) as SyncLiveSessionRequest;
    const claimedUsername = body?.username?.toLowerCase();
    const username = user!.username;
    const state = body?.state;

    if (claimedUsername && claimedUsername !== username) {
      logger.warn("Username mismatch in live desktop sync body", {
        claimedUsername,
        authenticatedUsername: username,
      });
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Forbidden - username mismatch" });
      return;
    }

    if (!state || !state.lastOperation) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Sync state is required" });
      return;
    }

    try {
      assertValidUsername(username, "live-desktop-sync");
      assertValidRoomId(sessionId, "live-desktop-sync");
    } catch (error) {
      logger.response(400, Date.now() - startTime);
      res
        .status(400)
        .json({ error: error instanceof Error ? error.message : "Validation error" });
      return;
    }

    if (isProfaneUsername(username)) {
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

      if (!session.users.some((u) => u.username === username)) {
        logger.response(403, Date.now() - startTime);
        res.status(403).json({ error: "User not in session" });
        return;
      }

      if (session.hostUsername !== username) {
        logger.response(403, Date.now() - startTime);
        res.status(403).json({ error: "Only the host can sync desktop state" });
        return;
      }

      const now = getCurrentTimestamp();
      session.state = state;
      session.lastSyncAt = now;
      await setSession(sessionId, session);

      await broadcastSync(sessionId, {
        state: session.state,
        timestamp: now,
        syncedBy: username,
        participantCount: session.users.length,
      });

      logger.info("Live desktop session synced", {
        sessionId,
        username,
        operationType: state.lastOperation.type,
      });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true });
      return;
    } catch (error) {
      logger.error("Failed to sync live desktop session", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to sync session" });
      return;
    }
  }
);
