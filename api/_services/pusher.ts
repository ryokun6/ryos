/**
 * Pusher service - Real-time broadcast helpers
 */

import Pusher from "pusher";
import type { Room, Message } from "../_lib/types.js";

// =============================================================================
// Pusher Client (lazy initialization)
// =============================================================================

let pusherInstance: Pusher | null = null;

function getPusher(): Pusher {
  if (!pusherInstance) {
    pusherInstance = new Pusher({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.PUSHER_KEY!,
      secret: process.env.PUSHER_SECRET!,
      cluster: process.env.PUSHER_CLUSTER!,
      useTLS: true,
    });
  }
  return pusherInstance;
}

// =============================================================================
// Batch Trigger Helper
// =============================================================================

interface BatchEvent {
  channel: string;
  name: string;
  data: unknown;
}

/**
 * Trigger multiple events in batches (Pusher limit: 10 per request)
 */
async function triggerBatched(events: BatchEvent[]): Promise<void> {
  if (events.length === 0) return;
  
  const pusher = getPusher();
  const BATCH_SIZE = 10;
  const batches: BatchEvent[][] = [];
  
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    batches.push(events.slice(i, i + BATCH_SIZE));
  }
  
  await Promise.all(
    batches.map((batch) => pusher.triggerBatch(batch))
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Sanitize string for Pusher channel names
 */
export function sanitizeForChannel(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-.]/g, "_");
}

// =============================================================================
// Room Broadcasts
// =============================================================================

/**
 * Broadcast room update
 */
export async function broadcastRoomUpdated(room: Room): Promise<void> {
  try {
    const pusher = getPusher();
    
    if (!room.type || room.type === "public") {
      await pusher.trigger("chats-public", "room-updated", { room });
    } else if (Array.isArray(room.members)) {
      const events: BatchEvent[] = room.members.map((m) => ({
        channel: `chats-${sanitizeForChannel(m)}`,
        name: "room-updated",
        data: { room },
      }));
      await triggerBatched(events);
    }
  } catch (err) {
    console.error("[broadcastRoomUpdated] Failed:", err);
  }
}

/**
 * Broadcast room creation
 */
export async function broadcastRoomCreated(room: Room): Promise<void> {
  try {
    const pusher = getPusher();
    
    if (!room.type || room.type === "public") {
      await pusher.trigger("chats-public", "room-created", { room });
    } else if (Array.isArray(room.members) && room.members.length > 0) {
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
 * Broadcast room deletion
 */
export async function broadcastRoomDeleted(
  roomId: string,
  type: string | undefined,
  members: string[] = []
): Promise<void> {
  try {
    const pusher = getPusher();
    
    if (!type || type === "public") {
      await pusher.trigger("chats-public", "room-deleted", { roomId });
    } else if (Array.isArray(members) && members.length > 0) {
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

// =============================================================================
// Message Broadcasts
// =============================================================================

/**
 * Broadcast new message
 */
export async function broadcastNewMessage(
  roomId: string,
  message: Message,
  roomData?: Room | null
): Promise<void> {
  try {
    const pusher = getPusher();
    const channelName = `room-${roomId}`;
    const payload = { roomId, message };
    
    // Always trigger the room-specific channel
    await pusher.trigger(channelName, "room-message", payload);

    // Fan out to private members if needed
    if (roomData?.type === "private" && Array.isArray(roomData.members)) {
      const events: BatchEvent[] = roomData.members.map((m) => ({
        channel: `chats-${sanitizeForChannel(m)}`,
        name: "room-message",
        data: payload,
      }));
      await triggerBatched(events);
    }
  } catch (err) {
    console.error("[broadcastNewMessage] Failed:", err);
  }
}

/**
 * Broadcast message deletion
 */
export async function broadcastMessageDeleted(
  roomId: string,
  messageId: string,
  roomData?: Room | null
): Promise<void> {
  try {
    const pusher = getPusher();
    const channelName = `room-${roomId}`;
    const payload = { roomId, messageId };
    
    await pusher.trigger(channelName, "message-deleted", payload);

    if (roomData?.type === "private" && Array.isArray(roomData.members)) {
      const events: BatchEvent[] = roomData.members.map((m) => ({
        channel: `chats-${sanitizeForChannel(m)}`,
        name: "message-deleted",
        data: payload,
      }));
      await triggerBatched(events);
    }
  } catch (err) {
    console.error("[broadcastMessageDeleted] Failed:", err);
  }
}

// =============================================================================
// User Broadcasts
// =============================================================================

/**
 * Broadcast rooms update to specific users
 */
export async function broadcastToUsers(
  usernames: string[],
  eventName: string,
  data: unknown
): Promise<void> {
  if (!usernames || usernames.length === 0) return;

  try {
    const events: BatchEvent[] = usernames.map((username) => ({
      channel: `chats-${sanitizeForChannel(username)}`,
      name: eventName,
      data,
    }));

    await triggerBatched(events);
  } catch (err) {
    console.error("[broadcastToUsers] Failed:", err);
  }
}
