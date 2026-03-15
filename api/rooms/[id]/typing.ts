/**
 * POST /api/rooms/[id]/typing
 * Broadcast a typing indicator to room members
 */

import { apiHandler } from "../../_utils/api-handler.js";
import { assertValidRoomId } from "../../_utils/_validation.js";
import { getRoom } from "../_helpers/_redis.js";
import { getRoomWriteAccessError } from "../_helpers/_access.js";
import { broadcastTypingIndicator } from "../_helpers/_pusher.js";

export const runtime = "nodejs";
export const maxDuration = 5;

export default apiHandler(
  { methods: ["POST"], auth: "required" },
  async ({ req, res, logger, startTime, user }) => {
    const roomId = req.query.id as string | undefined;

    if (!roomId) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Room ID is required" });
      return;
    }

    const username = user!.username;

    try {
      assertValidRoomId(roomId, "typing-indicator");
    } catch (e) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: e instanceof Error ? e.message : "Validation error" });
      return;
    }

    try {
      const roomData = await getRoom(roomId);
      if (!roomData) {
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "Room not found" });
        return;
      }

      const accessError = getRoomWriteAccessError(roomData, user!);
      if (accessError) {
        logger.response(accessError.status, Date.now() - startTime);
        res.status(accessError.status).json({ error: accessError.error });
        return;
      }

      const body = req.body || {};
      const isTyping = body.isTyping !== false;

      await broadcastTypingIndicator(roomId, { username, isTyping });

      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true });
    } catch (error) {
      logger.error(`Error broadcasting typing for room ${roomId}`, error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to broadcast typing" });
    }
  }
);
