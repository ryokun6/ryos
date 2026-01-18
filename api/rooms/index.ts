/**
 * /api/rooms
 * 
 * GET  - List all rooms
 * POST - Create a new room
 */

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
  runtime: "edge",
};

export default async function handler(req: Request) {
  const origin = getEffectiveOrigin(req);
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    const preflight = preflightIfNeeded(req, ["GET", "POST", "OPTIONS"], origin);
    if (preflight) return preflight;
    return new Response(null, { status: 204 });
  }

  if (!isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { 
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;

  // GET - List rooms
  if (req.method === "GET") {
    try {
      const url = new URL(req.url);
      const username = url.searchParams.get("username")?.toLowerCase() || null;

      const allRooms = await getRoomsWithCountsFast();

      const visibleRooms = allRooms.filter((room) => {
        if (!room.type || room.type === "public") return true;
        if (room.type === "private" && room.members && username) {
          return room.members.includes(username);
        }
        return false;
      });

      return new Response(JSON.stringify({ rooms: visibleRooms }), { status: 200, headers });
    } catch (error) {
      console.error("Error fetching rooms:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch rooms" }), { status: 500, headers });
    }
  }

  // POST - Create room
  if (req.method === "POST") {
    const authHeader = req.headers.get("authorization");
    const usernameHeader = req.headers.get("x-username");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token || !usernameHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized - missing credentials" }), { status: 401, headers });
    }

    const authResult = await validateAuth(createRedis(), usernameHeader, token, {});
    if (!authResult.valid) {
      return new Response(JSON.stringify({ error: "Unauthorized - invalid token" }), { status: 401, headers });
    }

    const username = usernameHeader.toLowerCase();
    
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
    }

    const { name: originalName, type = "public", members = [] } = body || {};

    if (!["public", "private"].includes(type)) {
      return new Response(JSON.stringify({ error: "Invalid room type" }), { status: 400, headers });
    }

    if (type === "public") {
      if (!originalName) {
        return new Response(JSON.stringify({ error: "Room name is required for public rooms" }), { status: 400, headers });
      }
      if (username !== "ryo") {
        return new Response(JSON.stringify({ error: "Forbidden - Only admin can create public rooms" }), { status: 403, headers });
      }
      if (isProfaneUsername(originalName)) {
        return new Response(JSON.stringify({ error: "Room name contains inappropriate language" }), { status: 400, headers });
      }
    }

    let normalizedMembers = [...(members || [])];
    if (type === "private") {
      if (!members || members.length === 0) {
        return new Response(JSON.stringify({ error: "At least one member is required for private rooms" }), { status: 400, headers });
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

      return new Response(JSON.stringify({ room }), { status: 201, headers });
    } catch (error) {
      console.error("Error creating room:", error);
      return new Response(JSON.stringify({ error: "Failed to create room" }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
}
