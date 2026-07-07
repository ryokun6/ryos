/**
 * POST /api/realtime/ticket
 *
 * Mints a short-lived, single-use ticket for authenticating a local
 * (self-hosted WebSocket) realtime connection. The HttpOnly auth cookie is
 * scoped to `/api` and unreadable from JS, so the WebSocket — which connects on
 * a different path — cannot rely on it. The authenticated client fetches a
 * ticket here (cookie/bearer auth) and presents it on the WS URL instead.
 *
 * Only relevant for the `local` realtime provider; with Pusher, channel
 * authorization happens via `/api/pusher/auth`.
 */

import { apiHandler } from "../_utils/api-handler.js";
import { issueRealtimeTicket } from "../_utils/realtime-auth.js";
import { getRealtimeProvider } from "../_utils/runtime-config.js";

export default apiHandler(
  {
    methods: ["POST"],
    auth: "required",
  },
  async ({ res, redis, logger, startTime, user }) => {
    if (getRealtimeProvider() !== "local") {
      logger.response(400, Date.now() - startTime);
      res
        .status(400)
        .json({ error: "Local realtime provider is not enabled" });
      return;
    }

    try {
      const ticket = await issueRealtimeTicket(redis, user!.username);
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ ticket });
    } catch (error) {
      logger.error("Failed to issue realtime ticket", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to issue realtime ticket" });
    }
  }
);
