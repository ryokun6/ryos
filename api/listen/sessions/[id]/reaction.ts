/**
 * POST /api/listen/sessions/[id]/reaction
 * Send an emoji reaction in a session
 * 
 * Requires logged-in user (username). Anonymous listeners cannot send reactions.
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
  generateSessionId,
  getCurrentTimestamp,
  getSession,
  setSession,
} from "../../_helpers/_redis.js";
import { runtime, maxDuration } from "../../_helpers/_constants.js";
import type { ReactionRequest } from "../../_helpers/_types.js";
import { broadcastReaction } from "../../_helpers/_pusher.js";

export { runtime, maxDuration };

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);
  const sessionId = req.query.id as string | undefined;

  logger.request(req.method || "POST", req.url || "/api/listen/sessions/[id]/reaction", `listen-reaction:${sessionId}`);

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

  const body = req.body as ReactionRequest;
  const username = body?.username?.toLowerCase();
  const emoji = body?.emoji?.trim();

  if (!username) {
    logger.response(400, Date.now() - startTime);
    res.status(400).json({ error: "Username is required" });
    return;
  }

  if (!emoji) {
    logger.response(400, Date.now() - startTime);
    res.status(400).json({ error: "Emoji is required" });
    return;
  }

  if (emoji.length > 8) {
    logger.response(400, Date.now() - startTime);
    res.status(400).json({ error: "Emoji is too long" });
    return;
  }

  try {
    assertValidUsername(username, "listen-reaction");
    assertValidRoomId(sessionId, "listen-reaction");
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

    if (!session.users.some((user) => user.username === username)) {
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "User not in session" });
      return;
    }

    const now = getCurrentTimestamp();
    const reactionId = generateSessionId();

    session.lastSyncAt = now;
    await setSession(sessionId, session);

    await broadcastReaction(sessionId, {
      id: reactionId,
      username,
      emoji,
      timestamp: now,
    });

    logger.info("Reaction sent", { sessionId, username, emoji });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error("Failed to send reaction", error);
    logger.response(500, Date.now() - startTime);
    res.status(500).json({ error: "Failed to send reaction" });
  }
}
