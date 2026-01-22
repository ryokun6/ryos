/**
 * /api/rooms
 * 
 * GET  - List all rooms
 * POST - Create a new room
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createRedis,
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
} from "../_utils/middleware.js";
import { validateAuth } from "../_utils/auth/index.js";
import { isProfaneUsername } from "../_utils/_validation.js";

// Import from existing chat-rooms modules
import { getRoomsWithCountsFast } from "./_helpers/_presence.js";
import {
  generateId,
  getCurrentTimestamp,
  setRoom,
  registerRoom,
} from "./_helpers/_redis.js";
import { setRoomPresence } from "./_helpers/_presence.js";
import type { Room } from "./_helpers/_types.js";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const origin = getEffectiveOrigin(req);
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    const preflight = preflightIfNeeded(req, ["GET", "POST", "OPTIONS"], origin);
    if (preflight) {
      res.status(204).end();
      return;
    }
    res.status(204).end();
    return;
  }

  if (!isAllowedOrigin(origin)) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  // GET - List rooms
  if (req.method === "GET") {
    try {
      const username = (req.query.username as string)?.toLowerCase() || null;

      const allRooms = await getRoomsWithCountsFast();

      const visibleRooms = allRooms.filter((room) => {
        if (!room.type || room.type === "public") return true;
        if (room.type === "private" && room.members && username) {
          return room.members.includes(username);
        }
        return false;
      });

      res.status(200).json({ rooms: visibleRooms });
      return;
    } catch (error) {
      console.error("Error fetching rooms:", error);
      res.status(500).json({ error: "Failed to fetch rooms" });
      return;
    }
  }

  // POST - Create room
  if (req.method === "POST") {
    const authHeader = req.headers["authorization"] as string;
    const usernameHeader = req.headers["x-username"] as string;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token || !usernameHeader) {
      res.status(401).json({ error: "Unauthorized - missing credentials" });
      return;
    }

    const authResult = await validateAuth(createRedis(), usernameHeader, token, {});
    if (!authResult.valid) {
      res.status(401).json({ error: "Unauthorized - invalid token" });
      return;
    }

    const username = usernameHeader.toLowerCase();
    
    const body = req.body;
    if (!body) {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }

    const { name: originalName, type = "public", members = [] } = body || {};

    if (!["public", "private"].includes(type)) {
      res.status(400).json({ error: "Invalid room type" });
      return;
    }

    if (type === "public") {
      if (!originalName) {
        res.status(400).json({ error: "Room name is required for public rooms" });
        return;
      }
      if (username !== "ryo") {
        res.status(403).json({ error: "Forbidden - Only admin can create public rooms" });
        return;
      }
      if (isProfaneUsername(originalName)) {
        res.status(400).json({ error: "Room name contains inappropriate language" });
        return;
      }
    }

    let normalizedMembers = [...(members || [])];
    if (type === "private") {
      if (!members || members.length === 0) {
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

      // Note: Pusher broadcast is handled separately (not Edge-compatible)
      // The frontend polls for updates or uses client-side Pusher

      res.status(201).json({ room });
      return;
    } catch (error) {
      console.error("Error creating room:", error);
      res.status(500).json({ error: "Failed to create room" });
      return;
    }
  }

  res.status(405).json({ error: "Method not allowed" });
}
