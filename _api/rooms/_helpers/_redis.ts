/**
 * Redis client and helper functions for chat-rooms API
 * Edge-compatible - uses Web Crypto API
 */

import {
  createRedis,
  generateId as generateIdBase,
  getCurrentTimestamp,
  parseJSON,
} from "../../_utils/redis.js";
import type { Room, User, Message } from "./_types.js";
import {
  CHAT_ROOM_PREFIX,
  CHAT_MESSAGES_PREFIX,
  CHAT_USERS_PREFIX,
  CHAT_ROOMS_SET,
} from "./_constants.js";

// Re-export shared utilities
export { createRedis as createRedisClient, getCurrentTimestamp, parseJSON };
export const generateId = (): string => generateIdBase(16);

/**
 * Parse user data from Redis
 */
export function parseUserData(data: unknown): User | null {
  return parseJSON<User>(data);
}

/**
 * Parse room data from Redis
 */
export function parseRoomData(data: unknown): Room | null {
  return parseJSON<Room>(data);
}

/**
 * Parse message data from Redis
 */
export function parseMessageData(data: unknown): Message | null {
  return parseJSON<Message>(data);
}

// ============================================================================
// Room Operations
// ============================================================================

/**
 * Get a room by ID
 */
export async function getRoom(roomId: string): Promise<Room | null> {
  const client = createRedis();
  const data = await client.get(`${CHAT_ROOM_PREFIX}${roomId}`);
  return parseRoomData(data);
}

/**
 * Set a room
 */
export async function setRoom(roomId: string, room: Room): Promise<void> {
  const client = createRedis();
  await client.set(`${CHAT_ROOM_PREFIX}${roomId}`, room);
}

/**
 * Delete a room
 */
export async function deleteRoom(roomId: string): Promise<void> {
  const client = createRedis();
  await client.del(`${CHAT_ROOM_PREFIX}${roomId}`);
}

/**
 * Check if a room exists
 */
export async function roomExists(roomId: string): Promise<boolean> {
  const client = createRedis();
  const exists = await client.exists(`${CHAT_ROOM_PREFIX}${roomId}`);
  return exists === 1;
}

/**
 * Get all room IDs from the registry set
 */
export async function getAllRoomIds(): Promise<string[]> {
  const client = createRedis();
  let roomIds = await client.smembers<string[]>(CHAT_ROOMS_SET);

  if (!roomIds || roomIds.length === 0) {
    const discovered: string[] = [];
    let cursor = 0;
    do {
      const [newCursor, keys] = await client.scan(cursor, {
        match: `${CHAT_ROOM_PREFIX}*`,
        count: 100,
      });
      cursor = parseInt(String(newCursor));
      const ids = keys.map((k) => k.substring(CHAT_ROOM_PREFIX.length));
      discovered.push(...ids);
    } while (cursor !== 0);

    if (discovered.length) {
      await client.sadd(CHAT_ROOMS_SET, ...(discovered as [string, ...string[]]));
      roomIds = discovered;
    }
  }

  return roomIds || [];
}

/**
 * Register a room ID in the registry set
 */
export async function registerRoom(roomId: string): Promise<void> {
  const client = createRedis();
  await client.sadd(CHAT_ROOMS_SET, roomId);
}

/**
 * Unregister a room ID from the registry set
 */
export async function unregisterRoom(roomId: string): Promise<void> {
  const client = createRedis();
  await client.srem(CHAT_ROOMS_SET, roomId);
}

// ============================================================================
// User Operations
// ============================================================================

/**
 * Get a user by username
 */
export async function getUser(username: string): Promise<User | null> {
  const client = createRedis();
  const data = await client.get(`${CHAT_USERS_PREFIX}${username}`);
  return parseUserData(data);
}

/**
 * Set a user (user records persist forever)
 */
export async function setUser(username: string, user: User): Promise<void> {
  const client = createRedis();
  await client.set(`${CHAT_USERS_PREFIX}${username}`, JSON.stringify(user));
}

/**
 * Create a user atomically if they don't exist
 * Returns true if created, false if already exists
 */
export async function createUserIfNotExists(
  username: string,
  user: User
): Promise<boolean> {
  const client = createRedis();
  const created = await client.setnx(
    `${CHAT_USERS_PREFIX}${username}`,
    JSON.stringify(user)
  );
  return created === 1;
}

/**
 * Check if a user exists
 */
export async function userExists(username: string): Promise<boolean> {
  const client = createRedis();
  const exists = await client.exists(`${CHAT_USERS_PREFIX}${username}`);
  return exists === 1;
}

// ============================================================================
// Message Operations
// ============================================================================

/**
 * Get messages for a room
 */
export async function getMessages(
  roomId: string,
  limit: number = 20
): Promise<Message[]> {
  const client = createRedis();
  const messagesKey = `${CHAT_MESSAGES_PREFIX}${roomId}`;
  const rawMessages = await client.lrange<(Message | string)[]>(messagesKey, 0, limit - 1);

  return (rawMessages || [])
    .map((item) => parseMessageData(item))
    .filter((msg): msg is Message => msg !== null);
}

/**
 * Add a message to a room
 */
export async function addMessage(
  roomId: string,
  message: Message
): Promise<void> {
  const client = createRedis();
  const messagesKey = `${CHAT_MESSAGES_PREFIX}${roomId}`;
  await client.lpush(messagesKey, JSON.stringify(message));
  await client.ltrim(messagesKey, 0, 99);
}

/**
 * Delete a message from a room
 */
export async function deleteMessage(
  roomId: string,
  messageId: string
): Promise<boolean> {
  const client = createRedis();
  const listKey = `${CHAT_MESSAGES_PREFIX}${roomId}`;
  const messagesRaw = await client.lrange<(Message | string)[]>(listKey, 0, -1);

  let targetRaw: string | null = null;
  for (const raw of messagesRaw || []) {
    const obj = parseMessageData(raw);
    if (obj && obj.id === messageId) {
      targetRaw = typeof raw === "string" ? raw : JSON.stringify(raw);
      break;
    }
  }

  if (!targetRaw) return false;

  await client.lrem(listKey, 1, targetRaw);
  return true;
}

/**
 * Delete all messages for a room
 */
export async function deleteAllMessages(roomId: string): Promise<void> {
  const client = createRedis();
  await client.del(`${CHAT_MESSAGES_PREFIX}${roomId}`);
}

/**
 * Get the last message in a room (for duplicate detection)
 */
export async function getLastMessage(roomId: string): Promise<Message | null> {
  const client = createRedis();
  const messagesKey = `${CHAT_MESSAGES_PREFIX}${roomId}`;
  const lastMessages = await client.lrange<(Message | string)[]>(messagesKey, 0, 0);
  if (!lastMessages || lastMessages.length === 0) return null;
  return parseMessageData(lastMessages[0]);
}
