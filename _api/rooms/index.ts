/**
 * /api/rooms
 *
 * GET  - List all rooms
 * POST - Create a new room
 */

import { apiHandler } from "../_utils/api-handler.js";
import { isProfaneUsername } from "../_utils/_validation.js";
import { getRoomsWithCountsFast } from "./_helpers/_presence.js";
import { generateId, getCurrentTimestamp, setRoom, registerRoom } from "./_helpers/_redis.js";
import { setRoomPresence } from "./_helpers/_presence.js";
import { broadcastRoomCreated } from "./_helpers/_pusher.js";
import { filterVisibleRooms } from "./_helpers/_access.js";
import type { Room } from "./_helpers/_types.js";

export const runtime = "nodejs";
export const maxDuration = 30;

export default apiHandler(
  { methods: ["GET", "POST"], auth: "optional" },
  async ({ req, res, logger, startTime, user }) => {
    const method = (req.method || "GET").toUpperCase();

    // GET - List rooms
    if (method === "GET") {
      try {
        const claimedUsername = (req.query.username as string | undefined)?.toLowerCase() || null;
        const allRooms = await getRoomsWithCountsFast();
        const visibleRooms = filterVisibleRooms(allRooms, user);

        logger.info("Listed rooms", {
          total: allRooms.length,
          visible: visibleRooms.length,
          viewerUsername: user?.username ?? null,
          claimedUsername,
        });
        logger.response(200, Date.now() - startTime);
        res.status(200).json({ rooms: visibleRooms });
        return;
      } catch (error) {
        logger.error("Error fetching rooms", error);
        logger.response(500, Date.now() - startTime);
        res.status(500).json({ error: "Failed to fetch rooms" });
        return;
      }
    }

    // POST - Create room (requires auth)
    if (!user) {
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Unauthorized - missing credentials" });
      return;
    }

    const username = user.username;
    const body = req.body || {};
    const { name: originalName, type = "public", members = [] } = body;

    if (!["public", "private"].includes(type)) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Invalid room type" });
      return;
    }

    if (type === "public") {
      if (!originalName) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "Room name is required for public rooms" });
        return;
      }
      if (username !== "ryo") {
        logger.response(403, Date.now() - startTime);
        res.status(403).json({ error: "Forbidden - Only admin can create public rooms" });
        return;
      }
      if (isProfaneUsername(originalName)) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "Room name contains inappropriate language" });
        return;
      }
    }

    let normalizedMembers = [...(members || [])];
    if (type === "private") {
      if (!members || members.length === 0) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "At least one member is required for private rooms" });
        return;
      }
      normalizedMembers = members.map((m: string) => m.toLowerCase());
      if (!normalizedMembers.includes(username)) {
        normalizedMembers.push(username);
      }
    }

    let roomName: string;
    if (type === "public") {
      roomName = originalName.toLowerCase().replace(/ /g, "-");
    } else {
      const sortedMembers = [...normalizedMembers].sort();
      roomName = sortedMembers.map((m: string) => `@${m}`).join(", ");
    }

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
        await Promise.all(normalizedMembers.map((member: string) => setRoomPresence(roomId, member)));
      }

      await broadcastRoomCreated(room);
      logger.info("Pusher room-created broadcast sent", { roomId, type });

      logger.info("Room created", { roomId, type, name: roomName, username });
      logger.response(201, Date.now() - startTime);
      res.status(201).json({ room });
    } catch (error) {
      logger.error("Error creating room", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to create room" });
    }
  }
);
