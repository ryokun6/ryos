/**
 * Presence management for chat-rooms API
 * Handles user presence tracking using Redis ZSETs
 */

import { createRedis } from "../../_utils/redis.js";
import { parseMessageData, parseRoomData, setRoom } from "./_redis.js";
import {
  CHAT_ROOM_PREFIX,
  CHAT_MESSAGES_PREFIX,
  CHAT_ROOM_PRESENCE_ZSET_PREFIX,
  CHAT_ROOMS_SET,
  ROOM_PRESENCE_TTL_SECONDS,
} from "./_constants.js";
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
  rooms: T[]
): Promise<T[]> {
  const privateRooms = rooms.filter((room) => room.type === "private");
  if (privateRooms.length === 0) return rooms;

  const redis = getRedis();
  const lastMessages = await Promise.all(
    privateRooms.map((room) =>
      redis.lindex(`${CHAT_MESSAGES_PREFIX}${room.id}`, 0)
    )
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
  username: string
): Promise<void> {
  const redis = getRedis();
  const entry = { score: Date.now(), member: username };
  await redis.zadd(redisKeys.chat.roomPresence(roomId), entry);
}

/**
 * Remove user presence from a room
 */
export async function removeRoomPresence(
  roomId: string,
  username: string
): Promise<number> {
  const redis = getRedis();
  const canonicalRemoved = await redis.zrem(redisKeys.chat.roomPresence(roomId), username);
  const legacyRemoved = await redis.zrem(`${CHAT_ROOM_PRESENCE_ZSET_PREFIX}${roomId}`, username);
  return canonicalRemoved + legacyRemoved;
}

/**
 * Get active users in a room (prunes expired entries)
 */
export async function getActiveUsersInRoom(roomId: string): Promise<string[]> {
  const redis = getRedis();
  const zkey = redisKeys.chat.roomPresence(roomId);
  const legacyZkey = `${CHAT_ROOM_PRESENCE_ZSET_PREFIX}${roomId}`;
  const cutoff = Date.now() - ROOM_PRESENCE_TTL_SECONDS * 1000;
  await redis.zremrangebyscore(zkey, 0, cutoff);
  await redis.zremrangebyscore(legacyZkey, 0, cutoff);
  return [
    ...new Set([
      ...(await redis.zrange(zkey, 0, -1)),
      ...(await redis.zrange(legacyZkey, 0, -1)),
    ]),
  ];
}

/**
 * Re-calculate the active user count for a room via ZSET pruning
 * Updates the stored room object and returns the fresh count
 */
export async function refreshRoomUserCount(roomId: string): Promise<number> {
  const redis = getRedis();
  const zkey = redisKeys.chat.roomPresence(roomId);
  const legacyZkey = `${CHAT_ROOM_PRESENCE_ZSET_PREFIX}${roomId}`;
  const cutoff = Date.now() - ROOM_PRESENCE_TTL_SECONDS * 1000;
  await redis.zremrangebyscore(zkey, 0, cutoff);
  await redis.zremrangebyscore(legacyZkey, 0, cutoff);
  const userCount = new Set([
    ...(await redis.zrange(zkey, 0, -1)),
    ...(await redis.zrange(legacyZkey, 0, -1)),
  ]).size;

  const roomRaw =
    (await redis.get(redisKeys.chat.roomMeta(roomId))) ??
    (await redis.get(`${CHAT_ROOM_PREFIX}${roomId}`));
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
    const roomIds = [
      ...new Set([
        ...(await redis.smembers<string[]>(redisKeys.chat.roomIds())),
        ...(await redis.smembers<string[]>(CHAT_ROOMS_SET)),
      ]),
    ];
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
  await redis.del(redisKeys.chat.roomPresence(roomId), `${CHAT_ROOM_PRESENCE_ZSET_PREFIX}${roomId}`);
}

// ============================================================================
// Room Listing with Presence
// ============================================================================

/**
 * Get detailed rooms with user list
 */
export async function getDetailedRooms(): Promise<RoomWithUsers[]> {
  const redis = getRedis();
  let roomIds = [
    ...new Set([
      ...(await redis.smembers<string[]>(redisKeys.chat.roomIds())),
      ...(await redis.smembers<string[]>(CHAT_ROOMS_SET)),
    ]),
  ];

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
      await redis.sadd(redisKeys.chat.roomIds(), ...(discovered as [string, ...string[]]));
      roomIds = discovered;
    } else {
      return [];
    }
  }

  const rooms: RoomWithUsers[] = [];
  for (const roomId of roomIds) {
    const raw =
      (await redis.get(redisKeys.chat.roomMeta(roomId))) ??
      (await redis.get(`${CHAT_ROOM_PREFIX}${roomId}`));
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
  return attachPrivateRoomLastMessageAt(rooms);
}

/**
 * Get rooms with user counts only (fast path using pipeline)
 */
export async function getRoomsWithCountsFast(): Promise<Room[]> {
  const redis = getRedis();
  let roomIds = [
    ...new Set([
      ...(await redis.smembers<string[]>(redisKeys.chat.roomIds())),
      ...(await redis.smembers<string[]>(CHAT_ROOMS_SET)),
    ]),
  ];

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
      await redis.sadd(redisKeys.chat.roomIds(), ...(discovered as [string, ...string[]]));
      roomIds = discovered;
    } else {
      return [];
    }
  }

  const cutoff = Date.now() - ROOM_PRESENCE_TTL_SECONDS * 1000;
  const rooms: Room[] = [];
  for (const roomId of roomIds) {
    await redis.zremrangebyscore(redisKeys.chat.roomPresence(roomId), 0, cutoff);
    await redis.zremrangebyscore(`${CHAT_ROOM_PRESENCE_ZSET_PREFIX}${roomId}`, 0, cutoff);
    const raw =
      (await redis.get(redisKeys.chat.roomMeta(roomId))) ??
      (await redis.get(`${CHAT_ROOM_PREFIX}${roomId}`));
    if (!raw) continue;
    const roomObj = parseRoomData(raw);
    if (!roomObj) continue;
    const userCount = new Set([
      ...(await redis.zrange(redisKeys.chat.roomPresence(roomObj.id), 0, -1)),
      ...(await redis.zrange(`${CHAT_ROOM_PRESENCE_ZSET_PREFIX}${roomObj.id}`, 0, -1)),
    ]).size;
    rooms.push({ ...roomObj, userCount });
  }
  return attachPrivateRoomLastMessageAt(rooms);
}
