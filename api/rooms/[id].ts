/**
 * /api/rooms/[id]
 *
 * GET    - Get a single room
 * DELETE - Delete a room
 */

import { apiHandler } from "../_utils/api-handler.js";
import { assertValidRoomId } from "../_utils/_validation.js";
import {
  deleteAllMessages,
  deleteRoom,
  getRoom,
  setRoom,
  unregisterRoom,
} from "./_helpers/_redis.js";
import { getRoomReadAccessError } from "./_helpers/_access.js";
import { refreshRoomUserCount, deleteRoomPresence } from "./_helpers/_presence.js";
import { broadcastRoomDeleted, broadcastRoomUpdated } from "./_helpers/_pusher.js";
import type { Room } from "./_helpers/_types.js";
import { notifyRoomBindingChange, isIrcBridgeEnabled } from "../_utils/irc/_bridge.js";

export default apiHandler(
  { methods: ["GET", "DELETE"], auth: "optional" },
  async ({ req, res, redis, logger, startTime, user }) => {
    const roomId = req.query.id as string | undefined;
    const method = (req.method || "GET").toUpperCase();

    if (!roomId) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Room ID is required" });
      return;
    }

    try {
      assertValidRoomId(roomId, "room-operation");
    } catch (e) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: e instanceof Error ? e.message : "Invalid room ID" });
      return;
    }

    if (method === "GET") {
      try {
        const roomObj = await getRoom(roomId, redis);
        if (!roomObj) {
          logger.response(404, Date.now() - startTime);
          res.status(404).json({ error: "Room not found" });
          return;
        }

        const accessError = getRoomReadAccessError(roomObj, user);
        if (accessError) {
          logger.response(accessError.status, Date.now() - startTime);
          res.status(accessError.status).json({ error: accessError.error });
          return;
        }

        const userCount = await refreshRoomUserCount(roomId, redis);
        const room: Room = { ...roomObj, userCount };
        logger.info("Room fetched", { roomId, userCount });
        logger.response(200, Date.now() - startTime);
        res.status(200).json({ room });
        return;
      } catch (error) {
        logger.error(`Error fetching room ${roomId}`, error);
        logger.response(500, Date.now() - startTime);
        res.status(500).json({ error: "Failed to fetch room" });
        return;
      }
    }

    // DELETE - requires auth
    if (!user) {
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Unauthorized - missing credentials" });
      return;
    }

    const username = user.username;

    try {
      const roomData = await getRoom(roomId, redis);
      if (!roomData) {
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "Room not found" });
        return;
      }

      if (roomData.type === "private") {
        if (!roomData.members || !roomData.members.includes(username)) {
          logger.response(403, Date.now() - startTime);
          res.status(403).json({ error: "Unauthorized - not a member" });
          return;
        }
      } else {
        if (username !== "ryo") {
          logger.response(403, Date.now() - startTime);
          res.status(403).json({ error: "Unauthorized - admin required" });
          return;
        }
      }

      if (roomData.type === "irc" && isIrcBridgeEnabled()) {
        try {
          await notifyRoomBindingChange("unbind", roomData);
        } catch (err) {
          logger.warn("IRC bridge unbind failed", err);
        }
      }

      if (roomData.type === "private") {
        const updatedMembers = roomData.members!.filter((m) => m !== username);
        if (updatedMembers.length <= 1) {
          await Promise.all([
            deleteRoom(roomId, redis),
            deleteAllMessages(roomId, redis),
            unregisterRoom(roomId, redis),
            deleteRoomPresence(roomId, redis),
          ]);

          await broadcastRoomDeleted(roomId, roomData.type, roomData.members || []);
          logger.info("Pusher room-deleted broadcast sent", {
            roomId,
            scope: "private-last-member",
          });
        } else {
          const updatedRoom: Room = { ...roomData, members: updatedMembers, userCount: updatedMembers.length };
          await setRoom(roomId, updatedRoom, redis);

          await Promise.all([
            broadcastRoomUpdated(roomId),
            broadcastRoomDeleted(roomId, roomData.type, [username]),
          ]);
          logger.info("Pusher private leave broadcasts sent", {
            roomId,
            remainingMembers: updatedMembers.length,
            leftUser: username,
          });
        }
      } else {
        await Promise.all([
          deleteRoom(roomId, redis),
          deleteAllMessages(roomId, redis),
          unregisterRoom(roomId, redis),
          deleteRoomPresence(roomId, redis),
        ]);

        await broadcastRoomDeleted(roomId, roomData.type, roomData.members || []);
        logger.info("Pusher room-deleted broadcast sent", {
          roomId,
          scope: "public",
        });
      }

      logger.info("Room deleted", { roomId, username });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true });
    } catch (error) {
      logger.error(`Error deleting room ${roomId}`, error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to delete room" });
    }
  }
);
