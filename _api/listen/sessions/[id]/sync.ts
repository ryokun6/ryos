/**
 * POST /api/listen/sessions/[id]/sync
 * Sync playback state (DJ only)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  assertValidRoomId,
  assertValidUsername,
  isProfaneUsername,
} from "../../../_utils/_validation.js";
import { initLogger } from "../../../_utils/_logging.js";
import {
  isAllowedOrigin,
  getEffectiveOrigin,
  setCorsHeaders,
} from "../../../_utils/_cors.js";
import {
  getCurrentTimestamp,
  getSession,
  setSession,
} from "../../_helpers/_redis.js";
import { runtime, maxDuration } from "../../_helpers/_constants.js";
import type { SyncSessionRequest } from "../../_helpers/_types.js";
import { broadcastDjChanged, broadcastSync } from "../../_helpers/_pusher.js";

export { runtime, maxDuration };

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);
  const sessionId = req.query.id as string | undefined;

  logger.request(req.method || "POST", req.url || "/api/listen/sessions/[id]/sync", `listen-sync:${sessionId}`);

  if (req.method === "OPTIONS") {
    setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] });
    res.setHeader("Content-Type", "application/json");
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] });
  res.setHeader("Content-Type", "application/json");

  if (!isAllowedOrigin(origin)) {
    logger.response(403, Date.now() - startTime);
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  if (req.method !== "POST") {
    logger.response(405, Date.now() - startTime);
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!sessionId) {
    logger.response(400, Date.now() - startTime);
    res.status(400).json({ error: "Session ID is required" });
    return;
  }

  const body = req.body as SyncSessionRequest;
  const username = body?.username?.toLowerCase();
  const state = body?.state;

  if (!username) {
    logger.response(400, Date.now() - startTime);
    res.status(400).json({ error: "Username is required" });
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

    if (!session.users.some((user) => user.username === username)) {
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
      const isValidDj = session.users.some((user) => user.username === nextDj);
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

    // Calculate total listener count (users + anonymous)
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
