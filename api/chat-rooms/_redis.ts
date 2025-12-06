/**
 * Redis client and helper functions for chat-rooms API
 */

import { Redis } from "@upstash/redis";
import crypto from "crypto";
import type { Room, User, Message } from "./_types.js";
import {
  CHAT_ROOM_PREFIX,
  CHAT_MESSAGES_PREFIX,
  CHAT_USERS_PREFIX,
  CHAT_ROOMS_SET,
} from "./_constants.js";

// ============================================================================
// Redis Client
// ============================================================================

export const redis = new Redis({
  url: process.env.REDIS_KV_REST_API_URL,
  token: process.env.REDIS_KV_REST_API_TOKEN,
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique ID (128-bit random identifier encoded as hex)
 */
export function generateId(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Get current timestamp in milliseconds
 */
export function getCurrentTimestamp(): number {
  return Date.now();
}

/**
 * Parse JSON data safely
 */
export function parseJSON<T>(data: unknown): T | null {
  if (!data) return null;
  if (typeof data === "object") return data as T;
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }
  return null;
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
export async function getRoom(roomId: string): Promise<Room | null> {
  const data = await redis.get(`${CHAT_ROOM_PREFIX}${roomId}`);
  return parseRoomData(data);
}

/**
 * Set a room
 */
export async function setRoom(roomId: string, room: Room): Promise<void> {
  await redis.set(`${CHAT_ROOM_PREFIX}${roomId}`, room);
}

/**
 * Delete a room
 */
export async function deleteRoom(roomId: string): Promise<void> {
  await redis.del(`${CHAT_ROOM_PREFIX}${roomId}`);
}

/**
 * Check if a room exists
 */
export async function roomExists(roomId: string): Promise<boolean> {
  const exists = await redis.exists(`${CHAT_ROOM_PREFIX}${roomId}`);
  return exists === 1;
}

/**
 * Get all room IDs from the registry set
 */
export async function getAllRoomIds(): Promise<string[]> {
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
    }
  }

  return roomIds;
}

/**
 * Register a room ID in the registry set
 */
export async function registerRoom(roomId: string): Promise<void> {
  await redis.sadd(CHAT_ROOMS_SET, roomId);
}

/**
 * Unregister a room ID from the registry set
 */
export async function unregisterRoom(roomId: string): Promise<void> {
  await redis.srem(CHAT_ROOMS_SET, roomId);
}

// ============================================================================
// User Operations
// ============================================================================

/**
 * Get a user by username
 */
export async function getUser(username: string): Promise<User | null> {
  const data = await redis.get(`${CHAT_USERS_PREFIX}${username}`);
  return parseUserData(data);
}

/**
 * Set a user (user records persist forever)
 */
export async function setUser(username: string, user: User): Promise<void> {
  await redis.set(`${CHAT_USERS_PREFIX}${username}`, JSON.stringify(user));
}

/**
 * Create a user atomically if they don't exist
 * Returns true if created, false if already exists
 */
export async function createUserIfNotExists(
  username: string,
  user: User
): Promise<boolean> {
  const created = await redis.setnx(
    `${CHAT_USERS_PREFIX}${username}`,
    JSON.stringify(user)
  );
  return created === 1;
}

/**
 * Check if a user exists
 */
export async function userExists(username: string): Promise<boolean> {
  const exists = await redis.exists(`${CHAT_USERS_PREFIX}${username}`);
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
  const messagesKey = `${CHAT_MESSAGES_PREFIX}${roomId}`;
  const rawMessages = await redis.lrange(messagesKey, 0, limit - 1);

  return rawMessages
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
  const messagesKey = `${CHAT_MESSAGES_PREFIX}${roomId}`;
  await redis.lpush(messagesKey, JSON.stringify(message));
  // Keep only the latest 100 messages per room
  await redis.ltrim(messagesKey, 0, 99);
}

/**
 * Delete a message from a room
 */
export async function deleteMessage(
  roomId: string,
  messageId: string
): Promise<boolean> {
  const listKey = `${CHAT_MESSAGES_PREFIX}${roomId}`;
  const messagesRaw = await redis.lrange(listKey, 0, -1);

  let targetRaw: string | null = null;
  for (const raw of messagesRaw) {
    const obj = parseMessageData(raw);
    if (obj && obj.id === messageId) {
      targetRaw = typeof raw === "string" ? raw : JSON.stringify(raw);
      break;
    }
  }

  if (!targetRaw) return false;

  await redis.lrem(listKey, 1, targetRaw);
  return true;
}

/**
 * Delete all messages for a room
 */
export async function deleteAllMessages(roomId: string): Promise<void> {
  await redis.del(`${CHAT_MESSAGES_PREFIX}${roomId}`);
}

/**
 * Get the last message in a room (for duplicate detection)
 */
export async function getLastMessage(roomId: string): Promise<Message | null> {
  const messagesKey = `${CHAT_MESSAGES_PREFIX}${roomId}`;
  const lastMessages = await redis.lrange(messagesKey, 0, 0);
  if (lastMessages.length === 0) return null;
  return parseMessageData(lastMessages[0]);
}

