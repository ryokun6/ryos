/**
 * POST /api/listen/sessions/[id]/leave
 * Leave a listen-together session
 *
 * Supports both logged-in users (username) and anonymous listeners (anonymousId).
 * Anonymous listeners don't trigger user-left broadcasts to save Pusher events.
 */

import { apiHandler } from "../../../_utils/api-handler.js";
import {
  assertValidRoomId,
  assertValidUsername,
  isProfaneUsername,
} from "../../../_utils/_validation.js";
import { resolveRequestAuth } from "../../../_utils/request-auth.js";
import {
  getCurrentTimestamp,
  getSession,
  setSession,
  deleteSession,
} from "../../_helpers/_redis.js";
import { runtime, maxDuration } from "../../_helpers/_constants.js";
import type { LeaveSessionRequest } from "../../_helpers/_types.js";
import {
  broadcastDjChanged,
  broadcastSessionEnded,
  broadcastUserLeft,
} from "../../_helpers/_pusher.js";

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

    const body = (req.body || {}) as LeaveSessionRequest;
    const claimedUsername = body?.username?.toLowerCase();
    const anonymousId = body?.anonymousId?.trim();
    let username: string | null = null;

    if (claimedUsername && anonymousId) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Provide either username or anonymousId, not both" });
      return;
    }

    if (!anonymousId) {
      const auth = await resolveRequestAuth(req, redis, { required: true });
      if (auth.error || !auth.user) {
        logger.response(auth.error?.status ?? 401, Date.now() - startTime);
        res.status(auth.error?.status ?? 401).json({
          error: auth.error?.error ?? "Unauthorized - missing credentials",
        });
        return;
      }

      username = auth.user.username;
      if (claimedUsername && claimedUsername !== username) {
        logger.warn("Username mismatch in listen leave body", {
          claimedUsername,
          authenticatedUsername: username,
        });
        logger.response(403, Date.now() - startTime);
        res.status(403).json({ error: "Forbidden - username mismatch" });
        return;
      }
    }

    try {
      assertValidRoomId(sessionId, "listen-leave");
      if (username) {
        assertValidUsername(username, "listen-leave");
      }
    } catch (error) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: error instanceof Error ? error.message : "Validation error" });
      return;
    }

    if (username && isProfaneUsername(username)) {
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

      if (username) {
        if (session.hostUsername === username) {
          await deleteSession(sessionId);
          await broadcastSessionEnded(sessionId);

          logger.info("Listen session ended by host", { sessionId, username });
          logger.response(200, Date.now() - startTime);
          res.status(200).json({ success: true });
          return;
        }

        const userIndex = session.users.findIndex((u) => u.username === username);
        const wasDj = session.djUsername === username;
        const userExisted = userIndex !== -1;

        if (userIndex !== -1) {
          session.users.splice(userIndex, 1);
        }

        if (wasDj) {
          const nextDj = session.users.sort((a, b) => a.joinedAt - b.joinedAt)[0]?.username;
          if (nextDj) {
            const previousDj = session.djUsername;
            session.djUsername = nextDj;
            await broadcastDjChanged(sessionId, { previousDj, newDj: nextDj });
          }
        }

        session.lastSyncAt = getCurrentTimestamp();
        session.users.sort((a, b) => a.joinedAt - b.joinedAt);

        await setSession(sessionId, session);

        if (userExisted) {
          await broadcastUserLeft(sessionId, { username });
        }

        logger.info("User left listen session", { sessionId, username });
        logger.response(200, Date.now() - startTime);
        res.status(200).json({ success: true, session });
      } else {
        if (!session.anonymousListeners) {
          session.anonymousListeners = [];
        }

        const listenerIndex = session.anonymousListeners.findIndex(
          (listener) => listener.anonymousId === anonymousId
        );

        if (listenerIndex !== -1) {
          session.anonymousListeners.splice(listenerIndex, 1);
        }

        session.lastSyncAt = getCurrentTimestamp();
        await setSession(sessionId, session);

        logger.info("Anonymous listener left", { sessionId, anonymousId });
        logger.response(200, Date.now() - startTime);
        res.status(200).json({ success: true });
      }
    } catch (error) {
      logger.error("Failed to leave listen session", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to leave session" });
    }
  }
);
