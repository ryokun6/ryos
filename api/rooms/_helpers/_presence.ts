/**
 * Presence management for chat-rooms API
 * Handles user presence tracking using Redis ZSETs
 */

import { Redis } from "@upstash/redis";
import { parseRoomData, setRoom } from "./_redis.js";
import {
  CHAT_ROOM_PREFIX,
  CHAT_ROOM_PRESENCE_ZSET_PREFIX,
  CHAT_ROOMS_SET,
  ROOM_PRESENCE_TTL_SECONDS,
} from "./_constants.js";
import type { Room, RoomWithUsers } from "./_types.js";

// Create Redis client for presence operations
function getRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
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
  username: string
): Promise<void> {
  const redis = getRedis();
  const zkey = `${CHAT_ROOM_PRESENCE_ZSET_PREFIX}${roomId}`;
  await redis.zadd(zkey, { score: Date.now(), member: username });
}

/**
 * Refresh user presence in a room
 */
export async function refreshRoomPresence(
  roomId: string,
  username: string
): Promise<void> {
  const redis = getRedis();
  const zkey = `${CHAT_ROOM_PRESENCE_ZSET_PREFIX}${roomId}`;
  await redis.zadd(zkey, { score: Date.now(), member: username });
}

/**
 * Remove user presence from a room
 */
export async function removeRoomPresence(
  roomId: string,
  username: string
): Promise<number> {
  const redis = getRedis();
  const zkey = `${CHAT_ROOM_PRESENCE_ZSET_PREFIX}${roomId}`;
  return await redis.zrem(zkey, username);
}

/**
 * Get active users in a room (prunes expired entries)
 */
export async function getActiveUsersInRoom(roomId: string): Promise<string[]> {
  const redis = getRedis();
  const zkey = `${CHAT_ROOM_PRESENCE_ZSET_PREFIX}${roomId}`;
  const cutoff = Date.now() - ROOM_PRESENCE_TTL_SECONDS * 1000;
  await redis.zremrangebyscore(zkey, 0, cutoff);
  return await redis.zrange(zkey, 0, -1);
}

/**
 * Get active users and prune expired presence entries
 */
export async function getActiveUsersAndPrune(
  roomId: string
): Promise<string[]> {
  return await getActiveUsersInRoom(roomId);
}

/**
 * Re-calculate the active user count for a room via ZSET pruning
 * Updates the stored room object and returns the fresh count
 */
export async function refreshRoomUserCount(roomId: string): Promise<number> {
  const redis = getRedis();
  const zkey = `${CHAT_ROOM_PRESENCE_ZSET_PREFIX}${roomId}`;
  const cutoff = Date.now() - ROOM_PRESENCE_TTL_SECONDS * 1000;
  await redis.zremrangebyscore(zkey, 0, cutoff);
  const userCount = await redis.zcard(zkey);

  const roomRaw = await redis.get(`${CHAT_ROOM_PREFIX}${roomId}`);
  const roomData = parseRoomData(roomRaw);
  if (roomData) {
    const updatedRoom: Room = { ...roomData, userCount };
    await setRoom(roomId, updatedRoom);
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
    const roomIds = await redis.smembers(CHAT_ROOMS_SET);
    for (const roomId of roomIds) {
      const newCount = await refreshRoomUserCount(roomId);
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
export async function deleteRoomPresence(roomId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`${CHAT_ROOM_PRESENCE_ZSET_PREFIX}${roomId}`);
}

// ============================================================================
// Room Listing with Presence
// ============================================================================

/**
 * Get detailed rooms with user list
 */
export async function getDetailedRooms(): Promise<RoomWithUsers[]> {
  const redis = getRedis();
  let roomIds = await redis.smembers(CHAT_ROOMS_SET);

  if (!roomIds || roomIds.length === 0) {
    // Fallback: discover rooms and repopulate registry
    const discovered: string[] = [];
    let cursor = 0;
    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: `${CHAT_ROOM_PREFIX}*`,
        count: 100,
      });
      cursor = parseInt(String(newCursor));
      const ids = keys.map((k) => k.substring(CHAT_ROOM_PREFIX.length));
      discovered.push(...ids);
    } while (cursor !== 0);
    if (discovered.length) {
      await redis.sadd(CHAT_ROOMS_SET, ...(discovered as [string, ...string[]]));
      roomIds = discovered;
    } else {
      return [];
    }
  }

  const roomKeys = roomIds.map((id) => `${CHAT_ROOM_PREFIX}${id}`);
  const roomsData = await redis.mget<(Room | string | null)[]>(...(roomKeys as [string, ...string[]]));

  const rooms: RoomWithUsers[] = [];
  for (let i = 0; i < roomsData.length; i++) {
    const raw = roomsData[i];
    if (!raw) continue;
    const roomObj = parseRoomData(raw);
    if (!roomObj) continue;
    const activeUsers = await getActiveUsersInRoom(roomObj.id);
    rooms.push({
      ...roomObj,
      userCount: activeUsers.length,
      users: activeUsers,
    });
  }
  return rooms;
}

/**
 * Get rooms with user counts only (fast path using pipeline)
 */
export async function getRoomsWithCountsFast(): Promise<Room[]> {
  const redis = getRedis();
  let roomIds = await redis.smembers(CHAT_ROOMS_SET);

  if (!roomIds || roomIds.length === 0) {
    const discovered: string[] = [];
    let cursor = 0;
    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: `${CHAT_ROOM_PREFIX}*`,
        count: 100,
      });
      cursor = parseInt(String(newCursor));
      const ids = keys.map((k) => k.substring(CHAT_ROOM_PREFIX.length));
      discovered.push(...ids);
    } while (cursor !== 0);
    if (discovered.length) {
      await redis.sadd(CHAT_ROOMS_SET, ...(discovered as [string, ...string[]]));
      roomIds = discovered;
    } else {
      return [];
    }
  }

  const roomKeys = roomIds.map((id) => `${CHAT_ROOM_PREFIX}${id}`);
  const roomsData = await redis.mget<(Room | string | null)[]>(...(roomKeys as [string, ...string[]]));

  // Batch prune + count ZSET presence for all rooms
  const pipeline = redis.pipeline();
  const zkeys = roomIds.map((id) => `${CHAT_ROOM_PRESENCE_ZSET_PREFIX}${id}`);
  const cutoff = Date.now() - ROOM_PRESENCE_TTL_SECONDS * 1000;
  for (const z of zkeys) {
    pipeline.zremrangebyscore(z, 0, cutoff);
    pipeline.zcard(z);
  }
  const results = await pipeline.exec();

  const rooms: Room[] = [];
  let resIdx = 0;
  for (let i = 0; i < roomsData.length; i++) {
    const raw = roomsData[i];
    if (!raw) {
      resIdx += 2;
      continue;
    }
    const roomObj = parseRoomData(raw);
    if (!roomObj) {
      resIdx += 2;
      continue;
    }
    resIdx += 1; // Skip pruned result
    const userCount = Number(results[resIdx]);
    resIdx += 1;
    rooms.push({ ...roomObj, userCount });
  }
  return rooms;
}
