/**
 * POST /api/listen/sessions/[id]/queue
 * Shared Karaoke queue for a listen-together session.
 *
 * Any current member may add, play next, bump, or remove. The DJ may advance
 * (pop the next song into playback). Non-members are rejected.
 */

import { z } from "zod";
import { apiHandler } from "../../../_utils/api-handler.js";
import {
  assertValidRoomId,
  assertValidUsername,
  isProfaneUsername,
} from "../../../_utils/_validation.js";
import { checkCounterLimit, makeKey } from "../../../_utils/_rate-limit.js";
import {
  applyListenQueueCommand,
  LISTEN_QUEUE_ADVANCE_LIMIT,
  LISTEN_QUEUE_ADVANCE_WINDOW_SECONDS,
  LISTEN_QUEUE_MUTATION_LIMIT,
  LISTEN_QUEUE_MUTATION_WINDOW_SECONDS,
  type ListenQueueCommand,
} from "../../../../src/shared/listen/queue.js";
import {
  generateSessionId,
  getCurrentTimestamp,
  getSession,
  setSession,
} from "../../_helpers/_redis.js";
import type { ListenQueueRequest } from "../../_helpers/_types.js";
import {
  migrateSessionClientIds,
  normalizeClientInstanceId,
} from "../../_helpers/_client-instance.js";
import { broadcastQueue, broadcastSync } from "../../_helpers/_pusher.js";
import { redisKeys } from "../../../../src/shared/redisKeys.js";

const bodySchema = z.object({
  username: z.string().optional(),
  clientInstanceId: z.string().optional(),
  op: z.enum(["add", "addNext", "bump", "remove", "advance"]),
  trackId: z.string().optional(),
  title: z.string().optional(),
  artist: z.string().optional(),
  entryId: z.string().optional(),
  endedTrackId: z.string().max(80).optional(),
});

function commandFromBody(
  body: ListenQueueRequest,
  entryId: string
): ListenQueueCommand | null {
  if (body.op === "add" || body.op === "addNext") {
    return {
      op: body.op,
      trackId: (body.trackId ?? "").trim(),
      title: body.title ?? "",
      artist: body.artist,
      entryId,
    };
  }
  if (body.op === "bump" || body.op === "remove") {
    return { op: body.op, entryId: body.entryId ?? "" };
  }
  if (body.op === "advance") {
    const endedTrackId = body.endedTrackId?.trim();
    return endedTrackId ? { op: "advance", endedTrackId } : { op: "advance" };
  }
  return null;
}

export default apiHandler(
  { methods: ["POST"], auth: "required", bodySchema },
  async ({ req, res, redis, logger, startTime, user, body }) => {
    const sessionId = req.query.id as string | undefined;
    if (!sessionId) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Session ID is required" });
      return;
    }

    const parsed = body as ListenQueueRequest;
    const claimedUsername = parsed.username?.toLowerCase();
    const username = user!.username;

    if (claimedUsername && claimedUsername !== username) {
      logger.warn("Username mismatch in listen queue body", {
        claimedUsername,
        authenticatedUsername: username,
      });
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Forbidden - username mismatch" });
      return;
    }

    try {
      assertValidUsername(username, "listen-queue");
      assertValidRoomId(sessionId, "listen-queue");
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

    const advance = parsed.op === "advance";
    try {
      const limit = await checkCounterLimit({
        key: makeKey([
          "rl",
          "listen-queue",
          advance ? "advance" : "mutate",
          username,
        ]),
        windowSeconds: advance
          ? LISTEN_QUEUE_ADVANCE_WINDOW_SECONDS
          : LISTEN_QUEUE_MUTATION_WINDOW_SECONDS,
        limit: advance ? LISTEN_QUEUE_ADVANCE_LIMIT : LISTEN_QUEUE_MUTATION_LIMIT,
        redis,
      });
      if (!limit.allowed) {
        logger.response(429, Date.now() - startTime);
        res.setHeader("Retry-After", String(limit.resetSeconds ?? 60));
        res.status(429).json({ error: "rate_limit_exceeded" });
        return;
      }
    } catch (error) {
      logger.error("Listen queue rate limit check failed", error);
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
        parsed.clientInstanceId
      );
      const command = commandFromBody(parsed, generateSessionId());
      if (!command) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "invalid_op" });
        return;
      }

      const endedTrackId =
        command.op === "advance" ? command.endedTrackId : undefined;
      if (endedTrackId) {
        const lockKey = redisKeys.session.listenAdvance(sessionId, endedTrackId);
        const locked = await redis.set(lockKey, "1", { nx: true, ex: 30 });
        if (!locked) {
          const latest = await getSession(sessionId, redis);
          const moved = latest != null && latest.currentTrackId !== endedTrackId;
          logger.response(200, Date.now() - startTime);
          res.status(200).json({
            success: true,
            queue: latest?.queue ?? session.queue ?? [],
            queueVersion: latest?.queueVersion ?? session.queueVersion ?? 0,
            advanced: false,
            item: null,
            alreadyAdvanced: moved,
            pending: !moved,
          });
          return;
        }
      }

      const fresh = endedTrackId ? await getSession(sessionId, redis) : session;
      const working = fresh ?? session;
      const result = applyListenQueueCommand(
        working,
        { username, clientInstanceId },
        command,
        getCurrentTimestamp()
      );
      if (endedTrackId && !result.ok) {
        await redis.del(redisKeys.session.listenAdvance(sessionId, endedTrackId));
      }

      if (!result.ok) {
        logger.response(result.status, Date.now() - startTime);
        res.status(result.status).json({ error: result.error });
        return;
      }

      const acceptEnd =
        Boolean(endedTrackId) && (result.advanced || result.libraryFallback === true);
      if (acceptEnd && endedTrackId) {
        working.acceptedEndTrackId = endedTrackId;
      }
      if (result.changed) {
        working.queue = result.queue;
        working.queueVersion = result.queueVersion;
        if (result.advanced && result.item) {
          working.currentTrackId = result.currentTrackId ?? result.item.trackId;
          working.currentTrackMeta = result.currentTrackMeta ?? {
            title: result.item.title,
            ...(result.item.artist ? { artist: result.item.artist } : {}),
          };
          working.isPlaying = true;
          working.positionMs = 0;
          working.lastSyncAt = getCurrentTimestamp();
        }
      }
      if (result.changed || acceptEnd) {
        await setSession(sessionId, working, redis, { registerInIndex: false });
      }

      const queue = result.queue;
      const queueVersion = result.queueVersion;
      const now = getCurrentTimestamp();

      if (result.changed) {
        await broadcastQueue(sessionId, { queue, queueVersion, timestamp: now });
      }

      if (result.advanced && result.item) {
        const listenerCount =
          working.users.length + (working.anonymousListeners?.length ?? 0);
        await broadcastSync(sessionId, {
          currentTrackId: working.currentTrackId,
          currentTrackMeta: working.currentTrackMeta,
          isPlaying: working.isPlaying,
          positionMs: working.positionMs,
          timestamp: working.lastSyncAt,
          hostUsername: working.hostUsername,
          hostClientInstanceId: working.hostClientInstanceId,
          djUsername: working.djUsername,
          djClientInstanceId: working.djClientInstanceId,
          listenerCount,
          sourceUsername: username,
          sourceClientInstanceId: clientInstanceId,
          queue,
          queueVersion,
          durationMs: working.currentTrackDurationMs,
          lyricOffsets: working.lyricOffsets,
        });
      }

      logger.info("Listen queue updated", {
        sessionId,
        username,
        op: parsed.op,
        queueLength: queue.length,
        advanced: result.advanced,
      });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({
        success: true,
        queue,
        queueVersion,
        advanced: result.advanced,
        item: result.item ?? null,
        alreadyAdvanced: result.alreadyAdvanced ?? false,
        libraryFallback: result.libraryFallback ?? false,
        djStale: result.djStale ?? false,
        pending: false,
      });
    } catch (error) {
      logger.error("Failed to update listen queue", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to update queue" });
    }
  }
);
