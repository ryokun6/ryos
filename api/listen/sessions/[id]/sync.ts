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
import type { SyncSessionRequest } from "../../_helpers/_types.js";
import {
  migrateSessionClientIds,
  normalizeClientInstanceId,
} from "../../_helpers/_client-instance.js";
import { broadcastDjChanged, broadcastSync } from "../../_helpers/_pusher.js";
import { normalizeListenQueue } from "../../../../src/shared/listen/queue.js";
import { normalizeLyricOffsetMap } from "../../../../src/shared/listen/lyricOffsets.js";
import {
  clampTrackDurationMs,
  incomingSyncIsStaleAdvance,
} from "../../../../src/shared/listen/trackAdvance.js";

export default apiHandler(
  { methods: ["POST"], auth: "required" },
  async ({ req, res, redis, logger, startTime, user }) => {
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
      const session = await getSession(sessionId, redis);

      if (!session) {
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "Session not found" });
        return;
      }

      migrateSessionClientIds(session);

      const callerClientId = normalizeClientInstanceId(username, body.clientInstanceId);

      if (
        !session.users.some(
          (u) => u.username === username && u.clientInstanceId === callerClientId
        )
      ) {
        logger.response(403, Date.now() - startTime);
        res.status(403).json({ error: "User not in session" });
        return;
      }

      if (
        session.djUsername !== username ||
        session.djClientInstanceId !== callerClientId
      ) {
        logger.response(403, Date.now() - startTime);
        res.status(403).json({ error: "Only the DJ can sync playback" });
        return;
      }

      const now = getCurrentTimestamp();
      const loadedTrackId = session.currentTrackId;
      const loadedSyncAt = session.lastSyncAt;
      const nextTrackId = state.currentTrackId ?? null;
      const nextTrackMeta = state.currentTrackMeta ?? null;

      session.currentTrackId = nextTrackId;
      session.currentTrackMeta = nextTrackMeta;
      session.isPlaying = state.isPlaying;
      session.positionMs = Math.max(0, Math.floor(state.positionMs));
      session.lastSyncAt = now;
      const durationMs = clampTrackDurationMs(state.durationMs);
      if (durationMs != null && nextTrackId === loadedTrackId) {
        session.currentTrackDurationMs = durationMs;
      } else if (durationMs != null && nextTrackId !== loadedTrackId) {
        session.currentTrackDurationMs = durationMs;
      } else if (nextTrackId !== loadedTrackId) {
        session.currentTrackDurationMs = undefined;
      }

      const requestedDj =
        state.djUsername != null && String(state.djUsername).trim() !== ""
          ? String(state.djUsername).toLowerCase()
          : session.djUsername;
      const nextClientRaw = state.djClientInstanceId;
      const nextClientIdFromState =
        typeof nextClientRaw === "string" && nextClientRaw.trim().length > 0
          ? normalizeClientInstanceId(requestedDj, nextClientRaw)
          : undefined;

      const djOrClientChanged =
        requestedDj !== session.djUsername ||
        (nextClientIdFromState != null &&
          nextClientIdFromState !== session.djClientInstanceId);

      if (djOrClientChanged) {
        let targetUser = undefined as (typeof session.users)[0] | undefined;
        if (requestedDj === session.djUsername) {
          if (nextClientIdFromState == null) {
            logger.response(400, Date.now() - startTime);
            res.status(400).json({ error: "djClientInstanceId is required for same-user handoff" });
            return;
          }
          targetUser = session.users.find(
            (u) => u.username === requestedDj && u.clientInstanceId === nextClientIdFromState
          );
        } else if (nextClientIdFromState != null) {
          targetUser = session.users.find(
            (u) => u.username === requestedDj && u.clientInstanceId === nextClientIdFromState
          );
        } else {
          const sorted = [...session.users].sort((a, b) => a.joinedAt - b.joinedAt);
          targetUser = sorted.find((u) => u.username === requestedDj);
        }
        if (!targetUser) {
          logger.response(400, Date.now() - startTime);
          res.status(400).json({ error: "DJ must be an active session member" });
          return;
        }

        const previousDj = session.djUsername;
        session.djUsername = requestedDj;
        session.djClientInstanceId =
          targetUser.clientInstanceId ?? normalizeClientInstanceId(requestedDj, undefined);
        await broadcastDjChanged(sessionId, {
          previousDj,
          newDj: session.djUsername,
          newDjClientInstanceId: session.djClientInstanceId,
        });
      }

      // Re-read so a queue write that landed during this request is not
      // replaced by the playback snapshot we loaded at the start.
      const latest = await getSession(sessionId, redis);
      if (
        latest &&
        incomingSyncIsStaleAdvance({
          loadedTrackId,
          djTrackId: nextTrackId,
          latestTrackId: latest.currentTrackId,
          loadedSyncAt,
          latestSyncAt: latest.lastSyncAt,
        })
      ) {
        session.currentTrackId = latest.currentTrackId;
        session.currentTrackMeta = latest.currentTrackMeta;
        session.isPlaying = latest.isPlaying;
        session.positionMs = latest.positionMs;
        session.lastSyncAt = latest.lastSyncAt;
        session.currentTrackDurationMs = latest.currentTrackDurationMs;
        session.lyricOffsets = normalizeLyricOffsetMap(latest.lyricOffsets);
        session.queue = normalizeListenQueue(latest.queue);
        session.queueVersion = latest.queueVersion ?? 0;
        session.acceptedEndTrackId = latest.acceptedEndTrackId;
      } else if (latest) {
        session.queue = normalizeListenQueue(latest.queue);
        session.queueVersion = latest.queueVersion ?? 0;
        session.lyricOffsets = normalizeLyricOffsetMap(
          latest.lyricOffsets ?? session.lyricOffsets
        );
        session.acceptedEndTrackId = latest.acceptedEndTrackId ?? session.acceptedEndTrackId;
      }

      await setSession(sessionId, session, redis, { registerInIndex: false });

      const listenerCount = session.users.length + (session.anonymousListeners?.length ?? 0);

      await broadcastSync(sessionId, {
        currentTrackId: session.currentTrackId,
        currentTrackMeta: session.currentTrackMeta,
        isPlaying: session.isPlaying,
        positionMs: session.positionMs,
        timestamp: now,
        hostUsername: session.hostUsername,
        hostClientInstanceId: session.hostClientInstanceId,
        djUsername: session.djUsername,
        djClientInstanceId: session.djClientInstanceId,
        listenerCount,
        sourceUsername: username,
        sourceClientInstanceId: callerClientId,
          queue: normalizeListenQueue(session.queue),
          queueVersion: session.queueVersion ?? 0,
          durationMs: session.currentTrackDurationMs,
          lyricOffsets: normalizeLyricOffsetMap(session.lyricOffsets),
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
