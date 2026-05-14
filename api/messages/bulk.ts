/**
 * GET /api/messages/bulk
 * Get messages for multiple rooms at once
 */

import { apiHandler } from "../_utils/api-handler.js";
import { ROOM_ID_REGEX } from "../_utils/_validation.js";
import { getMessages, getRoom } from "../rooms/_helpers/_redis.js";
import { getRoomReadAccessError } from "../rooms/_helpers/_access.js";
import type { Message } from "../rooms/_helpers/_types.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default apiHandler(
  { methods: ["GET"], auth: "optional" },
  async ({ req, res, logger, startTime, user }) => {
    const roomIdsParam = req.query.roomIds as string | undefined;

    if (!roomIdsParam) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "roomIds query parameter is required" });
      return;
    }

    const roomIds = roomIdsParam.split(",").reduce<string[]>((acc, rawId) => {
      const id = rawId.trim();
      if (id.length > 0) {
        acc.push(id);
      }
      return acc;
    }, []);

    if (roomIds.length === 0) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "At least one room ID is required" });
      return;
    }

    for (const id of roomIds) {
      if (!ROOM_ID_REGEX.test(id)) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "Invalid room ID format" });
        return;
      }
    }

    try {
      const rooms = await Promise.all(roomIds.map((roomId) => getRoom(roomId)));
      const validRoomIds: string[] = [];
      const invalidRoomIds: string[] = [];

      for (let index = 0; index < roomIds.length; index++) {
        const roomId = roomIds[index];
        const room = rooms[index];

        if (!room) {
          invalidRoomIds.push(roomId);
          continue;
        }

        const accessError = getRoomReadAccessError(room, user);
        if (accessError) {
          invalidRoomIds.push(roomId);
          continue;
        }

        validRoomIds.push(roomId);
      }

      const messagePromises = validRoomIds.map(async (roomId) => {
        const messages = await getMessages(roomId, 20);
        return { roomId, messages };
      });

      const results = await Promise.all(messagePromises);
      const messagesMap: Record<string, Message[]> = {};
      results.forEach(({ roomId, messages }) => {
        messagesMap[roomId] = messages;
      });

      logger.info("Bulk messages fetched", { validRooms: validRoomIds.length, invalidRooms: invalidRoomIds.length });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ messagesMap, validRoomIds, invalidRoomIds });
    } catch (error) {
      logger.error("Error fetching bulk messages", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to fetch bulk messages" });
    }
  }
);
