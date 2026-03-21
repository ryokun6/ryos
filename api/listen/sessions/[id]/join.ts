/**
 * POST /api/listen/sessions/[id]/join
 * Join a listen-together session
 *
 * Supports both logged-in users (username) and anonymous listeners (anonymousId).
 * Anonymous listeners don't trigger user-joined broadcasts to save Pusher events.
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
} from "../../_helpers/_redis.js";
import {
  LISTEN_SESSION_MAX_USERS,
  runtime,
  maxDuration,
} from "../../_helpers/_constants.js";
import type {
  JoinSessionRequest,
  ListenSessionUser,
  ListenAnonymousListener,
} from "../../_helpers/_types.js";
import {
  migrateSessionClientIds,
  normalizeClientInstanceId,
} from "../../_helpers/_client-instance.js";
import { broadcastUserJoined } from "../../_helpers/_pusher.js";

export { runtime, maxDuration };

const MAX_ANONYMOUS_LISTENERS = 50;

export default apiHandler(
  { methods: ["POST"] },
  async ({ req, res, redis, logger, startTime }) => {
    const sessionId = req.query.id as string | undefined;

    if (!sessionId) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Session ID is required" });
      return;
    }

    const body = (req.body || {}) as JoinSessionRequest;
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
        logger.warn("Username mismatch in listen join body", {
          claimedUsername,
          authenticatedUsername: username,
        });
        logger.response(403, Date.now() - startTime);
        res.status(403).json({ error: "Forbidden - username mismatch" });
        return;
      }
    }

    try {
      assertValidRoomId(sessionId, "listen-join");
      if (username) {
        assertValidUsername(username, "listen-join");
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
      if (username) {
        const [session, userData] = await Promise.all([
          getSession(sessionId),
          redis.get(`chat:users:${username}`),
        ]);

        if (!session) {
          logger.response(404, Date.now() - startTime);
          res.status(404).json({ error: "Session not found" });
          return;
        }

        migrateSessionClientIds(session);

        if (!userData) {
          logger.response(404, Date.now() - startTime);
          res.status(404).json({ error: "User not found" });
          return;
        }

        const now = getCurrentTimestamp();
        const clientId = normalizeClientInstanceId(username, body.clientInstanceId);
        const existingIndex = session.users.findIndex(
          (u) => u.username === username && u.clientInstanceId === clientId
        );
        let shouldBroadcast = false;

        if (existingIndex === -1) {
          if (session.users.length >= LISTEN_SESSION_MAX_USERS) {
            logger.response(403, Date.now() - startTime);
            res.status(403).json({ error: "Session is full" });
            return;
          }

          const newUser: ListenSessionUser = {
            username,
            joinedAt: now,
            isOnline: true,
            clientInstanceId: clientId,
          };
          session.users.push(newUser);
          shouldBroadcast = true;
        } else {
          const existingUser = session.users[existingIndex];
          if (!existingUser.isOnline) {
            shouldBroadcast = true;
          }
          session.users[existingIndex] = {
            ...existingUser,
            isOnline: true,
            clientInstanceId: clientId,
          };
        }

        session.lastSyncAt = now;
        session.users.sort((a, b) => a.joinedAt - b.joinedAt);

        await setSession(sessionId, session);

        if (shouldBroadcast) {
          await broadcastUserJoined(sessionId, { username, clientInstanceId: clientId });
        }

        logger.info("User joined listen session", { sessionId, username });
        logger.response(200, Date.now() - startTime);
        res.status(200).json({ session });
      } else {
        const session = await getSession(sessionId);

        if (!session) {
          logger.response(404, Date.now() - startTime);
          res.status(404).json({ error: "Session not found" });
          return;
        }

        if (!session.anonymousListeners) {
          session.anonymousListeners = [];
        }

        const now = getCurrentTimestamp();
        const existingIndex = session.anonymousListeners.findIndex(
          (listener) => listener.anonymousId === anonymousId
        );

        if (existingIndex === -1) {
          if (session.anonymousListeners.length >= MAX_ANONYMOUS_LISTENERS) {
            logger.response(403, Date.now() - startTime);
            res.status(403).json({ error: "Too many listeners" });
            return;
          }

          const newListener: ListenAnonymousListener = {
            anonymousId: anonymousId!,
            joinedAt: now,
          };
          session.anonymousListeners.push(newListener);
        }

        session.lastSyncAt = now;
        await setSession(sessionId, session);

        logger.info("Anonymous listener joined", { sessionId, anonymousId });
        logger.response(200, Date.now() - startTime);
        res.status(200).json({ session });
      }
    } catch (error) {
      logger.error("Failed to join listen session", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to join session" });
    }
  }
);
