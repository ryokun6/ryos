/**
 * POST /api/rooms/[id]/leave
 *
 * Leave a room
 */

import { createApiHandler } from "../../_utils/handler.js";
import {
  assertValidRoomId,
  assertValidUsername,
  isProfaneUsername,
} from "../../_utils/_validation.js";
import {
  CHAT_ROOMS_SET,
  CHAT_ROOM_PREFIX,
  CHAT_ROOM_USERS_PREFIX,
} from "../_helpers/_constants.js";
import {
  deleteRoomPresence,
  refreshRoomUserCount,
  removeRoomPresence,
} from "../_helpers/_presence.js";
import { broadcastRoomDeleted, broadcastRoomUpdated } from "../_helpers/_pusher.js";
import { getRoom, setRoom } from "../_helpers/_redis.js";
import type { Room } from "../_helpers/_types.js";

export const runtime = "nodejs";
export const maxDuration = 15;

interface LeaveRoomRequest {
  username?: string;
}

export default createApiHandler(
  {
    operation: "leave-room",
    methods: ["POST"],
    cors: {
      headers: ["Content-Type"],
    },
  },
  async (_req, _res, ctx): Promise<void> => {
    const roomId = ctx.getQueryParam("id");
    if (!roomId) {
      ctx.response.badRequest("Room ID is required");
      return;
    }

    const { data: body, error } = ctx.parseJsonBody<LeaveRoomRequest>();
    if (error || !body) {
      ctx.response.badRequest(error ?? "Invalid JSON body");
      return;
    }

    const username = body.username?.toLowerCase();
    if (!username) {
      ctx.response.badRequest("Username is required");
      return;
    }

    try {
      assertValidUsername(username, "leave-room");
      assertValidRoomId(roomId, "leave-room");
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
      const roomData = await getRoom(roomId);
      if (!roomData) {
        ctx.response.notFound("Room not found");
        return;
      }

      const removed = await removeRoomPresence(roomId, username);

      if (removed) {
        const userCount = await refreshRoomUserCount(roomId);

        if (roomData.type === "private") {
          const updatedMembers = roomData.members
            ? roomData.members.filter((member) => member !== username)
            : [];

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
              userCount,
            };
            await setRoom(roomId, updatedRoom);
            await broadcastRoomUpdated(roomId);
            await broadcastRoomDeleted(roomId, roomData.type, [username]);
            ctx.logger.info("Pusher private leave broadcasts sent", {
              roomId,
              remainingMembers: updatedMembers.length,
              leftUser: username,
            });
          }
        } else {
          await broadcastRoomUpdated(roomId);
        }
      }

      ctx.logger.info("User left room", { roomId, username });
      ctx.response.ok({ success: true });
    } catch (routeError) {
      ctx.logger.error(`Error leaving room ${roomId}`, routeError);
      ctx.response.serverError("Failed to leave room");
    }
  }
);
