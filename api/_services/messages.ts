/**
 * Message service - Chat message operations
 */

import { getRedis } from "../_lib/redis.js";
import { REDIS_KEYS } from "../_lib/constants.js";
import type { Message } from "../_lib/types.js";

// Maximum messages to keep per room
const MAX_MESSAGES_PER_ROOM = 100;

// =============================================================================
// Message ID Generation
// =============================================================================

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// =============================================================================
// Message Operations
// =============================================================================

/**
 * Get messages for a room
 */
export async function getMessages(
  roomId: string,
  limit: number = 20
): Promise<Message[]> {
  const redis = getRedis();
  const messagesKey = `${REDIS_KEYS.MESSAGES}${roomId}`;
  const rawMessages = await redis.lrange(messagesKey, 0, limit - 1);

  return rawMessages
    .map((item) => {
      if (!item) return null;
      return typeof item === "string" ? JSON.parse(item) : item;
    })
    .filter((msg): msg is Message => msg !== null);
}

/**
 * Get messages for multiple rooms
 */
export async function getBulkMessages(
  roomIds: string[],
  limitPerRoom: number = 20
): Promise<Record<string, Message[]>> {
  const redis = getRedis();
  const result: Record<string, Message[]> = {};

  // Use pipeline for efficiency
  const pipeline = redis.pipeline();
  for (const roomId of roomIds) {
    pipeline.lrange(`${REDIS_KEYS.MESSAGES}${roomId}`, 0, limitPerRoom - 1);
  }
  
  const responses = await pipeline.exec();

  for (let i = 0; i < roomIds.length; i++) {
    const roomId = roomIds[i];
    const rawMessages = responses[i] as (string | Message)[] | null;
    
    if (!rawMessages) {
      result[roomId] = [];
      continue;
    }

    result[roomId] = rawMessages
      .map((item) => {
        if (!item) return null;
        return typeof item === "string" ? JSON.parse(item) : item;
      })
      .filter((msg): msg is Message => msg !== null);
  }

  return result;
}

/**
 * Add a message to a room
 */
export async function addMessage(
  roomId: string,
  username: string,
  content: string
): Promise<Message> {
  const redis = getRedis();
  const messagesKey = `${REDIS_KEYS.MESSAGES}${roomId}`;
  
  const message: Message = {
    id: generateMessageId(),
    roomId,
    username: username.toLowerCase(),
    content,
    timestamp: Date.now(),
  };

  await redis.lpush(messagesKey, JSON.stringify(message));
  await redis.ltrim(messagesKey, 0, MAX_MESSAGES_PER_ROOM - 1);

  return message;
}

/**
 * Delete a message
 */
export async function deleteMessage(
  roomId: string,
  messageId: string
): Promise<boolean> {
  const redis = getRedis();
  const listKey = `${REDIS_KEYS.MESSAGES}${roomId}`;
  const messagesRaw = await redis.lrange(listKey, 0, -1);

  let targetRaw: string | null = null;
  for (const raw of messagesRaw) {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
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
 * Delete all messages in a room
 */
export async function deleteAllMessages(roomId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`${REDIS_KEYS.MESSAGES}${roomId}`);
}

/**
 * Get the last message in a room (for duplicate detection)
 */
export async function getLastMessage(roomId: string): Promise<Message | null> {
  const redis = getRedis();
  const messagesKey = `${REDIS_KEYS.MESSAGES}${roomId}`;
  const lastMessages = await redis.lrange(messagesKey, 0, 0);
  
  if (lastMessages.length === 0) return null;
  
  const item = lastMessages[0];
  if (!item) return null;
  
  return typeof item === "string" ? JSON.parse(item) : item;
}

/**
 * Check for duplicate message (same user, same content, within time window)
 */
export async function isDuplicateMessage(
  roomId: string,
  username: string,
  content: string,
  windowMs: number = 5000
): Promise<boolean> {
  const lastMessage = await getLastMessage(roomId);
  if (!lastMessage) return false;

  const timeDiff = Date.now() - lastMessage.timestamp;
  return (
    timeDiff < windowMs &&
    lastMessage.username === username.toLowerCase() &&
    lastMessage.content === content
  );
}
