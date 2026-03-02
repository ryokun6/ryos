/**
 * POST /api/listen/sessions/[id]/reaction
 * Send an emoji reaction in a session
 *
 * Requires logged-in user (username). Anonymous listeners cannot send reactions.
 */

import { apiHandler } from "../../../_utils/api-handler.js";
import {
  assertValidRoomId,
  assertValidUsername,
  isProfaneUsername,
} from "../../../_utils/_validation.js";
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

export default apiHandler(
  { methods: ["POST"], auth: "required" },
  async ({ req, res, logger, startTime, user }) => {
    const sessionId = req.query.id as string | undefined;

    if (!sessionId) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Session ID is required" });
      return;
    }

    const body = (req.body || {}) as ReactionRequest;
    const claimedUsername = body?.username?.toLowerCase();
    const username = user!.username;
    const emoji = body?.emoji?.trim();

    if (claimedUsername && claimedUsername !== username) {
      logger.warn("Username mismatch in listen reaction body", {
        claimedUsername,
        authenticatedUsername: username,
      });
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Forbidden - username mismatch" });
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

      if (!session.users.some((u) => u.username === username)) {
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
);
