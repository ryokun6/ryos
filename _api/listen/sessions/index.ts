/**
 * GET  /api/listen/sessions - List all active listen-together sessions
 * POST /api/listen/sessions - Create a new listen-together session
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  isProfaneUsername,
  assertValidUsername,
} from "../../_utils/_validation.js";
import { initLogger } from "../../_utils/_logging.js";
import {
  isAllowedOrigin,
  getEffectiveOrigin,
  setCorsHeaders,
} from "../../_utils/_cors.js";
import {
  createRedisClient,
  generateSessionId,
  getCurrentTimestamp,
  setSession,
  getActiveSessionIds,
  getSession,
} from "../_helpers/_redis.js";
import {
  LISTEN_SESSION_MAX_USERS,
  runtime,
  maxDuration,
} from "../_helpers/_constants.js";
import type { CreateSessionRequest, ListenSession } from "../_helpers/_types.js";
import { broadcastUserJoined } from "../_helpers/_pusher.js";

export { runtime, maxDuration };

/**
 * Session summary for list view (excludes sensitive/heavy data)
 */
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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);

  logger.request(req.method || "GET", req.url || "/api/listen/sessions", "listen-sessions");

  if (req.method === "OPTIONS") {
    setCorsHeaders(res, origin, { methods: ["GET", "POST", "OPTIONS"], headers: ["Content-Type"] });
    res.setHeader("Content-Type", "application/json");
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  setCorsHeaders(res, origin, { methods: ["GET", "POST", "OPTIONS"], headers: ["Content-Type"] });
  res.setHeader("Content-Type", "application/json");

  if (!isAllowedOrigin(origin)) {
    logger.response(403, Date.now() - startTime);
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  // GET - List all active sessions
  if (req.method === "GET") {
    try {
      const sessionIds = await getActiveSessionIds();
      const sessions: ListenSessionSummary[] = [];
      const now = Date.now();
      // Consider sessions stale if no activity in the last 30 minutes
      const STALE_THRESHOLD_MS = 30 * 60 * 1000;

      // Fetch all sessions in parallel
      const sessionPromises = sessionIds.map(async (id) => {
        const session = await getSession(id);
        if (session) {
          // Only filter out truly stale sessions (no sync in 30+ minutes)
          // Allow paused sessions and sessions without a track loaded
          const isStale = (now - session.lastSyncAt) > STALE_THRESHOLD_MS;
          
          if (isStale) {
            return null;
          }

          const listenerCount = session.users.length + (session.anonymousListeners?.length ?? 0);
          return {
            id: session.id,
            hostUsername: session.hostUsername,
            djUsername: session.djUsername,
            createdAt: session.createdAt,
            currentTrackMeta: session.currentTrackMeta,
            isPlaying: session.isPlaying,
            listenerCount,
          } as ListenSessionSummary;
        }
        return null;
      });

      const results = await Promise.all(sessionPromises);
      for (const session of results) {
        if (session) {
          sessions.push(session);
        }
      }

      // Sort by listener count (most popular first), then by creation time
      sessions.sort((a, b) => {
        if (b.listenerCount !== a.listenerCount) {
          return b.listenerCount - a.listenerCount;
        }
        return b.createdAt - a.createdAt;
      });

      logger.info("Listed sessions", { count: sessions.length });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ sessions });
      return;
    } catch (error) {
      logger.error("Failed to list sessions", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to list sessions" });
      return;
    }
  }

  if (req.method !== "POST") {
    logger.response(405, Date.now() - startTime);
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = req.body as CreateSessionRequest;
  const username = body?.username?.toLowerCase();

  if (!username) {
    logger.response(400, Date.now() - startTime);
    res.status(400).json({ error: "Username is required" });
    return;
  }

  try {
    assertValidUsername(username, "listen-session-create");
  } catch (error) {
    logger.response(400, Date.now() - startTime);
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid username" });
    return;
  }

  if (isProfaneUsername(username)) {
    logger.response(401, Date.now() - startTime);
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const redis = createRedisClient();
  const userData = await redis.get(`chat:users:${username}`);
  if (!userData) {
    logger.response(404, Date.now() - startTime);
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (LISTEN_SESSION_MAX_USERS < 1) {
    logger.response(400, Date.now() - startTime);
    res.status(400).json({ error: "Session capacity unavailable" });
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

    logger.info("Listen session created", { sessionId, username });
    logger.response(201, Date.now() - startTime);
    res.status(201).json({ session });
  } catch (error) {
    logger.error("Failed to create listen session", error);
    logger.response(500, Date.now() - startTime);
    res.status(500).json({ error: "Failed to create session" });
  }
}
