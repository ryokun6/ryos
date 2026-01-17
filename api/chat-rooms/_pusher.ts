/**
 * Pusher client and broadcast helpers for chat-rooms API
 * 
 * Performance optimizations:
 * - Uses triggerBatch for multi-channel broadcasts (up to 10 events per HTTP request)
 * - Skips redundant fan-out for public rooms
 * - Caches room data to avoid repeated Redis lookups
 */

import Pusher from "pusher";
import { Redis } from "@upstash/redis";
import { parseRoomData } from "./_redis.js";
import { refreshRoomUserCount } from "./_presence.js";
import { CHAT_ROOM_PREFIX } from "./_constants.js";
import type { Room, Message } from "./_types.js";

// Create Redis client
function getRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

// ============================================================================
// Pusher Client
// ============================================================================

export const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
});

// ============================================================================
// Batch Trigger Helper
// ============================================================================

interface BatchEvent {
  channel: string;
  name: string;
  data: unknown;
}

/**
 * Trigger multiple Pusher events in batches of up to 10 (Pusher's limit)
 * This reduces HTTP requests from N to ceil(N/10)
 */
async function triggerBatched(events: BatchEvent[]): Promise<void> {
  if (events.length === 0) return;
  
  // Pusher's triggerBatch supports up to 10 events per request
  const BATCH_SIZE = 10;
  const batches: BatchEvent[][] = [];
  
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    batches.push(events.slice(i, i + BATCH_SIZE));
  }
  
  await Promise.all(
    batches.map((batch) => pusher.triggerBatch(batch))
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Sanitize strings for Pusher channel names
 */
export function sanitizeForChannel(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-.]/g, "_");
}

/**
 * Filter visible rooms for a given username (or public if null)
 */
export function filterRoomsForUser(
  rooms: Room[],
  username: string | null
): Room[] {
  if (!username) {
    return rooms.filter((room) => !room.type || room.type === "public");
  }
  const lower = username.toLowerCase();
  return rooms.filter((room) => {
    if (!room.type || room.type === "public") return true;
    if (room.type === "private" && room.members) {
      return room.members.includes(lower);
    }
    return false;
  });
}

// ============================================================================
// Broadcast Functions
// ============================================================================

/**
 * Broadcast room update to relevant channels
 */
export async function broadcastRoomUpdated(roomId: string): Promise<void> {
  try {
    const roomRaw = await getRedis().get(`${CHAT_ROOM_PREFIX}${roomId}`);
    if (!roomRaw) return;

    const roomObj = parseRoomData(roomRaw);
    if (!roomObj) return;

    const count = await refreshRoomUserCount(roomId);
    const room: Room = { ...roomObj, userCount: count };

    if (!room.type || room.type === "public") {
      await pusher.trigger("chats-public", "room-updated", { room });
    } else if (Array.isArray(room.members)) {
      await fanOutToPrivateMembers(roomId, "room-updated", { room });
    }
  } catch (err) {
    console.error("[broadcastRoomUpdated] Failed:", err);
  }
}

/**
 * Broadcast room creation to relevant channels
 * Uses batch triggers for private rooms with multiple members
 */
export async function broadcastRoomCreated(room: Room): Promise<void> {
  try {
    if (!room.type || room.type === "public") {
      await pusher.trigger("chats-public", "room-created", { room });
    } else if (Array.isArray(room.members) && room.members.length > 0) {
      // Use batch trigger for multiple members
      const events: BatchEvent[] = room.members.map((m) => ({
        channel: `chats-${sanitizeForChannel(m)}`,
        name: "room-created",
        data: { room },
      }));
      await triggerBatched(events);
    }
  } catch (err) {
    console.error("[broadcastRoomCreated] Failed:", err);
  }
}

/**
 * Broadcast room deletion to relevant channels
 * Uses batch triggers for private rooms with multiple members
 */
export async function broadcastRoomDeleted(
  roomId: string,
  type: string | undefined,
  members: string[] = []
): Promise<void> {
  try {
    if (!type || type === "public") {
      await pusher.trigger("chats-public", "room-deleted", { roomId });
    } else if (Array.isArray(members) && members.length > 0) {
      // Use batch trigger for multiple members
      const events: BatchEvent[] = members.map((m) => ({
        channel: `chats-${sanitizeForChannel(m)}`,
        name: "room-deleted",
        data: { roomId },
      }));
      await triggerBatched(events);
    }
  } catch (err) {
    console.error("[broadcastRoomDeleted] Failed:", err);
  }
}

/**
 * Broadcast new message to room channel
 * Optimized: Only fans out to private members if room is private
 */
export async function broadcastNewMessage(
  roomId: string,
  message: Message,
  roomData?: Room | null
): Promise<void> {
  try {
    const channelName = `room-${roomId}`;
    const payload = { roomId, message };
    
    // Always trigger the room-specific channel (clients subscribe to this)
    await pusher.trigger(channelName, "room-message", payload);

    // Only fan-out to private members if this is a private room
    // Pass room data if available to avoid redundant Redis lookup
    if (roomData) {
      if (roomData.type === "private" && Array.isArray(roomData.members)) {
        await fanOutToPrivateMembersBatched(roomData.members, "room-message", payload);
      }
    } else {
      // Fallback: check room type from Redis (only for private rooms)
      await fanOutToPrivateMembers(roomId, "room-message", payload);
    }
  } catch (err) {
    console.error("[broadcastNewMessage] Failed:", err);
  }
}

/**
 * Broadcast message deletion to room channel
 * Optimized: Only fans out to private members if room is private
 */
export async function broadcastMessageDeleted(
  roomId: string,
  messageId: string,
  roomData?: Room | null
): Promise<void> {
  try {
    const channelName = `room-${roomId}`;
    const payload = { roomId, messageId };
    
    await pusher.trigger(channelName, "message-deleted", payload);

    // Only fan-out to private members if this is a private room
    if (roomData) {
      if (roomData.type === "private" && Array.isArray(roomData.members)) {
        await fanOutToPrivateMembersBatched(roomData.members, "message-deleted", payload);
      }
    } else {
      await fanOutToPrivateMembers(roomId, "message-deleted", payload);
    }
  } catch (err) {
    console.error("[broadcastMessageDeleted] Failed:", err);
  }
}

/**
 * Fan out an event to each member's personal channel using batch triggers
 * This is the optimized version when members list is already available
 */
async function fanOutToPrivateMembersBatched(
  members: string[],
  eventName: string,
  payload: unknown
): Promise<void> {
  if (!members || members.length === 0) return;
  
  const events: BatchEvent[] = members.map((member) => ({
    channel: `chats-${sanitizeForChannel(member)}`,
    name: eventName,
    data: payload,
  }));
  
  await triggerBatched(events);
}

/**
 * Fan out an event to each member's personal channel for a private room
 * This version fetches room data from Redis (use fanOutToPrivateMembersBatched when you already have room data)
 */
export async function fanOutToPrivateMembers(
  roomId: string,
  eventName: string,
  payload: unknown
): Promise<void> {
  try {
    const roomRaw = await getRedis().get(`${CHAT_ROOM_PREFIX}${roomId}`);
    if (!roomRaw) return;

    const roomObj = parseRoomData(roomRaw);
    if (!roomObj) return;
    if (roomObj.type !== "private" || !Array.isArray(roomObj.members)) return;

    // Use batch trigger for efficiency
    await fanOutToPrivateMembersBatched(roomObj.members, eventName, payload);
  } catch (err) {
    console.error(
      `[fanOutToPrivateMembers] Failed to fan-out ${eventName} for room ${roomId}:`,
      err
    );
  }
}

/**
 * Broadcast rooms update to specific users only
 * Uses batch triggers for efficiency
 */
export async function broadcastToSpecificUsers(
  usernames: string[],
  rooms: Room[]
): Promise<void> {
  if (!usernames || usernames.length === 0) return;

  try {
    const events: BatchEvent[] = usernames.map((username) => {
      const safeUsername = sanitizeForChannel(username);
      const userRooms = filterRoomsForUser(rooms, username);
      return {
        channel: `chats-${safeUsername}`,
        name: "rooms-updated",
        data: { rooms: userRooms },
      };
    });

    await triggerBatched(events);
  } catch (err) {
    console.error("[broadcastToSpecificUsers] Failed to broadcast:", err);
  }
}

