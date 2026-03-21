/**
 * POST /api/listen/sessions/[id]/sync
 * Sync playback state (DJ only)
 */

import { apiHandler } from "../../../_utils/api-handler.js";
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

export default apiHandler(
  { methods: ["POST"], auth: "required" },
  async ({ req, res, logger, startTime, user }) => {
    const sessionId = req.query.id as string | undefined;

    if (!sessionId) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Session ID is required" });
      return;
    }

    const body = (req.body || {}) as SyncSessionRequest;
    const claimedUsername = body?.username?.toLowerCase();
    const username = user!.username;
    const state = body?.state;

    if (claimedUsername && claimedUsername !== username) {
      logger.warn("Username mismatch in listen sync body", {
        claimedUsername,
        authenticatedUsername: username,
      });
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Forbidden - username mismatch" });
      return;
    }

    if (!state) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Sync state is required" });
      return;
    }

    try {
      assertValidUsername(username, "listen-sync");
      assertValidRoomId(sessionId, "listen-sync");
    } catch (error) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: error instanceof Error ? error.message : "Validation error" });
      return;
    }

    if (isProfaneUsername(username)) {
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (typeof state.isPlaying !== "boolean" || typeof state.positionMs !== "number") {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Invalid sync payload" });
      return;
    }

    try {
      const session = await getSession(sessionId);

      if (!session) {
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "Session not found" });
        return;
      }

      if (!session.users.some((u) => u.username === username)) {
        logger.response(403, Date.now() - startTime);
        res.status(403).json({ error: "User not in session" });
        return;
      }

      if (session.djUsername !== username) {
        logger.response(403, Date.now() - startTime);
        res.status(403).json({ error: "Only the DJ can sync playback" });
        return;
      }

      const now = getCurrentTimestamp();
      const nextTrackId = state.currentTrackId ?? null;
      const nextTrackMeta = state.currentTrackMeta ?? null;

      session.currentTrackId = nextTrackId;
      session.currentTrackMeta = nextTrackMeta;
      session.isPlaying = state.isPlaying;
      session.positionMs = Math.max(0, Math.floor(state.positionMs));
      session.lastSyncAt = now;

      if (state.djUsername && state.djUsername.toLowerCase() !== session.djUsername) {
        const nextDj = state.djUsername.toLowerCase();
        const isValidDj = session.users.some((u) => u.username === nextDj);
        if (!isValidDj) {
          logger.response(400, Date.now() - startTime);
          res.status(400).json({ error: "DJ must be an active session member" });
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
        sourceUsername: username,
      });

      logger.info("Listen session synced", {
        sessionId,
        username,
        positionMs: session.positionMs,
        isPlaying: session.isPlaying,
      });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true });
    } catch (error) {
      logger.error("Failed to sync listen session", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to sync session" });
    }
  }
);
