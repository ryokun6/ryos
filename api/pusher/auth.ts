/**
 * POST /api/pusher/auth
 *
 * Pusher channel authorization endpoint. Signs subscriptions to
 * authorization-requiring channels (`private-…`, `presence-…`) only after
 * verifying the authenticated user is allowed to access the channel.
 */

import { apiHandler } from "../_utils/api-handler.js";
import { authorizeRealtimeChannel } from "../_utils/realtime-auth.js";
import { authorizePusherChannel } from "../_utils/realtime.js";
import { getRealtimeProvider } from "../_utils/runtime-config.js";
import { GLOBAL_PRESENCE_CHANNEL } from "../../src/shared/constants/realtime.js";

interface PusherAuthRequest {
  socket_id?: string;
  channel_name?: string;
}

export default apiHandler<PusherAuthRequest>(
  {
    methods: ["POST"],
    auth: "required",
    parseJsonBody: true,
  },
  async ({ res, logger, startTime, user, body }) => {
    if (getRealtimeProvider() !== "pusher") {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Pusher realtime provider is not enabled" });
      return;
    }

    const socketId = body?.socket_id;
    const channelName = body?.channel_name;

    if (!socketId || !channelName) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "socket_id and channel_name are required" });
      return;
    }

    const username = user!.username;

    const allowed = await authorizeRealtimeChannel(channelName, username);
    if (!allowed) {
      logger.warn("Denied realtime channel authorization", {
        channelName,
        username,
      });
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Forbidden - channel access denied" });
      return;
    }

    try {
      const isPresence = channelName === GLOBAL_PRESENCE_CHANNEL;
      const authResponse = authorizePusherChannel(
        socketId,
        channelName,
        isPresence ? { user_id: username } : undefined
      );

      logger.response(200, Date.now() - startTime);
      res.status(200).json(authResponse);
    } catch (error) {
      logger.error("Failed to sign Pusher channel", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to authorize channel" });
    }
  }
);
