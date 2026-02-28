/**
 * POST /api/listen/sessions/[id]/leave
 * Leave a listen-together session
 *
 * Supports both logged-in users (username) and anonymous listeners (anonymousId).
 * Anonymous listeners don't trigger user-left broadcasts to save Pusher events.
 */

import { createApiHandler } from "../../../_utils/handler.js";
import {
  assertValidRoomId,
  assertValidUsername,
  isProfaneUsername,
} from "../../../_utils/_validation.js";
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

export default createApiHandler(
  {
    operation: "listen-leave",
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

    const { data: body, error } = ctx.parseJsonBody<LeaveSessionRequest>();
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
      assertValidRoomId(sessionId, "listen-leave");
      if (username) {
        assertValidUsername(username, "listen-leave");
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
      const session = await getSession(sessionId);
      if (!session) {
        ctx.response.notFound("Session not found");
        return;
      }

      if (username) {
        if (session.hostUsername === username) {
          await deleteSession(sessionId);
          await broadcastSessionEnded(sessionId);
          ctx.logger.info("Listen session ended by host", { sessionId, username });
          ctx.response.ok({ success: true });
          return;
        }

        const userIndex = session.users.findIndex((user) => user.username === username);
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

        ctx.logger.info("User left listen session", { sessionId, username });
        ctx.response.ok({ success: true, session });
        return;
      }

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

      ctx.logger.info("Anonymous listener left", { sessionId, anonymousId });
      ctx.response.ok({ success: true });
    } catch (routeError) {
      ctx.logger.error("Failed to leave listen session", routeError);
      ctx.response.serverError("Failed to leave session");
    }
  }
);
