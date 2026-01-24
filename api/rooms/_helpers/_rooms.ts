/**
 * Room handlers for chat-rooms API
 */

import { Redis } from "@upstash/redis";
import {
  getRoom,
  setRoom,
  registerRoom,
  generateId,
  getCurrentTimestamp,
} from "./_redis.js";

// Create Redis client
function getRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}
import {
  CHAT_ROOM_PREFIX,
  CHAT_ROOM_USERS_PREFIX,
  CHAT_ROOMS_SET,
} from "./_constants.js";
import {
  setRoomPresence,
  removeRoomPresence,
  refreshRoomUserCount,
  getActiveUsersAndPrune,
  getRoomsWithCountsFast,
  deleteRoomPresence,
  getDetailedRooms,
} from "./_presence.js";
import {
  broadcastRoomUpdated,
  broadcastRoomCreated,
  broadcastRoomDeleted,
  broadcastToSpecificUsers,
} from "./_pusher.js";
import { logInfo, logError } from "../../_utils/_logging.js";
import {
  isProfaneUsername,
  assertValidUsername,
  assertValidRoomId,
} from "../../_utils/_validation.js";
import { validateAuth } from "../../_utils/auth/index.js";
import { createErrorResponse } from "./_helpers.js";
import { ensureUserExists } from "./_users.js";
import type { Room, CreateRoomData, JoinLeaveRoomData, SwitchRoomData } from "./_types.js";

// ============================================================================
// Helper Functions
// ============================================================================

async function isAdmin(
  username: string | null,
  token: string | null,
  _requestId: string
): Promise<boolean> {
  if (!username || !token) return false;
  if (username.toLowerCase() !== "ryo") return false;

  const authResult = await validateAuth(getRedis(), username, token);
  return authResult.valid;
}

// ============================================================================
// Handler Functions
// ============================================================================

/**
 * Handle get all rooms request
 */
export async function handleGetRooms(
  request: Request,
  requestId: string
): Promise<Response> {
  logInfo(requestId, "Fetching all rooms");
  try {
    // Handle both full URLs and relative paths (vercel dev uses relative paths)
    const url = new URL(request.url, "http://localhost");
    const username = url.searchParams.get("username")?.toLowerCase() || null;

    const allRooms = await getRoomsWithCountsFast();

    // Filter rooms based on visibility
    const visibleRooms = allRooms.filter((room) => {
      if (!room.type || room.type === "public") {
        return true;
      }
      if (room.type === "private" && room.members && username) {
        return room.members.includes(username);
      }
      return false;
    });

    return new Response(JSON.stringify({ rooms: visibleRooms }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, "Error fetching rooms:", error);
    return createErrorResponse("Failed to fetch rooms", 500);
  }
}

/**
 * Handle get single room request
 */
export async function handleGetRoom(
  roomId: string,
  requestId: string
): Promise<Response> {
  logInfo(requestId, `Fetching room: ${roomId}`);
  try {
    assertValidRoomId(roomId, requestId);
    const roomObj = await getRoom(roomId);

    if (!roomObj) {
      logInfo(requestId, `Room not found: ${roomId}`);
      return createErrorResponse("Room not found", 404);
    }

    const userCount = await refreshRoomUserCount(roomId);
    const room: Room = { ...roomObj, userCount };

    return new Response(JSON.stringify({ room }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, `Error fetching room ${roomId}:`, error);
    return createErrorResponse("Failed to fetch room", 500);
  }
}

/**
 * Handle create room request
 */
export async function handleCreateRoom(
  data: CreateRoomData,
  username: string | null,
  token: string | null,
  requestId: string
): Promise<Response> {
  const { name: originalName, type = "public", members = [] } = data;
  const normalizedUsername = username?.toLowerCase();

  // Validate room type
  if (!["public", "private"].includes(type)) {
    logInfo(requestId, "Room creation failed: Invalid room type");
    return createErrorResponse(
      "Invalid room type. Must be 'public' or 'private'",
      400
    );
  }

  // For public rooms, only admin can create
  if (type === "public") {
    if (!originalName) {
      logInfo(
        requestId,
        "Room creation failed: Name is required for public rooms"
      );
      return createErrorResponse("Room name is required for public rooms", 400);
    }

    const adminAccess = await isAdmin(username, token, requestId);
    if (!adminAccess) {
      logInfo(requestId, `Unauthorized: User ${username} is not the admin`);
      return createErrorResponse(
        "Forbidden - Only admin can create public rooms",
        403
      );
    }

    if (isProfaneUsername(originalName)) {
      logInfo(
        requestId,
        `Room creation failed: Name contains inappropriate language: ${originalName}`
      );
      return createErrorResponse(
        "Room name contains inappropriate language",
        400
      );
    }
  }

  // For private rooms, validate members
  let normalizedMembers = [...members];
  if (type === "private") {
    if (!members || members.length === 0) {
      logInfo(
        requestId,
        "Room creation failed: Members are required for private rooms"
      );
      return createErrorResponse(
        "At least one member is required for private rooms",
        400
      );
    }

    normalizedMembers = members.map((m) => m.toLowerCase());
    if (normalizedUsername && !normalizedMembers.includes(normalizedUsername)) {
      normalizedMembers.push(normalizedUsername);
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

  logInfo(requestId, `Creating ${type} room: ${roomName} by ${username}`);
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

    logInfo(requestId, `${type} room created: ${roomId}`);

    try {
      await broadcastRoomCreated(room);
      logInfo(requestId, "Pusher event triggered: room-created");
    } catch (pusherError) {
      logError(
        requestId,
        "Error triggering Pusher event for room creation:",
        pusherError
      );
    }

    return new Response(JSON.stringify({ room }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, `Error creating room ${roomName}:`, error);
    return createErrorResponse("Failed to create room", 500);
  }
}

/**
 * Handle delete room request
 */
export async function handleDeleteRoom(
  roomId: string,
  username: string | null,
  token: string | null,
  requestId: string
): Promise<Response> {
  logInfo(requestId, `Deleting room: ${roomId}`);
  try {
    const roomData = await getRoom(roomId);

    if (!roomData) {
      logInfo(requestId, `Room not found for deletion: ${roomId}`);
      return createErrorResponse("Room not found", 404);
    }

    // Permission check based on room type
    if (roomData.type === "private") {
      if (
        !roomData.members ||
        !roomData.members.includes(username?.toLowerCase() || "")
      ) {
        logInfo(
          requestId,
          `Unauthorized: User ${username} is not a member of private room ${roomId}`
        );
        return createErrorResponse(
          "Unauthorized - not a member of this room",
          403
        );
      }
    } else {
      const adminAccess = await isAdmin(username, token, requestId);
      if (!adminAccess) {
        logInfo(requestId, `Unauthorized: User ${username} is not the admin`);
        return createErrorResponse(
          "Unauthorized - admin access required for public rooms",
          403
        );
      }
    }

    if (roomData.type === "private") {
      const updatedMembers = roomData.members!.filter(
        (member) => member !== username?.toLowerCase()
      );

      if (updatedMembers.length <= 1) {
        // Delete the entire room
        const pipeline = getRedis().pipeline();
        pipeline.del(`${CHAT_ROOM_PREFIX}${roomId}`);
        pipeline.del(`chat:messages:${roomId}`);
        pipeline.del(`${CHAT_ROOM_USERS_PREFIX}${roomId}`);
        pipeline.srem(CHAT_ROOMS_SET, roomId);
        await pipeline.exec();
        await deleteRoomPresence(roomId);
        logInfo(
          requestId,
          `Private room deleted (${
            updatedMembers.length === 0
              ? "last member left"
              : "only 1 member would remain"
          }): ${roomId}`
        );
      } else {
        // Update room with remaining members
        const updatedRoom: Room = {
          ...roomData,
          members: updatedMembers,
          userCount: updatedMembers.length,
        };
        await setRoom(roomId, updatedRoom);
        await removeRoomPresence(roomId, username?.toLowerCase() || "");
        logInfo(
          requestId,
          `User ${username} left private room ${roomId}, ${updatedMembers.length} members remaining`
        );
      }
    } else {
      // For public rooms, delete entire room
      const pipeline = getRedis().pipeline();
      pipeline.del(`${CHAT_ROOM_PREFIX}${roomId}`);
      pipeline.del(`chat:messages:${roomId}`);
      pipeline.del(`${CHAT_ROOM_USERS_PREFIX}${roomId}`);
      pipeline.srem(CHAT_ROOMS_SET, roomId);
      await pipeline.exec();
      await deleteRoomPresence(roomId);
      logInfo(requestId, `Public room deleted by admin: ${roomId}`);
    }

    try {
      await broadcastRoomDeleted(
        roomId,
        roomData.type,
        roomData.members || []
      );
      logInfo(requestId, "Pusher event triggered: room-deleted");
    } catch (pusherError) {
      logError(
        requestId,
        "Error triggering Pusher event for room deletion/leave:",
        pusherError
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, `Error deleting room ${roomId}:`, error);
    return createErrorResponse("Failed to delete room", 500);
  }
}

/**
 * Handle join room request
 */
export async function handleJoinRoom(
  data: JoinLeaveRoomData,
  requestId: string
): Promise<Response> {
  const { roomId, username: originalUsername } = data;
  const username = originalUsername?.toLowerCase();

  if (!roomId || !username) {
    logInfo(requestId, "Room join failed: Missing required fields", {
      roomId,
      username,
    });
    return createErrorResponse("Room ID and username are required", 400);
  }

  try {
    assertValidUsername(username, requestId);
    assertValidRoomId(roomId, requestId);
  } catch (e) {
    return createErrorResponse(
      e instanceof Error ? e.message : "Validation error",
      400
    );
  }

  if (isProfaneUsername(username)) {
    logInfo(requestId, `Join blocked for profane username: ${username}`);
    return createErrorResponse("Unauthorized", 401);
  }

  logInfo(requestId, `User ${username} joining room ${roomId}`);
  try {
    const [roomData, userData] = await Promise.all([
      getRoom(roomId),
      getRedis().get(`chat:users:${username}`),
    ]);

    if (!roomData) {
      logInfo(requestId, `Room not found: ${roomId}`);
      return createErrorResponse("Room not found", 404);
    }

    if (!userData) {
      logInfo(requestId, `User not found: ${username}`);
      return createErrorResponse("User not found", 404);
    }

    await setRoomPresence(roomId, username);
    const userCount = await refreshRoomUserCount(roomId);
    const updatedRoom: Room = { ...roomData, userCount };
    await setRoom(roomId, updatedRoom);
    logInfo(
      requestId,
      `User ${username} joined room ${roomId}, new user count: ${userCount}`
    );

    try {
      await broadcastRoomUpdated(roomId);
      logInfo(requestId, `Pusher event triggered: room-updated for user join`);
    } catch (pusherError) {
      logError(
        requestId,
        "Error triggering Pusher event for room join:",
        pusherError
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(
      requestId,
      `Error joining room ${roomId} for user ${username}:`,
      error
    );
    return createErrorResponse("Failed to join room", 500);
  }
}

/**
 * Handle leave room request
 */
export async function handleLeaveRoom(
  data: JoinLeaveRoomData,
  requestId: string
): Promise<Response> {
  const { roomId, username: originalUsername } = data;
  const username = originalUsername?.toLowerCase();

  if (!roomId || !username) {
    logInfo(requestId, "Room leave failed: Missing required fields", {
      roomId,
      username,
    });
    return createErrorResponse("Room ID and username are required", 400);
  }

  try {
    assertValidUsername(username, requestId);
    assertValidRoomId(roomId, requestId);
  } catch (e) {
    return createErrorResponse(
      e instanceof Error ? e.message : "Validation error",
      400
    );
  }

  if (isProfaneUsername(username)) {
    logInfo(requestId, `Leave blocked for profane username: ${username}`);
    return createErrorResponse("Unauthorized", 401);
  }

  logInfo(requestId, `User ${username} leaving room ${roomId}`);
  try {
    const roomData = await getRoom(roomId);
    if (!roomData) {
      logInfo(requestId, `Room not found: ${roomId}`);
      return createErrorResponse("Room not found", 404);
    }

    const removed = await removeRoomPresence(roomId, username);

    if (removed) {
      const previousUserCount = roomData.userCount;
      const userCount = await refreshRoomUserCount(roomId);
      logInfo(
        requestId,
        `User ${username} left room ${roomId}, new active user count: ${userCount}`
      );

      if (roomData.type === "private") {
        const updatedMembers = roomData.members
          ? roomData.members.filter((m) => m !== username)
          : [];

        if (updatedMembers.length <= 1) {
          logInfo(
            requestId,
            `Deleting private room ${roomId} (${
              updatedMembers.length === 0
                ? "no members left"
                : "only 1 member would remain"
            })`
          );
          const pipeline = getRedis().pipeline();
          pipeline.del(`${CHAT_ROOM_PREFIX}${roomId}`);
          pipeline.del(`chat:messages:${roomId}`);
          pipeline.del(`${CHAT_ROOM_USERS_PREFIX}${roomId}`);
          await pipeline.exec();

          const rooms = await getDetailedRooms();
          try {
            await broadcastToSpecificUsers(roomData.members || [], rooms);
            logInfo(
              requestId,
              `Pusher event triggered: rooms-updated to ${
                (roomData.members || []).length
              } affected members after private room deletion`
            );
          } catch (pusherError) {
            logError(
              requestId,
              "Error triggering Pusher event for room deletion:",
              pusherError
            );
          }
        } else {
          const updatedRoom: Room = {
            ...roomData,
            members: updatedMembers,
            userCount,
          };
          await setRoom(roomId, updatedRoom);

          try {
            await broadcastRoomUpdated(roomId);
            logInfo(
              requestId,
              `Pusher event triggered: room-updated for private room member update`
            );
          } catch (pusherError) {
            logError(
              requestId,
              "Error triggering Pusher event for room update:",
              pusherError
            );
          }
        }
      } else {
        if (userCount !== previousUserCount) {
          try {
            await broadcastRoomUpdated(roomId);
            logInfo(
              requestId,
              `Pusher event triggered: room-updated for public room user count change`
            );
          } catch (pusherError) {
            logError(
              requestId,
              "Error triggering Pusher events for room leave:",
              pusherError
            );
          }
        }
      }
    } else {
      logInfo(requestId, `User ${username} was not in room ${roomId}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(
      requestId,
      `Error leaving room ${roomId} for user ${username}:`,
      error
    );
    return createErrorResponse("Failed to leave room", 500);
  }
}

/**
 * Handle switch room request
 */
export async function handleSwitchRoom(
  data: SwitchRoomData,
  requestId: string
): Promise<Response> {
  const { previousRoomId, nextRoomId, username: originalUsername } = data;
  const username = originalUsername?.toLowerCase();

  if (!username) {
    logInfo(requestId, "Room switch failed: Username is required");
    return createErrorResponse("Username is required", 400);
  }

  try {
    if (previousRoomId) assertValidRoomId(previousRoomId, requestId);
    if (nextRoomId) assertValidRoomId(nextRoomId, requestId);
  } catch (e) {
    return createErrorResponse(
      e instanceof Error ? e.message : "Validation error",
      400
    );
  }

  if (isProfaneUsername(username)) {
    logInfo(requestId, `Switch blocked for profane username: ${username}`);
    return createErrorResponse("Unauthorized", 401);
  }

  if (previousRoomId === nextRoomId) {
    logInfo(
      requestId,
      `Room switch noop: previous and next are the same (${previousRoomId}).`
    );
    return new Response(JSON.stringify({ success: true, noop: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    await ensureUserExists(username, requestId);
    const changedRooms: Array<{ roomId: string; userCount: number }> = [];

    // Leave previous room
    if (previousRoomId) {
      const roomData = await getRoom(previousRoomId);
      if (roomData) {
        if (roomData.type !== "private") {
          await removeRoomPresence(previousRoomId, username);
          logInfo(
            requestId,
            `Removed presence for user ${username} from room ${previousRoomId}`
          );
          const userCount = await refreshRoomUserCount(previousRoomId);
          logInfo(
            requestId,
            `Updated user count for room ${previousRoomId}: ${userCount}`
          );
          changedRooms.push({ roomId: previousRoomId, userCount });
        }
      }
    }

    // Join next room
    if (nextRoomId) {
      const roomData = await getRoom(nextRoomId);
      if (!roomData) {
        logInfo(requestId, `Room not found while switching: ${nextRoomId}`);
        return createErrorResponse("Next room not found", 404);
      }

      await setRoomPresence(nextRoomId, username);
      logInfo(
        requestId,
        `Set presence for user ${username} in room ${nextRoomId}`
      );
      const userCount = await refreshRoomUserCount(nextRoomId);
      logInfo(
        requestId,
        `Updated user count for room ${nextRoomId}: ${userCount}`
      );

      await setRoom(nextRoomId, { ...roomData, userCount });
      changedRooms.push({ roomId: nextRoomId, userCount });
    }

    try {
      for (const room of changedRooms) {
        await broadcastRoomUpdated(room.roomId);
      }
    } catch (pusherErr) {
      logError(
        requestId,
        "Error triggering Pusher events in switchRoom:",
        pusherErr
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, "Error during switchRoom:", error);
    return createErrorResponse("Failed to switch room", 500);
  }
}

/**
 * Handle get room users request
 */
export async function handleGetRoomUsers(
  roomId: string
): Promise<Response> {
  const users = await getActiveUsersAndPrune(roomId);
  return new Response(JSON.stringify({ users }), {
    headers: { "Content-Type": "application/json" },
  });
}



