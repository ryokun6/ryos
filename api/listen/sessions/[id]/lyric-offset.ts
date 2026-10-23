/**
 * POST /api/listen/sessions/[id]/lyric-offset
 * Any current member may publish a per-song lyric offset for the room.
 */

import { z } from "zod";
import { apiHandler } from "../../../_utils/api-handler.js";
import {
  assertValidRoomId,
  assertValidUsername,
  isProfaneUsername,
} from "../../../_utils/_validation.js";
import { checkCounterLimit, makeKey } from "../../../_utils/_rate-limit.js";
import { getCurrentTimestamp, getSession, setSession } from "../../_helpers/_redis.js";
import {
  migrateSessionClientIds,
  normalizeClientInstanceId,
} from "../../_helpers/_client-instance.js";
import { broadcastLyricOffset } from "../../_helpers/_pusher.js";
import { clampLyricOffset } from "../../../../src/shared/songs/lyricOffsetWrite.js";
import {
  isSharedTrackId,
  normalizeLyricOffsetMap,
} from "../../../../src/shared/listen/lyricOffsets.js";

const bodySchema = z.object({
  username: z.string().optional(),
  clientInstanceId: z.string().optional(),
  trackId: z.string().min(1).max(80),
  lyricOffset: z.number(),
});

export default apiHandler(
  { methods: ["POST"], auth: "required", bodySchema },
  async ({ req, res, redis, logger, startTime, user, body }) => {
    const sessionId = req.query.id as string | undefined;
    if (!sessionId) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Session ID is required" });
      return;
    }

    const username = user!.username;
    const claimed = body.username?.toLowerCase();
    if (claimed && claimed !== username) {
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Forbidden - username mismatch" });
      return;
    }

    try {
      assertValidUsername(username, "listen-lyric-offset");
      assertValidRoomId(sessionId, "listen-lyric-offset");
    } catch (error) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({
        error: error instanceof Error ? error.message : "Validation error",
      });
      return;
    }

    if (isProfaneUsername(username)) {
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!isSharedTrackId(body.trackId)) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "invalid_track" });
      return;
    }

    const lyricOffset = clampLyricOffset(body.lyricOffset);
    if (lyricOffset == null) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "invalid_offset" });
      return;
    }

    try {
      const limit = await checkCounterLimit({
        key: makeKey(["rl", "listen", "lyric-offset", "user", username]),
        windowSeconds: 60,
        limit: 60,
        redis,
      });
      if (!limit.allowed) {
        logger.response(429, Date.now() - startTime);
        res.setHeader("Retry-After", String(limit.resetSeconds ?? 60));
        res.status(429).json({ error: "rate_limit_exceeded" });
        return;
      }
    } catch (error) {
      logger.error("Lyric offset rate limit check failed", error);
    }

    try {
      const session = await getSession(sessionId, redis);
      if (!session) {
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "Session not found" });
        return;
      }

      migrateSessionClientIds(session);
      const clientInstanceId = normalizeClientInstanceId(
        username,
        body.clientInstanceId
      );
      const member = session.users.some(
        (entry) =>
          entry.username === username && entry.clientInstanceId === clientInstanceId
      );
      if (!member) {
        logger.response(403, Date.now() - startTime);
        res.status(403).json({ error: "not_in_session" });
        return;
      }

      const lyricOffsets = {
        ...normalizeLyricOffsetMap(session.lyricOffsets),
        [body.trackId]: lyricOffset,
      };
      session.lyricOffsets = lyricOffsets;
      await setSession(sessionId, session, redis, { registerInIndex: false });

      const timestamp = getCurrentTimestamp();
      await broadcastLyricOffset(sessionId, {
        trackId: body.trackId,
        lyricOffset,
        timestamp,
        sourceUsername: username,
      });

      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true, trackId: body.trackId, lyricOffset });
    } catch (error) {
      logger.error("Failed to publish lyric offset", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to publish lyric offset" });
    }
  }
);
