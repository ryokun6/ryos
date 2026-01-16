/**
 * Room service - CRUD operations for chat rooms
 */

import { getRedis } from "../_lib/redis.js";
import { REDIS_KEYS, TTL } from "../_lib/constants.js";
import type { Room, RoomType } from "../_lib/types.js";

// =============================================================================
// ID Generation
// =============================================================================

/**
 * Generate a unique room ID
 */
export function generateRoomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// =============================================================================
// Room CRUD
// =============================================================================

/**
 * Get a room by ID
 */
export async function getRoom(roomId: string): Promise<Room | null> {
  const redis = getRedis();
  const data = await redis.get<Room | string>(`${REDIS_KEYS.ROOM}${roomId}`);
  if (!data) return null;
  return typeof data === "string" ? JSON.parse(data) : data;
}

/**
 * Set a room
 */
export async function setRoom(roomId: string, room: Room): Promise<void> {
  const redis = getRedis();
  await redis.set(`${REDIS_KEYS.ROOM}${roomId}`, JSON.stringify(room));
}

/**
 * Delete a room and its associated data
 */
export async function deleteRoom(roomId: string): Promise<void> {
  const redis = getRedis();
  const pipeline = redis.pipeline();
  pipeline.del(`${REDIS_KEYS.ROOM}${roomId}`);
  pipeline.del(`${REDIS_KEYS.MESSAGES}${roomId}`);
  pipeline.del(`${REDIS_KEYS.ROOM_USERS}${roomId}`);
  pipeline.del(`${REDIS_KEYS.ROOM_PRESENCE_ZSET}${roomId}`);
  pipeline.srem(REDIS_KEYS.ROOMS_SET, roomId);
  await pipeline.exec();
}

/**
 * Register a room in the rooms set
 */
export async function registerRoom(roomId: string): Promise<void> {
  const redis = getRedis();
  await redis.sadd(REDIS_KEYS.ROOMS_SET, roomId);
}

/**
 * Create a new room
 */
export async function createRoom(
  name: string,
  type: RoomType = "public",
  members?: string[]
): Promise<Room> {
  const redis = getRedis();
  const roomId = generateRoomId();
  
  const room: Room = {
    id: roomId,
    name,
    type,
    createdAt: Date.now(),
    userCount: type === "private" && members ? members.length : 0,
    ...(type === "private" && members ? { members } : {}),
  };

  await redis.set(`${REDIS_KEYS.ROOM}${roomId}`, JSON.stringify(room));
  await redis.sadd(REDIS_KEYS.ROOMS_SET, roomId);

  return room;
}

/**
 * Update room members (for private rooms)
 */
export async function updateRoomMembers(
  roomId: string,
  members: string[]
): Promise<Room | null> {
  const room = await getRoom(roomId);
  if (!room) return null;

  const updatedRoom: Room = {
    ...room,
    members,
    userCount: members.length,
  };

  await setRoom(roomId, updatedRoom);
  return updatedRoom;
}

// =============================================================================
// Room Listing
// =============================================================================

/**
 * Get all room IDs
 */
export async function getAllRoomIds(): Promise<string[]> {
  const redis = getRedis();
  let roomIds = await redis.smembers(REDIS_KEYS.ROOMS_SET);

  if (!roomIds || roomIds.length === 0) {
    // Fallback: discover rooms from keys
    const discovered: string[] = [];
    let cursor = 0;
    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: `${REDIS_KEYS.ROOM}*`,
        count: 100,
      });
      cursor = parseInt(String(newCursor));
      const ids = keys.map((k) => k.substring(REDIS_KEYS.ROOM.length));
      discovered.push(...ids);
    } while (cursor !== 0);

    if (discovered.length) {
      await redis.sadd(REDIS_KEYS.ROOMS_SET, ...(discovered as [string, ...string[]]));
      roomIds = discovered;
    }
  }

  return roomIds;
}

/**
 * Get all rooms with basic info
 */
export async function getAllRooms(): Promise<Room[]> {
  const redis = getRedis();
  const roomIds = await getAllRoomIds();
  if (roomIds.length === 0) return [];

  const roomKeys = roomIds.map((id) => `${REDIS_KEYS.ROOM}${id}`);
  const roomsData = await redis.mget<(Room | string | null)[]>(...roomKeys);

  const rooms: Room[] = [];
  for (const raw of roomsData) {
    if (!raw) continue;
    const room = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (room) rooms.push(room);
  }

  return rooms;
}

/**
 * Filter rooms visible to a user
 */
export function filterVisibleRooms(rooms: Room[], username: string | null): Room[] {
  return rooms.filter((room) => {
    // Public rooms are visible to everyone
    if (!room.type || room.type === "public") return true;
    
    // Private rooms only visible to members
    if (room.type === "private" && room.members && username) {
      return room.members.includes(username.toLowerCase());
    }
    
    return false;
  });
}
