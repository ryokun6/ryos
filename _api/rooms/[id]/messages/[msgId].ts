/**
 * /api/rooms/[id]/messages/[msgId]
 * 
 * DELETE - Delete a specific message (admin only)
 */

import { assertValidRoomId } from "../../../_utils/_validation.js";
import {
  getRoom,
  roomExists,
  deleteMessage as deleteMessageFromRedis,
} from "../../_helpers/_redis.js";
import { apiHandler } from "../../../_utils/api-handler.js";
import { broadcastMessageDeleted } from "../../_helpers/_pusher.js";

export const runtime = "nodejs";

export default apiHandler(
  {
    methods: ["DELETE"],
    auth: "required",
  },
  async ({ req, res, logger, startTime, user }) => {
    const username = user?.username || "";
    if (username !== "ryo") {
      logger.warn("Admin required", { username });
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Forbidden - admin required" });
      return;
    }

    // Extract room ID and message ID from query params
    const roomId = req.query.id as string | undefined;
    const messageId = req.query.msgId as string | undefined;

    if (!roomId || !messageId) {
      logger.warn("Missing IDs", { roomId, messageId });
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Room ID and message ID are required" });
      return;
    }

    try {
      assertValidRoomId(roomId, "delete-message");
    } catch (e) {
      logger.warn("Invalid room ID", {
        roomId,
        error: e instanceof Error ? e.message : "Invalid",
      });
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: e instanceof Error ? e.message : "Invalid room ID" });
      return;
    }

    try {
      const exists = await roomExists(roomId);
      if (!exists) {
        logger.warn("Room not found", { roomId });
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "Room not found" });
        return;
      }

      const roomData = await getRoom(roomId);
      if (!roomData) {
        logger.warn("Room not found during message deletion", { roomId });
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "Room not found" });
        return;
      }

      const deleted = await deleteMessageFromRedis(roomId, messageId);
      if (!deleted) {
        logger.warn("Message not found", { roomId, messageId });
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "Message not found" });
        return;
      }

      await broadcastMessageDeleted(roomId, messageId, roomData);
      logger.info("Pusher message-deleted broadcast sent", { roomId, messageId });

      logger.info("Message deleted", { roomId, messageId });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true });
    } catch (error) {
      logger.error(`Error deleting message ${messageId} from room ${roomId}`, error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to delete message" });
    }
  }
);
