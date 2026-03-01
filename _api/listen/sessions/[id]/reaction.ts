/**
 * POST /api/listen/sessions/[id]/reaction
 * Send an emoji reaction in a session
 *
 * Requires logged-in user (username). Anonymous listeners cannot send reactions.
 */

import { createApiHandler } from "../../../_utils/handler.js";
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

export default createApiHandler(
  {
    operation: "listen-reaction",
    methods: ["POST"],
    cors: {
      headers: ["Content-Type"],
    },
  },
  async (_req, _res, ctx): Promise<void> => {
    const sessionId = ctx.getQueryParam("id");
    if (!sessionId) {
      ctx.response.badRequest("Session ID is required");
      return;
    }

    const { data: body, error } = ctx.parseJsonBody<ReactionRequest>();
    if (error || !body) {
      ctx.response.badRequest(error ?? "Invalid JSON body");
      return;
    }

    const username = body.username?.toLowerCase();
    const emoji = body.emoji?.trim();
    if (!username) {
      ctx.response.badRequest("Username is required");
      return;
    }

    if (!emoji) {
      ctx.response.badRequest("Emoji is required");
      return;
    }

    if (emoji.length > 8) {
      ctx.response.badRequest("Emoji is too long");
      return;
    }

    try {
      assertValidUsername(username, "listen-reaction");
      assertValidRoomId(sessionId, "listen-reaction");
    } catch (validationError) {
      ctx.response.badRequest(
        validationError instanceof Error
          ? validationError.message
          : "Validation error"
      );
      return;
    }

    if (isProfaneUsername(username)) {
      ctx.response.unauthorized("Unauthorized");
      return;
    }

    try {
      const session = await getSession(sessionId);
      if (!session) {
        ctx.response.notFound("Session not found");
        return;
      }

      if (!session.users.some((user) => user.username === username)) {
        ctx.response.forbidden("User not in session");
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

      ctx.logger.info("Reaction sent", { sessionId, username, emoji });
      ctx.response.ok({ success: true });
    } catch (routeError) {
      ctx.logger.error("Failed to send reaction", routeError);
      ctx.response.serverError("Failed to send reaction");
    }
  }
);
