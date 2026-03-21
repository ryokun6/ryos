/**
 * GET  /api/listen/sessions - List all active listen-together sessions
 * POST /api/listen/sessions - Create a new listen-together session
 */

import { apiHandler } from "../../_utils/api-handler.js";
import {
  isProfaneUsername,
  assertValidUsername,
} from "../../_utils/_validation.js";
import { resolveRequestAuth } from "../../_utils/request-auth.js";
import {
  generateSessionId,
  getCurrentTimestamp,
  setSession,
  getActiveSessionIds,
  getSession,
} from "../_helpers/_redis.js";
import {
  LISTEN_SESSION_MAX_USERS,
  runtime,
  maxDuration,
} from "../_helpers/_constants.js";
import type { CreateSessionRequest, ListenSession } from "../_helpers/_types.js";
import { normalizeClientInstanceId } from "../_helpers/_client-instance.js";
import { broadcastUserJoined } from "../_helpers/_pusher.js";

export { runtime, maxDuration };

interface ListenSessionSummary {
  id: string;
  hostUsername: string;
  djUsername: string;
  createdAt: number;
  currentTrackMeta: {
    title: string;
    artist?: string;
    cover?: string;
  } | null;
  isPlaying: boolean;
  listenerCount: number;
}

export default apiHandler(
  { methods: ["GET", "POST"] },
  async ({ req, res, redis, logger, startTime }) => {
    const method = (req.method || "GET").toUpperCase();

    // GET - List all active sessions (no auth required)
    if (method === "GET") {
      try {
        const sessionIds = await getActiveSessionIds();
        const sessions: ListenSessionSummary[] = [];
        const now = Date.now();
        const STALE_THRESHOLD_MS = 30 * 60 * 1000;

        const sessionPromises = sessionIds.map(async (id) => {
          const session = await getSession(id);
          if (session) {
            const isStale = (now - session.lastSyncAt) > STALE_THRESHOLD_MS;

            if (isStale) {
              return null;
            }

            const listenerCount = session.users.length + (session.anonymousListeners?.length ?? 0);
            return {
              id: session.id,
              hostUsername: session.hostUsername,
              djUsername: session.djUsername,
              createdAt: session.createdAt,
              currentTrackMeta: session.currentTrackMeta,
              isPlaying: session.isPlaying,
              listenerCount,
            } as ListenSessionSummary;
          }
          return null;
        });

        const results = await Promise.all(sessionPromises);
        for (const session of results) {
          if (session) {
            sessions.push(session);
          }
        }

        sessions.sort((a, b) => {
          if (b.listenerCount !== a.listenerCount) {
            return b.listenerCount - a.listenerCount;
          }
          return b.createdAt - a.createdAt;
        });

        logger.info("Listed sessions", { count: sessions.length });
        logger.response(200, Date.now() - startTime);
        res.status(200).json({ sessions });
        return;
      } catch (error) {
        logger.error("Failed to list sessions", error);
        logger.response(500, Date.now() - startTime);
        res.status(500).json({ error: "Failed to list sessions" });
        return;
      }
    }

    // POST - Create session (requires auth, resolved manually)
    const auth = await resolveRequestAuth(req, redis, { required: true });
    if (auth.error || !auth.user) {
      logger.response(auth.error?.status ?? 401, Date.now() - startTime);
      res.status(auth.error?.status ?? 401).json({
        error: auth.error?.error ?? "Unauthorized - missing credentials",
      });
      return;
    }

    const body = (req.body || {}) as CreateSessionRequest;
    const claimedUsername = body?.username?.toLowerCase();
    const username = auth.user.username;

    if (claimedUsername && claimedUsername !== username) {
      logger.warn("Username mismatch in listen create body", {
        claimedUsername,
        authenticatedUsername: username,
      });
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Forbidden - username mismatch" });
      return;
    }

    try {
      assertValidUsername(username, "listen-session-create");
    } catch (error) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid username" });
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

    if (LISTEN_SESSION_MAX_USERS < 1) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Session capacity unavailable" });
      return;
    }

    const sessionId = generateSessionId();
    const now = getCurrentTimestamp();
    const hostClientId = normalizeClientInstanceId(username, body.clientInstanceId);

    const session: ListenSession = {
      id: sessionId,
      hostUsername: username,
      hostClientInstanceId: hostClientId,
      djUsername: username,
      djClientInstanceId: hostClientId,
      createdAt: now,
      currentTrackId: null,
      currentTrackMeta: null,
      isPlaying: false,
      positionMs: 0,
      lastSyncAt: now,
      users: [
        {
          username,
          joinedAt: now,
          isOnline: true,
          clientInstanceId: hostClientId,
        },
      ],
      anonymousListeners: [],
    };

    try {
      await setSession(sessionId, session);
      await broadcastUserJoined(sessionId, { username, clientInstanceId: hostClientId });

      logger.info("Listen session created", { sessionId, username });
      logger.response(201, Date.now() - startTime);
      res.status(201).json({ session });
    } catch (error) {
      logger.error("Failed to create listen session", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to create session" });
    }
  }
);
