import {
  CHAT_ROOM_PREFIX,
  CHAT_ROOM_USERS_PREFIX,
  CHAT_ROOMS_SET,
  CHAT_ROOM_PRESENCE_ZSET_PREFIX,
} from "./_constants.js";
import { redis } from "./_redis.js";
import { validateAuth } from "../_utils/auth.js";
import { createErrorResponse } from "./_helpers.js";
import { logInfo, logError } from "../_utils/logging.js";
import { deleteRoomPresence, getDetailedRooms } from "./_presence.js";

/**
 * Admin-only: reset user counts and clear room memberships/presence.
 */
export async function handleResetUserCounts(
  username: string | null,
  token: string | null,
  requestId: string
): Promise<Response> {
  logInfo(requestId, "Resetting all user counts and clearing room memberships");

  if (!username || !token) {
    return createErrorResponse("Forbidden - Admin access required", 403);
  }
  if (username.toLowerCase() !== "ryo") {
    logInfo(requestId, `Unauthorized: User ${username} is not the admin`);
    return createErrorResponse("Forbidden - Admin access required", 403);
  }

  const authResult = await validateAuth(username, token, requestId);
  if (!authResult.valid) {
    logInfo(requestId, `Unauthorized: Invalid token for admin user ${username}`);
    return createErrorResponse("Forbidden - Admin access required", 403);
  }

  try {
    const roomIds = await redis.smembers(CHAT_ROOMS_SET);
    const roomKeys = roomIds.map((id) => `${CHAT_ROOM_PREFIX}${id}`);

    logInfo(requestId, `Found ${roomKeys.length} rooms to update`);

    if (roomKeys.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No rooms to update" }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Get all room user set keys using SCAN
    const roomUserKeys: string[] = [];
    let cursor = 0;

    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: `${CHAT_ROOM_USERS_PREFIX}*`,
        count: 100,
      });
      cursor = parseInt(String(newCursor));
      roomUserKeys.push(...keys);
    } while (cursor !== 0);

    // Build presence ZSET keys for all rooms
    const presenceKeys = roomIds.map(
      (id) => `${CHAT_ROOM_PRESENCE_ZSET_PREFIX}${id}`
    );

    // Clear all room user sets and presence keys
    const deleteRoomUsersPipeline = redis.pipeline();
    roomUserKeys.forEach((key) => {
      deleteRoomUsersPipeline.del(key);
    });
    presenceKeys.forEach((key) => {
      deleteRoomUsersPipeline.del(key);
    });
    await deleteRoomUsersPipeline.exec();
    logInfo(
      requestId,
      `Cleared ${roomUserKeys.length} room user sets and ${presenceKeys.length} presence keys`
    );

    // Update all room objects to set userCount to 0
    const roomsData = await redis.mget<(Record<string, unknown> | string | null)[]>(
      ...roomKeys
    );
    const updateRoomsPipeline = redis.pipeline();

    roomsData.forEach((roomData, index) => {
      if (roomData) {
        const room =
          typeof roomData === "object" ? roomData : JSON.parse(roomData as string);
        const updatedRoom = { ...room, userCount: 0 };
        updateRoomsPipeline.set(roomKeys[index], updatedRoom);
      }
    });

    await updateRoomsPipeline.exec();
    logInfo(requestId, `Reset user count to 0 for ${roomKeys.length} rooms`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Reset user counts for ${roomKeys.length} rooms`,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    logError(requestId, "Error resetting user counts:", error);
    return createErrorResponse("Failed to reset user counts", 500);
  }
}
