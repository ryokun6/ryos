/**
 * Presence service - User presence tracking in rooms
 */

import { getRedis } from "../_lib/redis.js";
import { REDIS_KEYS, TTL } from "../_lib/constants.js";
import { getRoom, setRoom, getAllRoomIds } from "./rooms.js";
import type { Room, RoomWithUsers } from "../_lib/types.js";

// Presence TTL in seconds (1 day)
const PRESENCE_TTL_SECONDS = TTL.ROOM_PRESENCE;

// =============================================================================
// Presence Operations
// =============================================================================

/**
 * Set user presence in a room
 */
export async function setRoomPresence(
  roomId: string,
  username: string
): Promise<void> {
  const redis = getRedis();
  const zkey = `${REDIS_KEYS.ROOM_PRESENCE_ZSET}${roomId}`;
  await redis.zadd(zkey, { score: Date.now(), member: username.toLowerCase() });
}

/**
 * Remove user presence from a room
 */
export async function removeRoomPresence(
  roomId: string,
  username: string
): Promise<number> {
  const redis = getRedis();
  const zkey = `${REDIS_KEYS.ROOM_PRESENCE_ZSET}${roomId}`;
  return await redis.zrem(zkey, username.toLowerCase());
}

/**
 * Get active users in a room (prunes expired entries)
 */
export async function getActiveUsersInRoom(roomId: string): Promise<string[]> {
  const redis = getRedis();
  const zkey = `${REDIS_KEYS.ROOM_PRESENCE_ZSET}${roomId}`;
  const cutoff = Date.now() - PRESENCE_TTL_SECONDS * 1000;
  
  // Prune expired entries
  await redis.zremrangebyscore(zkey, 0, cutoff);
  
  // Get remaining users
  return await redis.zrange(zkey, 0, -1);
}

/**
 * Refresh room user count from presence data
 */
export async function refreshRoomUserCount(roomId: string): Promise<number> {
  const redis = getRedis();
  const zkey = `${REDIS_KEYS.ROOM_PRESENCE_ZSET}${roomId}`;
  const cutoff = Date.now() - PRESENCE_TTL_SECONDS * 1000;
  
  // Prune expired entries
  await redis.zremrangebyscore(zkey, 0, cutoff);
  
  // Get count
  const userCount = await redis.zcard(zkey);

  // Update room object
  const room = await getRoom(roomId);
  if (room) {
    const updatedRoom: Room = { ...room, userCount };
    await setRoom(roomId, updatedRoom);
  }

  return userCount;
}

/**
 * Delete all presence data for a room
 */
export async function deleteRoomPresence(roomId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`${REDIS_KEYS.ROOM_PRESENCE_ZSET}${roomId}`);
}

// =============================================================================
// Room Listing with Presence
// =============================================================================

/**
 * Get all rooms with live user counts
 */
export async function getRoomsWithCounts(): Promise<Room[]> {
  const redis = getRedis();
  const roomIds = await getAllRoomIds();
  if (roomIds.length === 0) return [];

  const roomKeys = roomIds.map((id) => `${REDIS_KEYS.ROOM}${id}`);
  const roomsData = await redis.mget<(Room | string | null)[]>(...roomKeys);

  // Batch prune + count presence for all rooms
  const pipeline = redis.pipeline();
  const cutoff = Date.now() - PRESENCE_TTL_SECONDS * 1000;
  
  for (const roomId of roomIds) {
    const zkey = `${REDIS_KEYS.ROOM_PRESENCE_ZSET}${roomId}`;
    pipeline.zremrangebyscore(zkey, 0, cutoff);
    pipeline.zcard(zkey);
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
    
    const room = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!room) {
      resIdx += 2;
      continue;
    }
    
    resIdx += 1; // Skip prune result
    const userCount = Number(results[resIdx]) || 0;
    resIdx += 1;
    
    rooms.push({ ...room, userCount });
  }

  return rooms;
}

/**
 * Get rooms with full user lists
 */
export async function getRoomsWithUsers(): Promise<RoomWithUsers[]> {
  const redis = getRedis();
  const roomIds = await getAllRoomIds();
  if (roomIds.length === 0) return [];

  const roomKeys = roomIds.map((id) => `${REDIS_KEYS.ROOM}${id}`);
  const roomsData = await redis.mget<(Room | string | null)[]>(...roomKeys);

  const rooms: RoomWithUsers[] = [];
  
  for (const raw of roomsData) {
    if (!raw) continue;
    const room = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!room) continue;
    
    const activeUsers = await getActiveUsersInRoom(room.id);
    rooms.push({
      ...room,
      userCount: activeUsers.length,
      users: activeUsers,
    });
  }

  return rooms;
}

/**
 * Cleanup expired presence for all rooms
 */
export async function cleanupExpiredPresence(): Promise<{
  success: boolean;
  roomsUpdated: number;
}> {
  const roomIds = await getAllRoomIds();
  
  for (const roomId of roomIds) {
    await refreshRoomUserCount(roomId);
  }
  
  return { success: true, roomsUpdated: roomIds.length };
}
