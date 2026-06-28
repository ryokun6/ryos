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
import { ROOM_MESSAGE_HISTORY_LIMIT } from "./_constants.js";
import {
  createStoredUserRecordIfAbsent,
  getStoredUserRecord,
  patchStoredUserRecord,
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
 * Set a user (user records persist forever)
 */
export async function setUser(
  username: string,
  user: User,
  client: Redis = createRedisClient()
): Promise<void> {
  const profileFields = {
    username: user.username,
    lastActive: user.lastActive,
  };
  const updated = await patchStoredUserRecord(client, username, profileFields);
  if (!updated) {
    await createStoredUserRecordIfAbsent(client, username, profileFields);
  }
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
  return createStoredUserRecordIfAbsent(client, username, user);
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
  limit: number = ROOM_MESSAGE_HISTORY_LIMIT,
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
  await client.ltrim(messagesKey, 0, ROOM_MESSAGE_HISTORY_LIMIT - 1);
}

const MESSAGE_IDEMPOTENCY_PENDING_TTL_SECONDS = 15;
const MESSAGE_IDEMPOTENCY_RESULT_TTL_SECONDS = 24 * 60 * 60;

export interface MessageIdempotencyClaim {
  key: string;
  marker: string;
}

export type MessageIdempotencyClaimResult =
  | { status: "claimed"; claim: MessageIdempotencyClaim }
  | { status: "existing"; message: Message }
  | { status: "pending" };

function parseIdempotentMessage(data: unknown): Message | null {
  const message = parseMessageData(data);
  return message &&
    typeof message.id === "string" &&
    typeof message.roomId === "string" &&
    typeof message.username === "string"
    ? message
    : null;
}

export async function claimMessageIdempotency(
  roomId: string,
  username: string,
  clientId: string,
  client: Redis = createRedisClient()
): Promise<MessageIdempotencyClaimResult> {
  const key = redisKeys.chat.messageIdempotency(roomId, username, clientId);
  const marker = JSON.stringify({ pending: generateId() });
  const acquired = await client.set(key, marker, {
    ex: MESSAGE_IDEMPOTENCY_PENDING_TTL_SECONDS,
    nx: true,
  });
  if (acquired) {
    return { status: "claimed", claim: { key, marker } };
  }

  const current = await client.get(key);
  const existing = parseIdempotentMessage(current);
  return existing
    ? { status: "existing", message: existing }
    : { status: "pending" };
}

export async function waitForIdempotentMessage(
  roomId: string,
  username: string,
  clientId: string,
  client: Redis = createRedisClient()
): Promise<Message | null> {
  const key = redisKeys.chat.messageIdempotency(roomId, username, clientId);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const current = await client.get(key);
    const message = parseIdempotentMessage(current);
    if (message) return message;
    if (current === null) return null;
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  return null;
}

export async function commitIdempotentMessage(
  roomId: string,
  message: Message,
  claim: MessageIdempotencyClaim,
  client: Redis = createRedisClient()
): Promise<{ created: boolean; message: Message }> {
  const serialized = JSON.stringify(message);
  const result = await client.eval<[number, string]>(
    `
      local current = redis.call("GET", KEYS[2])
      if current and current ~= ARGV[1] then
        return {0, current}
      end
      if current ~= ARGV[1] then
        return {-1, ""}
      end
      redis.call("LPUSH", KEYS[1], ARGV[2])
      redis.call("LTRIM", KEYS[1], 0, tonumber(ARGV[3]) - 1)
      redis.call("SET", KEYS[2], ARGV[2], "EX", tonumber(ARGV[4]))
      return {1, ARGV[2]}
    `,
    [redisKeys.chat.roomMessages(roomId), claim.key],
    [
      claim.marker,
      serialized,
      ROOM_MESSAGE_HISTORY_LIMIT,
      MESSAGE_IDEMPOTENCY_RESULT_TTL_SECONDS,
    ]
  );
  const canonical = parseIdempotentMessage(result[1]);
  if (!canonical) {
    throw new Error("Message idempotency claim expired before commit");
  }
  return { created: result[0] === 1, message: canonical };
}

export async function releaseMessageIdempotencyClaim(
  claim: MessageIdempotencyClaim,
  client: Redis = createRedisClient()
): Promise<void> {
  await client.eval(
    `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      end
      return 0
    `,
    [claim.key],
    [claim.marker]
  );
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
