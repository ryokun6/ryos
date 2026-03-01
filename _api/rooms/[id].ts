/**
 * /api/rooms/[id]
 *
 * GET    - Get a single room
 * DELETE - Delete a room
 */

import { createApiHandler } from "../_utils/handler.js";
import { assertValidRoomId } from "../_utils/_validation.js";
import {
  CHAT_ROOMS_SET,
  CHAT_ROOM_PREFIX,
  CHAT_ROOM_USERS_PREFIX,
} from "./_helpers/_constants.js";
import { deleteRoomPresence, refreshRoomUserCount } from "./_helpers/_presence.js";
import { broadcastRoomDeleted, broadcastRoomUpdated } from "./_helpers/_pusher.js";
import { getRoom, setRoom } from "./_helpers/_redis.js";
import type { Room } from "./_helpers/_types.js";

export const runtime = "nodejs";
export const maxDuration = 30;

export default createApiHandler(
  {
    operation: "room",
    methods: ["DELETE", "GET"],
  },
  async (_req, _res, ctx): Promise<void> => {
    const roomId = ctx.getQueryParam("id");
    if (!roomId) {
      ctx.response.badRequest("Room ID is required");
      return;
    }

    try {
      assertValidRoomId(roomId, "room-operation");
    } catch (validationError) {
      ctx.response.badRequest(
        validationError instanceof Error
          ? validationError.message
          : "Invalid room ID"
      );
      return;
    }

    if (ctx.method === "GET") {
      try {
        const roomObj = await getRoom(roomId);
        if (!roomObj) {
          ctx.response.notFound("Room not found");
          return;
        }
        const userCount = await refreshRoomUserCount(roomId);
        const room: Room = { ...roomObj, userCount };
        ctx.logger.info("Room fetched", { roomId, userCount });
        ctx.response.ok({ room });
      } catch (routeError) {
        ctx.logger.error(`Error fetching room ${roomId}`, routeError);
        ctx.response.serverError("Failed to fetch room");
      }
      return;
    }

    const user = await ctx.requireAuth();
    if (!user) {
      return;
    }

    try {
      const roomData = await getRoom(roomId);
      if (!roomData) {
        ctx.response.notFound("Room not found");
        return;
      }

      if (roomData.type === "private") {
        if (!roomData.members || !roomData.members.includes(user.username)) {
          ctx.response.forbidden("Unauthorized - not a member");
          return;
        }
      } else if (user.username !== "ryo") {
        ctx.response.forbidden("Unauthorized - admin required");
        return;
      }

      if (roomData.type === "private") {
        const updatedMembers = roomData.members!.filter(
          (member) => member !== user.username
        );
        if (updatedMembers.length <= 1) {
          const pipeline = ctx.redis.pipeline();
          pipeline.del(`${CHAT_ROOM_PREFIX}${roomId}`);
          pipeline.del(`chat:messages:${roomId}`);
          pipeline.del(`${CHAT_ROOM_USERS_PREFIX}${roomId}`);
          pipeline.srem(CHAT_ROOMS_SET, roomId);
          await pipeline.exec();
          await deleteRoomPresence(roomId);

          await broadcastRoomDeleted(roomId, roomData.type, roomData.members || []);
          ctx.logger.info("Pusher room-deleted broadcast sent", {
            roomId,
            scope: "private-last-member",
          });
        } else {
          const updatedRoom: Room = {
            ...roomData,
            members: updatedMembers,
            userCount: updatedMembers.length,
          };
          await setRoom(roomId, updatedRoom);
          await broadcastRoomUpdated(roomId);
          await broadcastRoomDeleted(roomId, roomData.type, [user.username]);
          ctx.logger.info("Pusher private leave broadcasts sent", {
            roomId,
            remainingMembers: updatedMembers.length,
            leftUser: user.username,
          });
        }
      } else {
        const pipeline = ctx.redis.pipeline();
        pipeline.del(`${CHAT_ROOM_PREFIX}${roomId}`);
        pipeline.del(`chat:messages:${roomId}`);
        pipeline.del(`${CHAT_ROOM_USERS_PREFIX}${roomId}`);
        pipeline.srem(CHAT_ROOMS_SET, roomId);
        await pipeline.exec();
        await deleteRoomPresence(roomId);

        await broadcastRoomDeleted(roomId, roomData.type, roomData.members || []);
        ctx.logger.info("Pusher room-deleted broadcast sent", {
          roomId,
          scope: "public",
        });
      }

      ctx.logger.info("Room deleted", { roomId, username: user.username });
      ctx.response.ok({ success: true });
    } catch (routeError) {
      ctx.logger.error(`Error deleting room ${roomId}`, routeError);
      ctx.response.serverError("Failed to delete room");
    }
  }
);
