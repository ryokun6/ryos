/**
 * GET /api/rooms - List rooms
 * POST /api/rooms - Create room
 */

import { z } from "zod";
import { API_CONFIG, ADMIN_USERNAME } from "../_lib/constants.js";
import { 
  validationError, 
  forbidden,
  internalError,
} from "../_lib/errors.js";
import { jsonSuccess, jsonError, withCors } from "../_lib/response.js";
import { generateRequestId, logInfo, logError, logComplete } from "../_lib/logging.js";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  handleCorsPreflightIfNeeded,
} from "../_middleware/cors.js";
import {
  getAuthContext,
} from "../_middleware/auth.js";
import {
  isProfaneUsername,
} from "../_middleware/validation.js";
import {
  createRoom,
  filterVisibleRooms,
  getRoomsWithCounts,
  setRoomPresence,
  broadcastRoomCreated,
} from "../_services/index.js";

// =============================================================================
// Configuration
// =============================================================================

export const runtime = API_CONFIG.DEFAULT_RUNTIME;
export const maxDuration = API_CONFIG.DEFAULT_MAX_DURATION;

// =============================================================================
// Schema
// =============================================================================

const CreateRoomSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["public", "private"]).default("public"),
  members: z.array(z.string()).optional(),
});

// =============================================================================
// Handler
// =============================================================================

export default async function handler(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const startTime = performance.now();
  
  // CORS handling
  const origin = getEffectiveOrigin(req);
  const preflightResponse = handleCorsPreflightIfNeeded(req, ["GET", "POST", "OPTIONS"]);
  if (preflightResponse) return preflightResponse;
  
  if (!isAllowedOrigin(origin)) {
    return jsonError(validationError("Unauthorized origin"));
  }

  try {
    // GET - List rooms
    if (req.method === "GET") {
      const url = new URL(req.url);
      const username = url.searchParams.get("username")?.toLowerCase() || null;

      logInfo(requestId, "Fetching rooms", { username });

      const allRooms = await getRoomsWithCounts();
      const visibleRooms = filterVisibleRooms(allRooms, username);

      logInfo(requestId, `Returning ${visibleRooms.length} rooms`);
      logComplete(requestId, startTime, 200);

      const response = jsonSuccess({ rooms: visibleRooms });
      return withCors(response, origin);
    }

    // POST - Create room
    if (req.method === "POST") {
      // Authenticate
      const auth = await getAuthContext(req);
      if (!auth.valid || !auth.username) {
        const response = jsonError(validationError("Authentication required"));
        return withCors(response, origin);
      }

      // Parse body
      let body: z.infer<typeof CreateRoomSchema>;
      try {
        const rawBody = await req.json();
        const parsed = CreateRoomSchema.safeParse(rawBody);
        if (!parsed.success) {
          const response = jsonError(validationError("Invalid request body", parsed.error.format()));
          return withCors(response, origin);
        }
        body = parsed.data;
      } catch {
        const response = jsonError(validationError("Invalid JSON body"));
        return withCors(response, origin);
      }

      const { name, type, members = [] } = body;

      // Validate based on type
      if (type === "public") {
        // Only admin can create public rooms
        if (!auth.isAdmin) {
          const response = jsonError(forbidden("Only admin can create public rooms"));
          return withCors(response, origin);
        }

        if (!name) {
          const response = jsonError(validationError("Room name is required for public rooms"));
          return withCors(response, origin);
        }

        if (isProfaneUsername(name)) {
          const response = jsonError(validationError("Room name contains inappropriate language"));
          return withCors(response, origin);
        }
      } else {
        // Private rooms require at least one member
        if (!members || members.length === 0) {
          const response = jsonError(validationError("At least one member is required for private rooms"));
          return withCors(response, origin);
        }
      }

      // Normalize members
      let normalizedMembers = members.map((m) => m.toLowerCase());
      if (type === "private" && !normalizedMembers.includes(auth.username)) {
        normalizedMembers.push(auth.username);
      }

      // Generate room name
      let roomName: string;
      if (type === "public") {
        roomName = name!.toLowerCase().replace(/ /g, "-");
      } else {
        const sortedMembers = [...normalizedMembers].sort();
        roomName = sortedMembers.map((m) => `@${m}`).join(", ");
      }

      logInfo(requestId, `Creating ${type} room: ${roomName}`);

      // Create room
      const room = await createRoom(roomName, type, type === "private" ? normalizedMembers : undefined);

      // Set presence for private room members
      if (type === "private") {
        for (const member of normalizedMembers) {
          await setRoomPresence(room.id, member);
        }
      }

      // Broadcast
      try {
        await broadcastRoomCreated(room);
        logInfo(requestId, "Broadcast room-created");
      } catch (e) {
        logError(requestId, "Failed to broadcast room-created", e);
      }

      logInfo(requestId, `Room created: ${room.id}`);
      logComplete(requestId, startTime, 201);

      const response = jsonSuccess({ room }, 201);
      return withCors(response, origin);
    }

    // Method not allowed
    const response = jsonError(validationError("Method not allowed"));
    return withCors(response, origin);

  } catch (error) {
    logError(requestId, "Rooms error", error);
    logComplete(requestId, startTime, 500);
    const response = jsonError(internalError());
    return withCors(response, origin);
  }
}
