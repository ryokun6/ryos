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

const bodySchema = z.object({
  username: z.string().optional(),
  clientInstanceId: z.string().optional(),
  op: z.enum(["add", "addNext", "bump", "remove", "advance"]),
  trackId: z.string().optional(),
  title: z.string().optional(),
  artist: z.string().optional(),
  entryId: z.string().optional(),
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
    return { op: "advance" };
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

      const result = applyListenQueueCommand(
        session,
        { username, clientInstanceId },
        command,
        getCurrentTimestamp()
      );

      if (!result.ok) {
        logger.response(result.status, Date.now() - startTime);
        res.status(result.status).json({ error: result.error });
        return;
      }

      if (result.changed) {
        session.queue = result.queue;
        session.queueVersion = result.queueVersion;
        if (result.advanced && result.item) {
          session.currentTrackId = result.currentTrackId ?? result.item.trackId;
          session.currentTrackMeta = result.currentTrackMeta ?? {
            title: result.item.title,
            ...(result.item.artist ? { artist: result.item.artist } : {}),
          };
          session.isPlaying = true;
          session.positionMs = 0;
          session.lastSyncAt = getCurrentTimestamp();
        }
        await setSession(sessionId, session, redis, { registerInIndex: false });
      }

      const queue = result.queue;
      const queueVersion = result.queueVersion;
      const now = getCurrentTimestamp();

      if (result.changed) {
        await broadcastQueue(sessionId, { queue, queueVersion, timestamp: now });
      }

      if (result.advanced && result.item) {
        const listenerCount =
          session.users.length + (session.anonymousListeners?.length ?? 0);
        await broadcastSync(sessionId, {
          currentTrackId: session.currentTrackId,
          currentTrackMeta: session.currentTrackMeta,
          isPlaying: session.isPlaying,
          positionMs: session.positionMs,
          timestamp: session.lastSyncAt,
          hostUsername: session.hostUsername,
          hostClientInstanceId: session.hostClientInstanceId,
          djUsername: session.djUsername,
          djClientInstanceId: session.djClientInstanceId,
          listenerCount,
          sourceUsername: username,
          sourceClientInstanceId: clientInstanceId,
          queue,
          queueVersion,
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
      });
    } catch (error) {
      logger.error("Failed to update listen queue", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to update queue" });
    }
  }
);
