/**
 * GET /api/rooms/[id]/users
 * Get active users in a room
 */

import { apiHandler } from "../../_utils/api-handler.js";
import { assertValidRoomId } from "../../_utils/_validation.js";
import { getActiveUsersAndPrune } from "../_helpers/_presence.js";
import { getRoom } from "../_helpers/_redis.js";
import { getRoomReadAccessError } from "../_helpers/_access.js";

export const runtime = "nodejs";

export default apiHandler(
  { methods: ["GET"], auth: "optional" },
  async ({ req, res, logger, startTime, user }) => {
    const roomId = req.query.id as string | undefined;

    if (!roomId) {
      logger.warn("Missing room ID");
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Room ID is required" });
      return;
    }

    try {
      assertValidRoomId(roomId, "get-room-users");
    } catch (e) {
      logger.warn("Invalid room ID", { roomId, error: e instanceof Error ? e.message : "Invalid" });
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: e instanceof Error ? e.message : "Invalid room ID" });
      return;
    }

    try {
      const room = await getRoom(roomId);
      if (!room) {
        logger.warn("Room not found", { roomId });
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "Room not found" });
        return;
      }

      const accessError = getRoomReadAccessError(room, user);
      if (accessError) {
        logger.warn("Forbidden room users read", { roomId, viewer: user?.username ?? null });
        logger.response(accessError.status, Date.now() - startTime);
        res.status(accessError.status).json({ error: accessError.error });
        return;
      }

      const users = await getActiveUsersAndPrune(roomId);

      logger.info("Users retrieved", { roomId, count: users.length });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ users });
    } catch (error) {
      logger.error(`Error getting users for room ${roomId}`, error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to get room users" });
    }
  }
);
