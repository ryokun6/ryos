/**
 * Presence management for chat-rooms API
 * Handles user presence tracking using Redis ZSETs
 */

import { createRedis, type Redis } from "../../_utils/redis.js";
import {
  getAllRoomIds,
  parseMessageData,
  parseRoomData,
  setRoom,
} from "./_redis.js";
import { ROOM_PRESENCE_TTL_SECONDS } from "./_constants.js";
import type { Room, RoomWithUsers } from "./_types.js";
import { redisKeys } from "../../../src/shared/redisKeys.js";

// Create Redis client for presence operations
function getRedis() {
  return createRedis();
}

function getMessageTimestamp(value: unknown): number | undefined {
  const message = parseMessageData(value);
  if (!message) return undefined;

  const rawTimestamp = (message as { timestamp?: unknown }).timestamp;
  const timestamp =
    typeof rawTimestamp === "number"
      ? rawTimestamp
      : new Date(String(rawTimestamp)).getTime();

  return Number.isFinite(timestamp) ? timestamp : undefined;
}

async function attachPrivateRoomLastMessageAt<T extends Room>(
  rooms: T[],
  redis: Redis = getRedis()
): Promise<T[]> {
  const privateRooms = rooms.filter((room) => room.type === "private");
  if (privateRooms.length === 0) return rooms;

  const lastMessages = await Promise.all(
    privateRooms.map(async (room) => {
      // Newest message is at index 0 (messages are LPUSH-ed).
      return redis.lindex(redisKeys.chat.roomMessages(room.id), 0);
    })
  );
  const lastMessageAtByRoomId = new Map<string, number>();

  privateRooms.forEach((room, index) => {
    const lastMessageAt = getMessageTimestamp(lastMessages[index]);
    if (lastMessageAt !== undefined) {
      lastMessageAtByRoomId.set(room.id, lastMessageAt);
    }
  });

  return rooms.map((room) => {
    const lastMessageAt = lastMessageAtByRoomId.get(room.id);
    return lastMessageAt === undefined ? room : { ...room, lastMessageAt };
  });
}

// ============================================================================
// Presence Operations
// ============================================================================

/**
 * Set user presence in a room (using ZSET with timestamp as score)
 */
export async function setRoomPresence(
  roomId: string,
  username: string,
  redis: Redis = getRedis()
): Promise<void> {
  const entry = { score: Date.now(), member: username };
  await redis.zadd(redisKeys.chat.roomPresence(roomId), entry);
}

/**
 * Remove user presence from a room
 */
export async function removeRoomPresence(
  roomId: string,
  username: string,
  redis: Redis = getRedis()
): Promise<number> {
  return redis.zrem(redisKeys.chat.roomPresence(roomId), username);
}

/**
 * Get active users in a room (prunes expired entries)
 */
export async function getActiveUsersInRoom(
  roomId: string,
  redis: Redis = getRedis()
): Promise<string[]> {
  const zkey = redisKeys.chat.roomPresence(roomId);
  const cutoff = Date.now() - ROOM_PRESENCE_TTL_SECONDS * 1000;
  await redis.zremrangebyscore(zkey, 0, cutoff);
  return [...new Set(await redis.zrange(zkey, 0, -1))];
}

/**
 * Re-calculate the active user count for a room via ZSET pruning
 * Updates the stored room object and returns the fresh count
 */
export async function refreshRoomUserCount(
  roomId: string,
  redis: Redis = getRedis()
): Promise<number> {
  const zkey = redisKeys.chat.roomPresence(roomId);
  const cutoff = Date.now() - ROOM_PRESENCE_TTL_SECONDS * 1000;
  await redis.zremrangebyscore(zkey, 0, cutoff);
  const userCount = new Set(await redis.zrange(zkey, 0, -1)).size;

  const roomRaw = await redis.get(redisKeys.chat.roomMeta(roomId));
  const roomData = parseRoomData(roomRaw);
  if (roomData) {
    const updatedRoom: Room = { ...roomData, userCount };
    await setRoom(roomId, updatedRoom, redis);
  }

  return userCount;
}

/**
 * Clean up expired presence entries and update room counts
 */
export async function cleanupExpiredPresence(): Promise<{
  success: boolean;
  roomsUpdated?: number;
  error?: string;
}> {
  try {
    const redis = getRedis();
    const roomIds = await getAllRoomIds(redis);
    for (const roomId of roomIds) {
      const newCount = await refreshRoomUserCount(roomId, redis);
      console.log(
        `[cleanupExpiredPresence] Updated room ${roomId} count to ${newCount}`
      );
    }
    return { success: true, roomsUpdated: roomIds.length };
  } catch (error) {
    console.error("[cleanupExpiredPresence] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Delete presence ZSET for a room
 */
export async function deleteRoomPresence(
  roomId: string,
  redis: Redis = getRedis()
): Promise<void> {
  await redis.del(redisKeys.chat.roomPresence(roomId));
}

// ============================================================================
// Room Listing with Presence
// ============================================================================

/**
 * Get detailed rooms with user list
 */
export async function getDetailedRooms(
  redis: Redis = getRedis()
): Promise<RoomWithUsers[]> {
  const roomIds = await getAllRoomIds(redis);
  if (roomIds.length === 0) return [];

  const rooms: RoomWithUsers[] = [];
  for (const roomId of roomIds) {
    const raw = await redis.get(redisKeys.chat.roomMeta(roomId));
    if (!raw) continue;
    const roomObj = parseRoomData(raw);
    if (!roomObj) continue;
    const activeUsers = await getActiveUsersInRoom(roomObj.id, redis);
    rooms.push({
      ...roomObj,
      userCount: activeUsers.length,
      users: activeUsers,
    });
  }
  return attachPrivateRoomLastMessageAt(rooms, redis);
}

/**
 * Get rooms with user counts only (fast path using pipeline)
 */
export async function getRoomsWithCountsFast(
  redis: Redis = getRedis()
): Promise<Room[]> {
  const roomIds = await getAllRoomIds(redis);
  if (roomIds.length === 0) return [];

  const cutoff = Date.now() - ROOM_PRESENCE_TTL_SECONDS * 1000;
  const pipeline = redis.pipeline();
  for (const roomId of roomIds) {
    const presenceKey = redisKeys.chat.roomPresence(roomId);
    pipeline.zremrangebyscore(presenceKey, 0, cutoff);
    pipeline.get(redisKeys.chat.roomMeta(roomId));
    pipeline.zcard(presenceKey);
  }

  const results = await pipeline.exec();
  const rooms: Room[] = [];
  for (let index = 0; index < roomIds.length; index++) {
    const raw = results[index * 3 + 1];
    if (!raw) continue;
    const roomObj = parseRoomData(raw);
    if (!roomObj) continue;
    const rawCount = results[index * 3 + 2];
    const userCount = typeof rawCount === "number" ? rawCount : Number(rawCount) || 0;
    rooms.push({ ...roomObj, userCount });
  }
  return attachPrivateRoomLastMessageAt(rooms, redis);
}
