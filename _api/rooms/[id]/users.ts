/**
 * GET /api/rooms/[id]/users
 *
 * Get active users in a room
 */

import { createApiHandler } from "../../_utils/handler.js";
import { assertValidRoomId } from "../../_utils/_validation.js";
import { getActiveUsersAndPrune } from "../_helpers/_presence.js";

export const runtime = "nodejs";

export default createApiHandler(
  {
    operation: "room-users",
    methods: ["GET"],
  },
  async (_req, _res, ctx): Promise<void> => {
    const roomId = ctx.getQueryParam("id");
    if (!roomId) {
      ctx.logger.warn("Missing room ID");
      ctx.response.badRequest("Room ID is required");
      return;
    }

    try {
      assertValidRoomId(roomId, "get-room-users");
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
      const users = await getActiveUsersAndPrune(roomId);
      ctx.logger.info("Users retrieved", { roomId, count: users.length });
      ctx.response.ok({ users });
    } catch (routeError) {
      ctx.logger.error(`Error getting users for room ${roomId}`, routeError);
      ctx.response.serverError("Failed to get room users");
    }
  }
);
