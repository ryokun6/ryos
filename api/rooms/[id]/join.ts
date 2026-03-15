/**
 * POST /api/rooms/[id]/join
 * Join a room
 */

import { apiHandler } from "../../_utils/api-handler.js";
import { isProfaneUsername, assertValidRoomId, assertValidUsername } from "../../_utils/_validation.js";
import { getRoom, setRoom } from "../_helpers/_redis.js";
import { getRoomWriteAccessError } from "../_helpers/_access.js";
import { setRoomPresence, refreshRoomUserCount } from "../_helpers/_presence.js";
import { broadcastRoomUpdated, broadcastPresenceUpdate } from "../_helpers/_pusher.js";
import type { Room } from "../_helpers/_types.js";

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
      logger.warn("Username mismatch in join body", {
        claimedUsername,
        authenticatedUsername: username,
      });
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Forbidden - username mismatch" });
      return;
    }

    try {
      assertValidUsername(username, "join-room");
      assertValidRoomId(roomId, "join-room");
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
      const [roomData, userData] = await Promise.all([
        getRoom(roomId),
        redis.get(`chat:users:${username}`),
      ]);

      if (!roomData) {
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "Room not found" });
        return;
      }

      if (!userData) {
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "User not found" });
        return;
      }

      const accessError = getRoomWriteAccessError(roomData, user!);
      if (accessError) {
        logger.response(accessError.status, Date.now() - startTime);
        res.status(accessError.status).json({ error: accessError.error });
        return;
      }

      await setRoomPresence(roomId, username);
      const userCount = await refreshRoomUserCount(roomId);
      const updatedRoom: Room = { ...roomData, userCount };
      await setRoom(roomId, updatedRoom);
      await Promise.all([
        broadcastRoomUpdated(roomId),
        broadcastPresenceUpdate(roomId, { username, action: "joined", userCount }),
      ]);

      logger.info("User joined room", { roomId, username, userCount });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true });
    } catch (error) {
      logger.error(`Error joining room ${roomId}`, error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to join room" });
    }
  }
);
