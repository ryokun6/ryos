/**
 * POST /api/live/sessions/[id]/join
 * Join a Live Desktop session
 */

import { apiHandler } from "../../../_utils/api-handler.js";
import {
  assertValidRoomId,
  assertValidUsername,
  isProfaneUsername,
} from "../../../_utils/_validation.js";
import { resolveRequestAuth } from "../../../_utils/request-auth.js";
import { getCurrentTimestamp, getSession, setSession } from "../../_helpers/_redis.js";
import {
  LIVE_SESSION_MAX_USERS,
  runtime,
  maxDuration,
} from "../../_helpers/_constants.js";
import type { JoinLiveSessionRequest } from "../../_helpers/_types.js";
import { broadcastUserJoined } from "../../_helpers/_pusher.js";

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

    const body = (req.body || {}) as JoinLiveSessionRequest;
    const claimedUsername = body?.username?.toLowerCase();
    const username = auth.user.username;

    if (claimedUsername && claimedUsername !== username) {
      logger.warn("Username mismatch in live desktop join body", {
        claimedUsername,
        authenticatedUsername: username,
      });
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Forbidden - username mismatch" });
      return;
    }

    try {
      assertValidRoomId(sessionId, "live-desktop-join");
      assertValidUsername(username, "live-desktop-join");
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
      const [session, userData] = await Promise.all([
        getSession(sessionId),
        redis.get(`chat:users:${username}`),
      ]);

      if (!session) {
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "Session not found" });
        return;
      }

      if (!userData) {
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "User not found" });
        return;
      }

      const now = getCurrentTimestamp();
      const existingIndex = session.users.findIndex((u) => u.username === username);
      let shouldBroadcast = false;

      if (existingIndex === -1) {
        if (session.users.length >= LIVE_SESSION_MAX_USERS) {
          logger.response(403, Date.now() - startTime);
          res.status(403).json({ error: "Session is full" });
          return;
        }
        session.users.push({
          username,
          joinedAt: now,
          isOnline: true,
        });
        shouldBroadcast = true;
      } else {
        if (!session.users[existingIndex].isOnline) {
          shouldBroadcast = true;
        }
        session.users[existingIndex] = {
          ...session.users[existingIndex],
          isOnline: true,
        };
      }

      session.lastSyncAt = now;
      session.users.sort((a, b) => a.joinedAt - b.joinedAt);
      await setSession(sessionId, session);

      if (shouldBroadcast) {
        await broadcastUserJoined(sessionId, { username });
      }

      logger.info("User joined live desktop session", { sessionId, username });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ session });
      return;
    } catch (error) {
      logger.error("Failed to join live desktop session", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to join session" });
      return;
    }
  }
);
