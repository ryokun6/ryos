/**
 * POST /api/presence/switch
 * 
 * Switch between rooms (leave previous, join next)
 */

import { Redis } from "@upstash/redis";
import {
  jsonResponse,
  errorResponse,
  handleCors,
  parseJsonBody,
} from "../_utils/middleware.js";
import {
  isProfaneUsername,
  assertValidRoomId,
} from "../_utils/_validation.js";

// Import from existing chat-rooms modules
import { getRoom, setRoom } from "../chat-rooms/_redis.js";
import {
  setRoomPresence,
  removeRoomPresence,
  refreshRoomUserCount,
} from "../chat-rooms/_presence.js";
import { broadcastRoomUpdated } from "../chat-rooms/_pusher.js";
import { ensureUserExists } from "../chat-rooms/_users.js";

export const runtime = "edge";
export const maxDuration = 15;

interface SwitchRequest {
  previousRoomId?: string;
  nextRoomId?: string;
  username: string;
}

export async function POST(request: Request): Promise<Response> {
  const cors = handleCors(request, ["POST", "OPTIONS"]);
  if (cors.preflight) return cors.preflight;
  if (!cors.allowed) {
    return errorResponse("Unauthorized", 403);
  }

  // Parse body
  const { data: body, error: parseError } = await parseJsonBody<SwitchRequest>(request);
  if (parseError || !body) {
    return errorResponse(parseError || "Invalid request body", 400, cors.origin);
  }

  const { previousRoomId, nextRoomId } = body;
  const username = body.username?.toLowerCase();

  if (!username) {
    return errorResponse("Username is required", 400, cors.origin);
  }

  // Validate room IDs if provided
  try {
    if (previousRoomId) assertValidRoomId(previousRoomId, "switch-room");
    if (nextRoomId) assertValidRoomId(nextRoomId, "switch-room");
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Validation error", 400, cors.origin);
  }

  if (isProfaneUsername(username)) {
    return errorResponse("Unauthorized", 401, cors.origin);
  }

  // No-op if same room
  if (previousRoomId === nextRoomId) {
    return jsonResponse({ success: true, noop: true }, 200, cors.origin);
  }

  try {
    await ensureUserExists(username, "switch-room");
    const changedRooms: Array<{ roomId: string; userCount: number }> = [];

    // Leave previous room
    if (previousRoomId) {
      const roomData = await getRoom(previousRoomId);
      if (roomData) {
        if (roomData.type !== "private") {
          await removeRoomPresence(previousRoomId, username);
          const userCount = await refreshRoomUserCount(previousRoomId);
          changedRooms.push({ roomId: previousRoomId, userCount });
        }
      }
    }

    // Join next room
    if (nextRoomId) {
      const roomData = await getRoom(nextRoomId);
      if (!roomData) {
        return errorResponse("Next room not found", 404, cors.origin);
      }

      await setRoomPresence(nextRoomId, username);
      const userCount = await refreshRoomUserCount(nextRoomId);
      await setRoom(nextRoomId, { ...roomData, userCount });
      changedRooms.push({ roomId: nextRoomId, userCount });
    }

    // Broadcast updates
    try {
      for (const room of changedRooms) {
        await broadcastRoomUpdated(room.roomId);
      }
    } catch (pusherErr) {
      console.error("Error triggering Pusher events:", pusherErr);
    }

    return jsonResponse({ success: true }, 200, cors.origin);
  } catch (error) {
    console.error("Error during switchRoom:", error);
    return errorResponse("Failed to switch room", 500, cors.origin);
  }
}

export async function OPTIONS(request: Request): Promise<Response> {
  const cors = handleCors(request, ["POST", "OPTIONS"]);
  return cors.preflight || new Response(null, { status: 204 });
}
