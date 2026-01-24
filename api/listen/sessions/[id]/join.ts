/**
 * POST /api/listen/sessions/[id]/join
 * Join a listen-together session
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
  createRedisClient,
  getCurrentTimestamp,
  getSession,
  setSession,
} from "../../_helpers/_redis.js";
import {
  LISTEN_SESSION_MAX_USERS,
  runtime,
  maxDuration,
} from "../../_helpers/_constants.js";
import type {
  JoinSessionRequest,
  ListenSessionUser,
} from "../../_helpers/_types.js";
import { broadcastUserJoined } from "../../_helpers/_pusher.js";

export { runtime, maxDuration };

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);
  const sessionId = req.query.id as string | undefined;

  logger.request(req.method || "POST", req.url || "/api/listen/sessions/[id]/join", `listen-join:${sessionId}`);

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

  const body = req.body as JoinSessionRequest;
  const username = body?.username?.toLowerCase();

  if (!username) {
    logger.response(400, Date.now() - startTime);
    res.status(400).json({ error: "Username is required" });
    return;
  }

  try {
    assertValidUsername(username, "listen-join");
    assertValidRoomId(sessionId, "listen-join");
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

  try {
    const redis = createRedisClient();
    const [session, userData] = await Promise.all([
      getSession(sessionId),
      redis.get(`chat:users:${username}`),
    ]);

    if (!session) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "Session not found" });
      return;
    }

    if (!userData) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "User not found" });
      return;
    }

    const now = getCurrentTimestamp();
    const existingIndex = session.users.findIndex((user) => user.username === username);
    let shouldBroadcast = false;

    if (existingIndex === -1) {
      if (session.users.length >= LISTEN_SESSION_MAX_USERS) {
        logger.response(403, Date.now() - startTime);
        res.status(403).json({ error: "Session is full" });
        return;
      }

      const newUser: ListenSessionUser = {
        username,
        joinedAt: now,
        isOnline: true,
      };
      session.users.push(newUser);
      shouldBroadcast = true;
    } else {
      const existingUser = session.users[existingIndex];
      if (!existingUser.isOnline) {
        shouldBroadcast = true;
      }
      session.users[existingIndex] = {
        ...existingUser,
        isOnline: true,
      };
    }

    session.lastSyncAt = now;
    session.users.sort((a, b) => a.joinedAt - b.joinedAt);

    await setSession(sessionId, session);

    if (shouldBroadcast) {
      await broadcastUserJoined(sessionId, { username });
    }

    logger.info("User joined listen session", { sessionId, username });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ session });
  } catch (error) {
    logger.error("Failed to join listen session", error);
    logger.response(500, Date.now() - startTime);
    res.status(500).json({ error: "Failed to join session" });
  }
}
