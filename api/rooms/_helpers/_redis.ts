/**
 * Redis client and helper functions for chat-rooms API
 * Edge-compatible - uses Web Crypto API
 */

import type { Room, User, Message } from "./_types.js";
import type { Redis } from "../../_utils/redis.js";
import {
  createRedisClient,
  generateRandomHexId,
  getCurrentTimestamp,
  parseJSON,
} from "../../_utils/redis-helpers.js";
import { redisKeys } from "../../../src/shared/redisKeys.js";
import {
  createStoredUserIfNotExists,
  getStoredUserRecord,
  updateStoredUserLastActive,
} from "../../_utils/auth/_user-record.js";

// Export for direct usage in endpoints and feature helpers.
export { createRedisClient, getCurrentTimestamp, parseJSON };

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique ID (128-bit random identifier encoded as hex)
 * Uses Web Crypto API for Edge compatibility
 */
export function generateId(): string {
  return generateRandomHexId(16);
}

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
export async function getRoom(
  roomId: string,
  client: Redis = createRedisClient()
): Promise<Room | null> {
  const data = await client.get(redisKeys.chat.roomMeta(roomId));
  return parseRoomData(data);
}

/**
 * Set a room
 */
export async function setRoom(
  roomId: string,
  room: Room,
  client: Redis = createRedisClient()
): Promise<void> {
  await client.set(redisKeys.chat.roomMeta(roomId), room);
}

/**
 * Delete a room
 */
export async function deleteRoom(
  roomId: string,
  client: Redis = createRedisClient()
): Promise<void> {
  await client.del(redisKeys.chat.roomMeta(roomId));
}

/**
 * Check if a room exists
 */
export async function roomExists(
  roomId: string,
  client: Redis = createRedisClient()
): Promise<boolean> {
  const exists = await client.exists(redisKeys.chat.roomMeta(roomId));
  return exists > 0;
}

/**
 * Get all room IDs from the registry set
 */
export async function getAllRoomIds(
  client: Redis = createRedisClient()
): Promise<string[]> {
  let roomIds = await client.smembers<string[]>(redisKeys.chat.roomIds());

  if (!roomIds || roomIds.length === 0) {
    // Self-heal: rebuild the registry set from the canonical room-meta keys
    // (`chat:rooms:<id>:meta`) if the set is ever empty/missing.
    const metaPrefix = "chat:rooms:";
    const metaSuffix = ":meta";
    const discovered: string[] = [];
    let cursor = 0;
    do {
      const [newCursor, keys] = await client.scan(cursor, {
        match: `${metaPrefix}*${metaSuffix}`,
        count: 100,
      });
      cursor = parseInt(String(newCursor));
      for (const k of keys) {
        if (k.startsWith(metaPrefix) && k.endsWith(metaSuffix)) {
          const id = k.slice(metaPrefix.length, k.length - metaSuffix.length);
          if (id) discovered.push(id);
        }
      }
    } while (cursor !== 0);

    if (discovered.length) {
      await client.sadd(redisKeys.chat.roomIds(), ...(discovered as [string, ...string[]]));
      roomIds = discovered;
    }
  }

  return roomIds || [];
}

/**
 * Register a room ID in the registry set
 */
export async function registerRoom(
  roomId: string,
  client: Redis = createRedisClient()
): Promise<void> {
  await client.sadd(redisKeys.chat.roomIds(), roomId);
}

/**
 * Unregister a room ID from the registry set
 */
export async function unregisterRoom(
  roomId: string,
  client: Redis = createRedisClient()
): Promise<void> {
  await client.srem(redisKeys.chat.roomIds(), roomId);
}

// ============================================================================
// User Operations
// ============================================================================

/**
 * Get a user by username
 */
export async function getUser(
  username: string,
  client: Redis = createRedisClient()
): Promise<User | null> {
  const record = await getStoredUserRecord(client, username);
  return parseUserData(record);
}

/**
 * Patch a user's activity timestamp without replacing account metadata.
 */
export async function updateUserLastActive(
  username: string,
  lastActive: number,
  client: Redis = createRedisClient()
): Promise<boolean> {
  return updateStoredUserLastActive(client, username, lastActive);
}

/**
 * Create a user atomically if they don't exist
 * Returns true if created, false if already exists
 */
export async function createUserIfNotExists(
  username: string,
  user: User,
  client: Redis = createRedisClient()
): Promise<boolean> {
  return createStoredUserIfNotExists(client, username, user);
}

/**
 * Check if a user exists
 */
export async function userExists(
  username: string,
  client: Redis = createRedisClient()
): Promise<boolean> {
  const exists = await client.exists(redisKeys.auth.userProfile(username));
  return exists > 0;
}

// ============================================================================
// Message Operations
// ============================================================================

/**
 * Get messages for a room
 */
export async function getMessages(
  roomId: string,
  limit: number = 20,
  client: Redis = createRedisClient()
): Promise<Message[]> {
  const messagesKey = redisKeys.chat.roomMessages(roomId);
  const rawMessages = await client.lrange<(Message | string)[]>(messagesKey, 0, limit - 1);

  const seenIds = new Set<string>();
  return (rawMessages || []).reduce<Message[]>((acc, item) => {
    const message = parseMessageData(item);
    if (message !== null && !seenIds.has(message.id) && acc.length < limit) {
      seenIds.add(message.id);
      acc.push(message);
    }
    return acc;
  }, []);
}

/**
 * Add a message to a room
 */
export async function addMessage(
  roomId: string,
  message: Message,
  client: Redis = createRedisClient()
): Promise<void> {
  const serialized = JSON.stringify(message);
  const messagesKey = redisKeys.chat.roomMessages(roomId);
  await client.lpush(messagesKey, serialized);
  await client.ltrim(messagesKey, 0, 99);
}

/**
 * Delete a message from a room
 */
export async function deleteMessage(
  roomId: string,
  messageId: string,
  client: Redis = createRedisClient()
): Promise<boolean> {
  const listKey = redisKeys.chat.roomMessages(roomId);
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
export async function deleteAllMessages(
  roomId: string,
  client: Redis = createRedisClient()
): Promise<void> {
  await client.del(redisKeys.chat.roomMessages(roomId));
}

/**
 * Get the last message in a room (for duplicate detection)
 */
export async function getLastMessage(
  roomId: string,
  client: Redis = createRedisClient()
): Promise<Message | null> {
  const messagesKey = redisKeys.chat.roomMessages(roomId);
  const lastMessages = await client.lrange<(Message | string)[]>(messagesKey, 0, 0);
  if (!lastMessages || lastMessages.length === 0) return null;
  return parseMessageData(lastMessages[0]);
}
