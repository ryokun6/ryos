/**
 * GET /api/listen/sessions/[id]
 * Fetch session state
 */

import { createApiHandler } from "../../../_utils/handler.js";
import { assertValidRoomId } from "../../../_utils/_validation.js";
import {
  getSession,
  touchSession,
} from "../../_helpers/_redis.js";
import { runtime, maxDuration } from "../../_helpers/_constants.js";

export { runtime, maxDuration };

export default createApiHandler(
  {
    operation: "listen-session",
    methods: ["GET"],
  },
  async (_req, _res, ctx): Promise<void> => {
    const sessionId = ctx.getQueryParam("id");
    if (!sessionId) {
      ctx.response.badRequest("Session ID is required");
      return;
    }

    try {
      assertValidRoomId(sessionId, "listen-session-get");
    } catch (validationError) {
      ctx.response.badRequest(
        validationError instanceof Error
          ? validationError.message
          : "Invalid session ID"
      );
      return;
    }

    try {
      const session = await getSession(sessionId);
      if (!session) {
        ctx.response.notFound("Session not found");
        return;
      }

      await touchSession(sessionId);
      ctx.logger.info("Listen session fetched", { sessionId });
      ctx.response.ok({ session });
    } catch (routeError) {
      ctx.logger.error("Failed to fetch listen session", routeError);
      ctx.response.serverError("Failed to fetch session");
    }
  }
);
