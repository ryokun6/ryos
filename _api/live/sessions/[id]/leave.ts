/**
 * POST /api/live/sessions/[id]/leave
 * Leave a Live Desktop session
 */

import { apiHandler } from "../../../_utils/api-handler.js";
import {
  assertValidRoomId,
  assertValidUsername,
  isProfaneUsername,
} from "../../../_utils/_validation.js";
import { resolveRequestAuth } from "../../../_utils/request-auth.js";
import {
  deleteSession,
  getCurrentTimestamp,
  getSession,
  setSession,
} from "../../_helpers/_redis.js";
import { runtime, maxDuration } from "../../_helpers/_constants.js";
import type { LeaveLiveSessionRequest } from "../../_helpers/_types.js";
import { broadcastSessionEnded, broadcastUserLeft } from "../../_helpers/_pusher.js";

export { runtime, maxDuration };

export default apiHandler(
  { methods: ["POST"] },
  async ({ req, res, redis, logger, startTime }) => {
    const sessionId = req.query.id as string | undefined;
    if (!sessionId) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Session ID is required" });
      return;
    }

    const auth = await resolveRequestAuth(req, redis, { required: true });
    if (auth.error || !auth.user) {
      logger.response(auth.error?.status ?? 401, Date.now() - startTime);
      res.status(auth.error?.status ?? 401).json({
        error: auth.error?.error ?? "Unauthorized - missing credentials",
      });
      return;
    }

    const body = (req.body || {}) as LeaveLiveSessionRequest;
    const claimedUsername = body?.username?.toLowerCase();
    const username = auth.user.username;

    if (claimedUsername && claimedUsername !== username) {
      logger.warn("Username mismatch in live desktop leave body", {
        claimedUsername,
        authenticatedUsername: username,
      });
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Forbidden - username mismatch" });
      return;
    }

    try {
      assertValidRoomId(sessionId, "live-desktop-leave");
      assertValidUsername(username, "live-desktop-leave");
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

      if (session.hostUsername === username) {
        await deleteSession(sessionId);
        await broadcastSessionEnded(sessionId);

        logger.info("Live desktop session ended by host", { sessionId, username });
        logger.response(200, Date.now() - startTime);
        res.status(200).json({ success: true });
        return;
      }

      const userIndex = session.users.findIndex((user) => user.username === username);
      const userExisted = userIndex !== -1;

      if (userIndex !== -1) {
        session.users.splice(userIndex, 1);
      }

      session.lastSyncAt = getCurrentTimestamp();
      session.users.sort((a, b) => a.joinedAt - b.joinedAt);

      if (session.users.length === 0) {
        await deleteSession(sessionId);
        await broadcastSessionEnded(sessionId);
        logger.info("Live desktop session ended (no users left)", { sessionId });
        logger.response(200, Date.now() - startTime);
        res.status(200).json({ success: true });
        return;
      }

      await setSession(sessionId, session);
      if (userExisted) {
        await broadcastUserLeft(sessionId, { username });
      }

      logger.info("User left live desktop session", { sessionId, username });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true, session });
      return;
    } catch (error) {
      logger.error("Failed to leave live desktop session", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to leave session" });
      return;
    }
  }
);
