/**
 * GET  /api/live/sessions - List active Live Desktop sessions
 * POST /api/live/sessions - Create a new Live Desktop session
 */

import { apiHandler } from "../../_utils/api-handler.js";
import {
  assertValidUsername,
  isProfaneUsername,
} from "../../_utils/_validation.js";
import { resolveRequestAuth } from "../../_utils/request-auth.js";
import {
  generateSessionId,
  getCurrentTimestamp,
  getActiveSessionIds,
  getSession,
  setSession,
} from "../_helpers/_redis.js";
import {
  LIVE_SESSION_MAX_USERS,
  LIVE_SESSION_STALE_THRESHOLD_MS,
  runtime,
  maxDuration,
} from "../_helpers/_constants.js";
import type {
  CreateLiveSessionRequest,
  LiveDesktopSession,
  LiveDesktopSessionSummary,
} from "../_helpers/_types.js";
import { broadcastUserJoined } from "../_helpers/_pusher.js";

export { runtime, maxDuration };

export default apiHandler(
  { methods: ["GET", "POST"] },
  async ({ req, res, redis, logger, startTime }) => {
    const method = (req.method || "GET").toUpperCase();

    if (method === "GET") {
      try {
        const sessionIds = await getActiveSessionIds();
        const now = Date.now();
        const sessions: LiveDesktopSessionSummary[] = [];

        const activeSessions = await Promise.all(
          sessionIds.map(async (id) => {
            const session = await getSession(id);
            if (!session) return null;
            const isStale =
              now - session.lastSyncAt > LIVE_SESSION_STALE_THRESHOLD_MS;
            if (isStale) return null;

            return {
              id: session.id,
              hostUsername: session.hostUsername,
              createdAt: session.createdAt,
              participantCount: session.users.length,
              currentAction: session.state.lastOperation?.type ?? null,
            } as LiveDesktopSessionSummary;
          })
        );

        for (const session of activeSessions) {
          if (session) sessions.push(session);
        }

        sessions.sort((a, b) => {
          if (b.participantCount !== a.participantCount) {
            return b.participantCount - a.participantCount;
          }
          return b.createdAt - a.createdAt;
        });

        logger.info("Listed live desktop sessions", { count: sessions.length });
        logger.response(200, Date.now() - startTime);
        res.status(200).json({ sessions });
        return;
      } catch (error) {
        logger.error("Failed to list live desktop sessions", error);
        logger.response(500, Date.now() - startTime);
        res.status(500).json({ error: "Failed to list sessions" });
        return;
      }
    }

    const auth = await resolveRequestAuth(req, redis, { required: true });
    if (auth.error || !auth.user) {
      logger.response(auth.error?.status ?? 401, Date.now() - startTime);
      res.status(auth.error?.status ?? 401).json({
        error: auth.error?.error ?? "Unauthorized - missing credentials",
      });
      return;
    }

    const body = (req.body || {}) as CreateLiveSessionRequest;
    const claimedUsername = body?.username?.toLowerCase();
    const username = auth.user.username;

    if (claimedUsername && claimedUsername !== username) {
      logger.warn("Username mismatch in live desktop create body", {
        claimedUsername,
        authenticatedUsername: username,
      });
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Forbidden - username mismatch" });
      return;
    }

    try {
      assertValidUsername(username, "live-desktop-session-create");
    } catch (error) {
      logger.response(400, Date.now() - startTime);
      res
        .status(400)
        .json({ error: error instanceof Error ? error.message : "Invalid username" });
      return;
    }

    if (isProfaneUsername(username)) {
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userData = await redis.get(`chat:users:${username}`);
    if (!userData) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (LIVE_SESSION_MAX_USERS < 1) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Session capacity unavailable" });
      return;
    }

    const now = getCurrentTimestamp();
    const sessionId = generateSessionId();
    const session: LiveDesktopSession = {
      id: sessionId,
      hostUsername: username,
      createdAt: now,
      lastSyncAt: now,
      users: [
        {
          username,
          joinedAt: now,
          isOnline: true,
        },
      ],
      state: {
        snapshot: null,
        lastOperation: null,
      },
    };

    try {
      await setSession(sessionId, session);
      await broadcastUserJoined(sessionId, { username });

      logger.info("Live desktop session created", { sessionId, username });
      logger.response(201, Date.now() - startTime);
      res.status(201).json({ session });
      return;
    } catch (error) {
      logger.error("Failed to create live desktop session", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to create session" });
      return;
    }
  }
);
