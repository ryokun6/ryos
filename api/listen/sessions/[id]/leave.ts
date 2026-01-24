/**
 * POST /api/listen/sessions/[id]/leave
 * Leave a listen-together session
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
  deleteSession,
} from "../../_helpers/_redis.js";
import { runtime, maxDuration } from "../../_helpers/_constants.js";
import type { LeaveSessionRequest } from "../../_helpers/_types.js";
import {
  broadcastDjChanged,
  broadcastSessionEnded,
  broadcastUserLeft,
} from "../../_helpers/_pusher.js";

export { runtime, maxDuration };

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);
  const sessionId = req.query.id as string | undefined;

  logger.request(req.method || "POST", req.url || "/api/listen/sessions/[id]/leave", `listen-leave:${sessionId}`);

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

  const body = req.body as LeaveSessionRequest;
  const username = body?.username?.toLowerCase();

  if (!username) {
    logger.response(400, Date.now() - startTime);
    res.status(400).json({ error: "Username is required" });
    return;
  }

  try {
    assertValidUsername(username, "listen-leave");
    assertValidRoomId(sessionId, "listen-leave");
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
    const session = await getSession(sessionId);

    if (!session) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "Session not found" });
      return;
    }

    if (session.hostUsername === username) {
      await deleteSession(sessionId);
      await broadcastSessionEnded(sessionId);

      logger.info("Listen session ended by host", { sessionId, username });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true });
      return;
    }

    const userIndex = session.users.findIndex((user) => user.username === username);
    const wasDj = session.djUsername === username;
    const userExisted = userIndex !== -1;

    if (userIndex !== -1) {
      session.users.splice(userIndex, 1);
    }

    if (wasDj) {
      const nextDj = session.users.sort((a, b) => a.joinedAt - b.joinedAt)[0]?.username;
      if (nextDj) {
        const previousDj = session.djUsername;
        session.djUsername = nextDj;
        await broadcastDjChanged(sessionId, { previousDj, newDj: nextDj });
      }
    }

    session.lastSyncAt = getCurrentTimestamp();
    session.users.sort((a, b) => a.joinedAt - b.joinedAt);

    await setSession(sessionId, session);

    if (userExisted) {
      await broadcastUserLeft(sessionId, { username });
    }

    logger.info("User left listen session", { sessionId, username });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ success: true, session });
  } catch (error) {
    logger.error("Failed to leave listen session", error);
    logger.response(500, Date.now() - startTime);
    res.status(500).json({ error: "Failed to leave session" });
  }
}
