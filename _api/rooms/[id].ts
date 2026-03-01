/**
 * /api/rooms/[id]
 * 
 * GET    - Get a single room
 * DELETE - Delete a room
 * 
 * Node.js runtime with terminal logging
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertValidRoomId } from "../_utils/_validation.js";
import { initLogger } from "../_utils/_logging.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../_utils/_cors.js";
import { createRedis } from "../_utils/redis.js";
import { resolveRequestAuth } from "../_utils/request-auth.js";
import { getRoom, setRoom } from "./_helpers/_redis.js";
import { getRoomReadAccessError } from "./_helpers/_access.js";
import { CHAT_ROOM_PREFIX, CHAT_ROOM_USERS_PREFIX, CHAT_ROOMS_SET } from "./_helpers/_constants.js";
import { refreshRoomUserCount, deleteRoomPresence } from "./_helpers/_presence.js";
import { broadcastRoomDeleted, broadcastRoomUpdated } from "./_helpers/_pusher.js";
import type { Room } from "./_helpers/_types.js";

export const runtime = "nodejs";
export const maxDuration = 30;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { requestId: _requestId, logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);
  const roomId = req.query.id as string | undefined;

  logger.request(req.method || "GET", req.url || "/api/rooms/[id]", `room:${roomId}`);

  if (req.method === "OPTIONS") {
    setCorsHeaders(res, origin, { methods: ["GET", "DELETE", "OPTIONS"] });
    res.setHeader("Content-Type", "application/json");
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  setCorsHeaders(res, origin, { methods: ["GET", "DELETE", "OPTIONS"] });
  res.setHeader("Content-Type", "application/json");

  if (!isAllowedOrigin(origin)) {
    logger.response(403, Date.now() - startTime);
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  const redis = createRedis();

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

  if (req.method === "GET") {
    try {
      const auth = await resolveRequestAuth(req, redis, { required: false });
      if (auth.error) {
        logger.response(auth.error.status, Date.now() - startTime);
        res.status(auth.error.status).json({ error: auth.error.error });
        return;
      }

      const roomObj = await getRoom(roomId);
      if (!roomObj) {
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "Room not found" });
        return;
      }

      const accessError = getRoomReadAccessError(roomObj, auth.user);
      if (accessError) {
        logger.response(accessError.status, Date.now() - startTime);
        res.status(accessError.status).json({ error: accessError.error });
        return;
      }

      const userCount = await refreshRoomUserCount(roomId);
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

  if (req.method === "DELETE") {
    const auth = await resolveRequestAuth(req, redis, { required: true });
    if (auth.error || !auth.user) {
      logger.response(auth.error?.status ?? 401, Date.now() - startTime);
      res.status(auth.error?.status ?? 401).json({
        error: auth.error?.error ?? "Unauthorized - missing credentials",
      });
      return;
    }

    const username = auth.user.username;

    try {
      const roomData = await getRoom(roomId);
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

      if (roomData.type === "private") {
        const updatedMembers = roomData.members!.filter((m) => m !== username);
        if (updatedMembers.length <= 1) {
          const pipeline = redis.pipeline();
          pipeline.del(`${CHAT_ROOM_PREFIX}${roomId}`);
          pipeline.del(`chat:messages:${roomId}`);
          pipeline.del(`${CHAT_ROOM_USERS_PREFIX}${roomId}`);
          pipeline.srem(CHAT_ROOMS_SET, roomId);
          await pipeline.exec();
          await deleteRoomPresence(roomId);

          await broadcastRoomDeleted(roomId, roomData.type, roomData.members || []);
          logger.info("Pusher room-deleted broadcast sent", {
            roomId,
            scope: "private-last-member",
          });
        } else {
          const updatedRoom: Room = { ...roomData, members: updatedMembers, userCount: updatedMembers.length };
          await setRoom(roomId, updatedRoom);

          // Notify remaining private members about updated membership/userCount.
          await broadcastRoomUpdated(roomId);
          // Notify the leaving user to remove the room from their list.
          await broadcastRoomDeleted(roomId, roomData.type, [username]);
          logger.info("Pusher private leave broadcasts sent", {
            roomId,
            remainingMembers: updatedMembers.length,
            leftUser: username,
          });
        }
      } else {
        const pipeline = redis.pipeline();
        pipeline.del(`${CHAT_ROOM_PREFIX}${roomId}`);
        pipeline.del(`chat:messages:${roomId}`);
        pipeline.del(`${CHAT_ROOM_USERS_PREFIX}${roomId}`);
        pipeline.srem(CHAT_ROOMS_SET, roomId);
        await pipeline.exec();
        await deleteRoomPresence(roomId);

        await broadcastRoomDeleted(roomId, roomData.type, roomData.members || []);
        logger.info("Pusher room-deleted broadcast sent", {
          roomId,
          scope: "public",
        });
      }

      logger.info("Room deleted", { roomId, username });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true });
      return;
    } catch (error) {
      logger.error(`Error deleting room ${roomId}`, error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to delete room" });
      return;
    }
  }

  logger.response(405, Date.now() - startTime);
  res.status(405).json({ error: "Method not allowed" });
}
