/**
 * /api/rooms
 * 
 * GET  - List all rooms
 * POST - Create a new room
 */

import { Redis } from "@upstash/redis";
import {
  jsonResponse,
  errorResponse,
  handleCors,
  requireAuth,
  requireAdmin,
  parseJsonBody,
  getQueryParam,
} from "../_utils/middleware.js";
import { isProfaneUsername } from "../_utils/_validation.js";

// Import from existing chat-rooms modules
import { getRoomsWithCountsFast } from "../chat-rooms/_presence.js";
import {
  generateId,
  getCurrentTimestamp,
  setRoom,
  registerRoom,
} from "../chat-rooms/_redis.js";
import { setRoomPresence } from "../chat-rooms/_presence.js";
import { broadcastRoomCreated } from "../chat-rooms/_pusher.js";
import type { Room } from "../chat-rooms/_types.js";

export const runtime = "edge";
export const maxDuration = 15;

interface CreateRoomRequest {
  name?: string;
  type?: "public" | "private";
  members?: string[];
}

/**
 * GET /api/rooms - List all rooms
 */
export async function GET(request: Request): Promise<Response> {
  const cors = handleCors(request, ["GET", "POST", "OPTIONS"]);
  if (cors.preflight) return cors.preflight;
  if (!cors.allowed) {
    return errorResponse("Unauthorized", 403);
  }

  try {
    // Get username from query for private room filtering
    const username = getQueryParam(request, "username")?.toLowerCase() || null;

    const allRooms = await getRoomsWithCountsFast();

    // Filter rooms based on visibility
    const visibleRooms = allRooms.filter((room) => {
      // Public rooms are always visible
      if (!room.type || room.type === "public") {
        return true;
      }
      // Private rooms only visible to members
      if (room.type === "private" && room.members && username) {
        return room.members.includes(username);
      }
      return false;
    });

    return jsonResponse({ rooms: visibleRooms }, 200, cors.origin);
  } catch (error) {
    console.error("Error fetching rooms:", error);
    return errorResponse("Failed to fetch rooms", 500, cors.origin);
  }
}

/**
 * POST /api/rooms - Create a new room
 */
export async function POST(request: Request): Promise<Response> {
  const cors = handleCors(request, ["GET", "POST", "OPTIONS"]);
  if (cors.preflight) return cors.preflight;
  if (!cors.allowed) {
    return errorResponse("Unauthorized", 403);
  }

  const redis = new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });

  // Require authentication
  const auth = await requireAuth(request, redis, cors.origin);
  if (auth.error) return auth.error;

  // Parse body
  const { data: body, error: parseError } = await parseJsonBody<CreateRoomRequest>(request);
  if (parseError || !body) {
    return errorResponse(parseError || "Invalid request body", 400, cors.origin);
  }

  const { name: originalName, type = "public", members = [] } = body;
  const username = auth.user!.username;

  // Validate room type
  if (!["public", "private"].includes(type)) {
    return errorResponse("Invalid room type. Must be 'public' or 'private'", 400, cors.origin);
  }

  // For public rooms, only admin can create
  if (type === "public") {
    if (!originalName) {
      return errorResponse("Room name is required for public rooms", 400, cors.origin);
    }

    // Check admin
    if (username !== "ryo") {
      return errorResponse("Forbidden - Only admin can create public rooms", 403, cors.origin);
    }

    if (isProfaneUsername(originalName)) {
      return errorResponse("Room name contains inappropriate language", 400, cors.origin);
    }
  }

  // For private rooms, validate members
  let normalizedMembers = [...members];
  if (type === "private") {
    if (!members || members.length === 0) {
      return errorResponse("At least one member is required for private rooms", 400, cors.origin);
    }

    normalizedMembers = members.map((m) => m.toLowerCase());
    if (!normalizedMembers.includes(username)) {
      normalizedMembers.push(username);
    }
  }

  // Generate room name
  let roomName: string;
  if (type === "public") {
    roomName = originalName!.toLowerCase().replace(/ /g, "-");
  } else {
    const sortedMembers = [...normalizedMembers].sort();
    roomName = sortedMembers.map((m) => `@${m}`).join(", ");
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

    // For private rooms, set presence for all members
    if (type === "private") {
      const presencePromises = normalizedMembers.map((member) =>
        setRoomPresence(roomId, member)
      );
      await Promise.all(presencePromises);
    }

    // Broadcast room creation
    try {
      await broadcastRoomCreated(room);
    } catch (pusherError) {
      console.error("Error triggering Pusher event:", pusherError);
    }

    return jsonResponse({ room }, 201, cors.origin);
  } catch (error) {
    console.error("Error creating room:", error);
    return errorResponse("Failed to create room", 500, cors.origin);
  }
}

export async function OPTIONS(request: Request): Promise<Response> {
  const cors = handleCors(request, ["GET", "POST", "OPTIONS"]);
  return cors.preflight || new Response(null, { status: 204 });
}
