/**
 * POST /api/listen/sessions/[id]/sync
 * Sync playback state (DJ only)
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
} from "../../_helpers/_redis.js";
import { runtime, maxDuration } from "../../_helpers/_constants.js";
import type { SyncSessionRequest } from "../../_helpers/_types.js";
import { broadcastDjChanged, broadcastSync } from "../../_helpers/_pusher.js";

export { runtime, maxDuration };

export default createApiHandler(
  {
    operation: "listen-sync",
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

    const { data: body, error } = ctx.parseJsonBody<SyncSessionRequest>();
    if (error || !body) {
      ctx.response.badRequest(error ?? "Invalid JSON body");
      return;
    }

    const username = body.username?.toLowerCase();
    const state = body.state;
    if (!username) {
      ctx.response.badRequest("Username is required");
      return;
    }

    if (!state) {
      ctx.response.badRequest("Sync state is required");
      return;
    }

    try {
      assertValidUsername(username, "listen-sync");
      assertValidRoomId(sessionId, "listen-sync");
    } catch (validationError) {
      ctx.response.badRequest(
        validationError instanceof Error
          ? validationError.message
          : "Validation error"
      );
      return;
    }

    if (isProfaneUsername(username)) {
      ctx.response.unauthorized("Unauthorized");
      return;
    }

    if (typeof state.isPlaying !== "boolean" || typeof state.positionMs !== "number") {
      ctx.response.badRequest("Invalid sync payload");
      return;
    }

    try {
      const session = await getSession(sessionId);
      if (!session) {
        ctx.response.notFound("Session not found");
        return;
      }

      if (!session.users.some((user) => user.username === username)) {
        ctx.response.forbidden("User not in session");
        return;
      }

      if (session.djUsername !== username) {
        ctx.response.forbidden("Only the DJ can sync playback");
        return;
      }

      const now = getCurrentTimestamp();
      session.currentTrackId = state.currentTrackId ?? null;
      session.currentTrackMeta = state.currentTrackMeta ?? null;
      session.isPlaying = state.isPlaying;
      session.positionMs = Math.max(0, Math.floor(state.positionMs));
      session.lastSyncAt = now;

      if (state.djUsername && state.djUsername.toLowerCase() !== session.djUsername) {
        const nextDj = state.djUsername.toLowerCase();
        const isValidDj = session.users.some((user) => user.username === nextDj);
        if (!isValidDj) {
          ctx.response.badRequest("DJ must be an active session member");
          return;
        }

        const previousDj = session.djUsername;
        session.djUsername = nextDj;
        await broadcastDjChanged(sessionId, { previousDj, newDj: nextDj });
      }

      await setSession(sessionId, session);

      const listenerCount = session.users.length + (session.anonymousListeners?.length ?? 0);
      await broadcastSync(sessionId, {
        currentTrackId: session.currentTrackId,
        currentTrackMeta: session.currentTrackMeta,
        isPlaying: session.isPlaying,
        positionMs: session.positionMs,
        timestamp: now,
        djUsername: session.djUsername,
        listenerCount,
      });

      ctx.logger.info("Listen session synced", {
        sessionId,
        username,
        positionMs: session.positionMs,
        isPlaying: session.isPlaying,
      });
      ctx.response.ok({ success: true });
    } catch (routeError) {
      ctx.logger.error("Failed to sync listen session", routeError);
      ctx.response.serverError("Failed to sync session");
    }
  }
);
