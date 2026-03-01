/**
 * POST /api/rooms/[id]/join
 *
 * Join a room
 */

import { createApiHandler } from "../../_utils/handler.js";
import {
  assertValidRoomId,
  assertValidUsername,
  isProfaneUsername,
} from "../../_utils/_validation.js";
import { refreshRoomUserCount, setRoomPresence } from "../_helpers/_presence.js";
import { broadcastRoomUpdated } from "../_helpers/_pusher.js";
import { getRoom, setRoom } from "../_helpers/_redis.js";
import type { Room } from "../_helpers/_types.js";

export const runtime = "nodejs";
export const maxDuration = 15;

interface JoinRoomRequest {
  username?: string;
}

export default createApiHandler(
  {
    operation: "join-room",
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

    const { data: body, error } = ctx.parseJsonBody<JoinRoomRequest>();
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
      assertValidUsername(username, "join-room");
      assertValidRoomId(roomId, "join-room");
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
      const [roomData, userData] = await Promise.all([
        getRoom(roomId),
        ctx.redis.get(`chat:users:${username}`),
      ]);

      if (!roomData) {
        ctx.response.notFound("Room not found");
        return;
      }

      if (!userData) {
        ctx.response.notFound("User not found");
        return;
      }

      await setRoomPresence(roomId, username);
      const userCount = await refreshRoomUserCount(roomId);
      const updatedRoom: Room = { ...roomData, userCount };
      await setRoom(roomId, updatedRoom);
      await broadcastRoomUpdated(roomId);

      ctx.logger.info("User joined room", { roomId, username, userCount });
      ctx.response.ok({ success: true });
    } catch (routeError) {
      ctx.logger.error(`Error joining room ${roomId}`, routeError);
      ctx.response.serverError("Failed to join room");
    }
  }
);
