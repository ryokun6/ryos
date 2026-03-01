/**
 * /api/rooms/[id]/messages/[msgId]
 *
 * DELETE - Delete a specific message (admin only)
 */

import { createApiHandler } from "../../../_utils/handler.js";
import { assertValidRoomId } from "../../../_utils/_validation.js";
import { broadcastMessageDeleted } from "../../_helpers/_pusher.js";
import {
  deleteMessage as deleteMessageFromRedis,
  getRoom,
  roomExists,
} from "../../_helpers/_redis.js";

export const runtime = "nodejs";

export default createApiHandler(
  {
    operation: "room-message-delete",
    methods: ["DELETE"],
  },
  async (_req, _res, ctx): Promise<void> => {
    const user = await ctx.requireAuth({
      requireAdmin: true,
      forbiddenMessage: "Forbidden - admin required",
    });
    if (!user) {
      return;
    }

    const roomId = ctx.getQueryParam("id");
    const messageId = ctx.getQueryParam("msgId");
    if (!roomId || !messageId) {
      ctx.logger.warn("Missing IDs", { roomId, messageId });
      ctx.response.badRequest("Room ID and message ID are required");
      return;
    }

    try {
      assertValidRoomId(roomId, "delete-message");
    } catch (validationError) {
      ctx.logger.warn("Invalid room ID", {
        roomId,
        error:
          validationError instanceof Error
            ? validationError.message
            : "Invalid",
      });
      ctx.response.badRequest(
        validationError instanceof Error
          ? validationError.message
          : "Invalid room ID"
      );
      return;
    }

    try {
      const exists = await roomExists(roomId);
      if (!exists) {
        ctx.logger.warn("Room not found", { roomId });
        ctx.response.notFound("Room not found");
        return;
      }

      const roomData = await getRoom(roomId);
      if (!roomData) {
        ctx.logger.warn("Room not found during message deletion", { roomId });
        ctx.response.notFound("Room not found");
        return;
      }

      const deleted = await deleteMessageFromRedis(roomId, messageId);
      if (!deleted) {
        ctx.logger.warn("Message not found", { roomId, messageId });
        ctx.response.notFound("Message not found");
        return;
      }

      await broadcastMessageDeleted(roomId, messageId, roomData);
      ctx.logger.info("Pusher message-deleted broadcast sent", {
        roomId,
        messageId,
      });
      ctx.logger.info("Message deleted", { roomId, messageId });
      ctx.response.ok({ success: true });
    } catch (routeError) {
      ctx.logger.error(
        `Error deleting message ${messageId} from room ${roomId}`,
        routeError
      );
      ctx.response.serverError("Failed to delete message");
    }
  }
);
