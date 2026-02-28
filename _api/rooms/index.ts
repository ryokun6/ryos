/**
 * /api/rooms
 *
 * GET  - List all rooms
 * POST - Create a new room
 */

import { createApiHandler } from "../_utils/handler.js";
import { isProfaneUsername } from "../_utils/_validation.js";
import { getRoomsWithCountsFast, setRoomPresence } from "./_helpers/_presence.js";
import { broadcastRoomCreated } from "./_helpers/_pusher.js";
import {
  generateId,
  getCurrentTimestamp,
  registerRoom,
  setRoom,
} from "./_helpers/_redis.js";
import type { Room } from "./_helpers/_types.js";

export const runtime = "nodejs";
export const maxDuration = 30;

interface CreateRoomRequest {
  name?: string;
  type?: "private" | "public";
  members?: string[];
}

export default createApiHandler(
  {
    operation: "rooms",
    methods: ["GET", "POST"],
  },
  async (_req, _res, ctx): Promise<void> => {
    if (ctx.method === "GET") {
      try {
        const username = ctx.getQueryParam("username")?.toLowerCase() || null;
        const allRooms = await getRoomsWithCountsFast();
        const visibleRooms = allRooms.filter((room) => {
          if (!room.type || room.type === "public") {
            return true;
          }
          if (room.type === "private" && room.members && username) {
            return room.members.includes(username);
          }
          return false;
        });

        ctx.logger.info("Listed rooms", {
          total: allRooms.length,
          visible: visibleRooms.length,
          username,
        });
        ctx.response.ok({ rooms: visibleRooms });
      } catch (routeError) {
        ctx.logger.error("Error fetching rooms", routeError);
        ctx.response.serverError("Failed to fetch rooms");
      }
      return;
    }

    const user = await ctx.requireAuth();
    if (!user) {
      return;
    }

    const { data: body, error } = ctx.parseJsonBody<CreateRoomRequest>();
    if (error || !body) {
      ctx.response.badRequest(error ?? "Invalid JSON body");
      return;
    }

    const {
      name: originalName,
      type = "public",
      members = [],
    } = body;

    if (!["public", "private"].includes(type)) {
      ctx.response.badRequest("Invalid room type");
      return;
    }

    if (type === "public") {
      if (!originalName) {
        ctx.response.badRequest("Room name is required for public rooms");
        return;
      }
      if (user.username !== "ryo") {
        ctx.response.forbidden("Forbidden - Only admin can create public rooms");
        return;
      }
      if (isProfaneUsername(originalName)) {
        ctx.response.badRequest("Room name contains inappropriate language");
        return;
      }
    }

    let normalizedMembers = [...(members || [])];
    if (type === "private") {
      if (!members || members.length === 0) {
        ctx.response.badRequest("At least one member is required for private rooms");
        return;
      }
      normalizedMembers = members.map((member: string) => member.toLowerCase());
      if (!normalizedMembers.includes(user.username)) {
        normalizedMembers.push(user.username);
      }
    }

    const roomName =
      type === "public"
        ? originalName!.toLowerCase().replace(/ /g, "-")
        : [...normalizedMembers]
            .sort()
            .map((member: string) => `@${member}`)
            .join(", ");

    try {
      const roomId = generateId();
      const room: Room = {
        id: roomId,
        name: roomName,
        type,
        createdAt: getCurrentTimestamp(),
        userCount: type === "private" ? normalizedMembers.length : 0,
        ...(type === "private" && { members: normalizedMembers }),
      };

      await setRoom(roomId, room);
      await registerRoom(roomId);

      if (type === "private") {
        await Promise.all(
          normalizedMembers.map((member: string) => setRoomPresence(roomId, member))
        );
      }

      await broadcastRoomCreated(room);
      ctx.logger.info("Pusher room-created broadcast sent", { roomId, type });
      ctx.logger.info("Room created", {
        roomId,
        type,
        name: roomName,
        username: user.username,
      });
      ctx.response.created({ room });
    } catch (routeError) {
      ctx.logger.error("Error creating room", routeError);
      ctx.response.serverError("Failed to create room");
    }
  }
);
