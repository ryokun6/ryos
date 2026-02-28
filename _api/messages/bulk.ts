/**
 * GET /api/messages/bulk
 *
 * Get messages for multiple rooms at once
 */

import type { Message } from "../rooms/_helpers/_types.js";
import { getMessages, roomExists } from "../rooms/_helpers/_redis.js";
import { createApiHandler } from "../_utils/handler.js";
import { ROOM_ID_REGEX } from "../_utils/_validation.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default createApiHandler(
  {
    operation: "bulk-messages",
    methods: ["GET"],
    cors: {
      headers: ["Content-Type"],
    },
  },
  async (_req, _res, ctx): Promise<void> => {
    const roomIdsParam = ctx.getQueryParam("roomIds");
    if (!roomIdsParam) {
      ctx.response.badRequest("roomIds query parameter is required");
      return;
    }

    const roomIds = roomIdsParam
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (roomIds.length === 0) {
      ctx.response.badRequest("At least one room ID is required");
      return;
    }

    for (const roomId of roomIds) {
      if (!ROOM_ID_REGEX.test(roomId)) {
        ctx.response.badRequest("Invalid room ID format");
        return;
      }
    }

    try {
      const roomExistenceChecks = await Promise.all(
        roomIds.map((roomId) => roomExists(roomId))
      );
      const validRoomIds = roomIds.filter((_, index) => roomExistenceChecks[index]);
      const invalidRoomIds = roomIds.filter((_, index) => !roomExistenceChecks[index]);

      const results = await Promise.all(
        validRoomIds.map(async (roomId) => ({
          roomId,
          messages: await getMessages(roomId, 20),
        }))
      );

      const messagesMap: Record<string, Message[]> = {};
      results.forEach(({ roomId, messages }) => {
        messagesMap[roomId] = messages;
      });

      ctx.logger.info("Bulk messages fetched", {
        validRooms: validRoomIds.length,
        invalidRooms: invalidRoomIds.length,
      });
      ctx.response.ok({ messagesMap, validRoomIds, invalidRoomIds });
    } catch (routeError) {
      ctx.logger.error("Error fetching bulk messages", routeError);
      ctx.response.serverError("Failed to fetch bulk messages");
    }
  }
);
