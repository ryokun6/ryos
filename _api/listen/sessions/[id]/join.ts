/**
 * POST /api/listen/sessions/[id]/join
 * Join a listen-together session
 *
 * Supports both logged-in users (username) and anonymous listeners (anonymousId).
 * Anonymous listeners don't trigger user-joined broadcasts to save Pusher events.
 */

import { createApiHandler } from "../../../_utils/handler.js";
import {
  assertValidRoomId,
  assertValidUsername,
  isProfaneUsername,
} from "../../../_utils/_validation.js";
import {
  createRedisClient,
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
import { broadcastUserJoined } from "../../_helpers/_pusher.js";

export { runtime, maxDuration };

const MAX_ANONYMOUS_LISTENERS = 50; // Limit anonymous listeners

export default createApiHandler(
  {
    operation: "listen-join",
    methods: ["POST"],
    cors: {
      headers: ["Content-Type"],
    },
  },
  async (_req, _res, ctx): Promise<void> => {
    const sessionId = ctx.getQueryParam("id");
    if (!sessionId) {
      ctx.response.badRequest("Session ID is required");
      return;
    }

    const { data: body, error } = ctx.parseJsonBody<JoinSessionRequest>();
    if (error || !body) {
      ctx.response.badRequest(error ?? "Invalid JSON body");
      return;
    }

    const username = body.username?.toLowerCase();
    const anonymousId = body.anonymousId;
    if (!username && !anonymousId) {
      ctx.response.badRequest("Username or anonymousId is required");
      return;
    }

    try {
      assertValidRoomId(sessionId, "listen-join");
      if (username) {
        assertValidUsername(username, "listen-join");
      }
    } catch (validationError) {
      ctx.response.badRequest(
        validationError instanceof Error
          ? validationError.message
          : "Validation error"
      );
      return;
    }

    if (username && isProfaneUsername(username)) {
      ctx.response.unauthorized("Unauthorized");
      return;
    }

    try {
      const redis = createRedisClient();

      if (username) {
        const [session, userData] = await Promise.all([
          getSession(sessionId),
          redis.get(`chat:users:${username}`),
        ]);

        if (!session) {
          ctx.response.notFound("Session not found");
          return;
        }

        if (!userData) {
          ctx.response.notFound("User not found");
          return;
        }

        const now = getCurrentTimestamp();
        const existingIndex = session.users.findIndex((user) => user.username === username);
        let shouldBroadcast = false;

        if (existingIndex === -1) {
          if (session.users.length >= LISTEN_SESSION_MAX_USERS) {
            ctx.response.forbidden("Session is full");
            return;
          }

          const newUser: ListenSessionUser = {
            username,
            joinedAt: now,
            isOnline: true,
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
          };
        }

        session.lastSyncAt = now;
        session.users.sort((a, b) => a.joinedAt - b.joinedAt);
        await setSession(sessionId, session);

        if (shouldBroadcast) {
          await broadcastUserJoined(sessionId, { username });
        }

        ctx.logger.info("User joined listen session", { sessionId, username });
        ctx.response.ok({ session });
        return;
      }

      const session = await getSession(sessionId);
      if (!session) {
        ctx.response.notFound("Session not found");
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
          ctx.response.forbidden("Too many listeners");
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

      ctx.logger.info("Anonymous listener joined", { sessionId, anonymousId });
      ctx.response.ok({ session });
    } catch (routeError) {
      ctx.logger.error("Failed to join listen session", routeError);
      ctx.response.serverError("Failed to join session");
    }
  }
);
