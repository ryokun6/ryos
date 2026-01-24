/**
 * POST /api/listen/sessions
 * Create a new listen-together session
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
} from "../_helpers/_redis.js";
import {
  LISTEN_SESSION_MAX_USERS,
  runtime,
  maxDuration,
} from "../_helpers/_constants.js";
import type { CreateSessionRequest, ListenSession } from "../_helpers/_types.js";
import { broadcastUserJoined } from "../_helpers/_pusher.js";

export { runtime, maxDuration };

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);

  logger.request(req.method || "POST", req.url || "/api/listen/sessions", "listen-session-create");

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
