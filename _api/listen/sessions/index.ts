/**
 * GET  /api/listen/sessions - List all active listen-together sessions
 * POST /api/listen/sessions - Create a new listen-together session
 */

import { createApiHandler } from "../../_utils/handler.js";
import {
  assertValidUsername,
  isProfaneUsername,
} from "../../_utils/_validation.js";
import {
  LISTEN_SESSION_MAX_USERS,
  maxDuration,
  runtime,
} from "../_helpers/_constants.js";
import { broadcastUserJoined } from "../_helpers/_pusher.js";
import {
  createRedisClient,
  generateSessionId,
  getActiveSessionIds,
  getCurrentTimestamp,
  getSession,
  setSession,
} from "../_helpers/_redis.js";
import type {
  CreateSessionRequest,
  ListenSession,
} from "../_helpers/_types.js";

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

export default createApiHandler(
  {
    operation: "listen-sessions",
    methods: ["GET", "POST"],
    cors: {
      headers: ["Content-Type"],
    },
  },
  async (_req, _res, ctx): Promise<void> => {
    if (ctx.method === "GET") {
      try {
        const sessionIds = await getActiveSessionIds();
        const now = Date.now();
        const staleThresholdMs = 30 * 60 * 1000;

        const results = await Promise.all(
          sessionIds.map(async (id) => {
            const session = await getSession(id);
            if (!session) {
              return null;
            }

            if (now - session.lastSyncAt > staleThresholdMs) {
              return null;
            }

            const listenerCount =
              session.users.length + (session.anonymousListeners?.length ?? 0);

            return {
              id: session.id,
              hostUsername: session.hostUsername,
              djUsername: session.djUsername,
              createdAt: session.createdAt,
              currentTrackMeta: session.currentTrackMeta,
              isPlaying: session.isPlaying,
              listenerCount,
            } as ListenSessionSummary;
          })
        );

        const sessions = results.filter(
          (session): session is ListenSessionSummary => session !== null
        );

        sessions.sort((a, b) => {
          if (b.listenerCount !== a.listenerCount) {
            return b.listenerCount - a.listenerCount;
          }
          return b.createdAt - a.createdAt;
        });

        ctx.logger.info("Listed sessions", { count: sessions.length });
        ctx.response.ok({ sessions });
      } catch (routeError) {
        ctx.logger.error("Failed to list sessions", routeError);
        ctx.response.serverError("Failed to list sessions");
      }
      return;
    }

    const { data: body, error } = ctx.parseJsonBody<CreateSessionRequest>();
    if (error || !body) {
      ctx.response.badRequest(error ?? "Invalid JSON body");
      return;
    }

    const username = body.username?.toLowerCase();
    if (!username) {
      ctx.response.badRequest("Username is required");
      return;
    }

    try {
      assertValidUsername(username, "listen-session-create");
    } catch (validationError) {
      ctx.response.badRequest(
        validationError instanceof Error
          ? validationError.message
          : "Invalid username"
      );
      return;
    }

    if (isProfaneUsername(username)) {
      ctx.response.unauthorized("Unauthorized");
      return;
    }

    const redis = createRedisClient();
    const userData = await redis.get(`chat:users:${username}`);
    if (!userData) {
      ctx.response.notFound("User not found");
      return;
    }

    if (LISTEN_SESSION_MAX_USERS < 1) {
      ctx.response.badRequest("Session capacity unavailable");
      return;
    }

    const sessionId = generateSessionId();
    const now = getCurrentTimestamp();
    const session: ListenSession = {
      id: sessionId,
      hostUsername: username,
      djUsername: username,
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
        },
      ],
      anonymousListeners: [],
    };

    try {
      await setSession(sessionId, session);
      await broadcastUserJoined(sessionId, { username });
      ctx.logger.info("Listen session created", { sessionId, username });
      ctx.response.created({ session });
    } catch (routeError) {
      ctx.logger.error("Failed to create listen session", routeError);
      ctx.response.serverError("Failed to create session");
    }
  }
);
