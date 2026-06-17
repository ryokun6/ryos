/**
 * POST /api/rooms/[id]/leave
 * Leave a room
 */

import { apiHandler } from "../../_utils/api-handler.js";
import { isProfaneUsername, assertValidRoomId, assertValidUsername } from "../../_utils/_validation.js";
import {
  deleteAllMessages,
  deleteRoom,
  getRoom,
  setRoom,
  unregisterRoom,
} from "../_helpers/_redis.js";
import { getRoomWriteAccessError } from "../_helpers/_access.js";
import { CHAT_ROOM_USERS_PREFIX } from "../_helpers/_constants.js";
import {
  deleteRoomPresence,
  removeRoomPresence,
  refreshRoomUserCount,
} from "../_helpers/_presence.js";
import { broadcastRoomDeleted, broadcastRoomUpdated, broadcastPresenceUpdate } from "../_helpers/_pusher.js";
import type { Room } from "../_helpers/_types.js";
import {
  isIrcBridgeEnabled,
  syncRoomBindingForPresence,
} from "../../_utils/irc/_bridge.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default apiHandler(
  { methods: ["POST"], auth: "required" },
  async ({ req, res, redis, logger, startTime, user }) => {
    const roomId = req.query.id as string | undefined;

    if (!roomId) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Room ID is required" });
      return;
    }

    const body = req.body || {};
    const claimedUsername = (body?.username as string | undefined)?.toLowerCase();
    const username = user!.username;

    if (claimedUsername && claimedUsername !== username) {
      logger.warn("Username mismatch in leave body", {
        claimedUsername,
        authenticatedUsername: username,
      });
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Forbidden - username mismatch" });
      return;
    }

    try {
      assertValidUsername(username, "leave-room");
      assertValidRoomId(roomId, "leave-room");
    } catch (e) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: e instanceof Error ? e.message : "Validation error" });
      return;
    }

    if (isProfaneUsername(username)) {
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const roomData = await getRoom(roomId);
      if (!roomData) {
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "Room not found" });
        return;
      }

      const accessError = getRoomWriteAccessError(roomData, user!);
      if (accessError) {
        logger.response(accessError.status, Date.now() - startTime);
        res.status(accessError.status).json({ error: accessError.error });
        return;
      }

      const removed = await removeRoomPresence(roomId, username);

      if (removed) {
        const userCount = await refreshRoomUserCount(roomId);
        if (isIrcBridgeEnabled() && roomData.type !== "private") {
          try {
            await syncRoomBindingForPresence(roomData, userCount);
          } catch (err) {
            logger.warn("IRC bridge presence unbind failed", err);
          }
        }

        if (roomData.type === "private") {
          const updatedMembers = roomData.members ? roomData.members.filter((m) => m !== username) : [];

          if (updatedMembers.length <= 1) {
            await deleteRoom(roomId);
            await deleteAllMessages(roomId);
            await unregisterRoom(roomId);
            await redis.del(`${CHAT_ROOM_USERS_PREFIX}${roomId}`);
            await deleteRoomPresence(roomId);

            await broadcastRoomDeleted(roomId, roomData.type, roomData.members || []);
            logger.info("Pusher room-deleted broadcast sent", {
              roomId,
              scope: "private-last-member",
            });
          } else {
            const updatedRoom: Room = { ...roomData, members: updatedMembers, userCount };
            await setRoom(roomId, updatedRoom);
            await Promise.all([
              broadcastRoomUpdated(roomId),
              broadcastRoomDeleted(roomId, roomData.type, [username]),
              broadcastPresenceUpdate(roomId, { username, action: "left", userCount }, roomData.type),
            ]);
            logger.info("Pusher private leave broadcasts sent", {
              roomId,
              remainingMembers: updatedMembers.length,
              leftUser: username,
            });
          }
        } else {
          await Promise.all([
            broadcastRoomUpdated(roomId),
            broadcastPresenceUpdate(roomId, { username, action: "left", userCount }, roomData.type),
          ]);
        }
      }

      logger.info("User left room", { roomId, username });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true });
    } catch (error) {
      logger.error(`Error leaving room ${roomId}`, error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to leave room" });
    }
  }
);
