/**
 * Pusher client and broadcast helpers for chat-rooms API
 * 
 * Performance optimizations:
 * - Uses batch realtime fan-out for multi-channel broadcasts
 * - Skips redundant fan-out for public rooms
 * - Caches room data to avoid repeated Redis lookups
 */

import {
  triggerRealtimeBatch,
  triggerRealtimeEvent,
} from "../../_utils/realtime.js";
import { refreshRoomUserCount } from "./_presence.js";
import type { Room, Message } from "./_types.js";
import {
  CHATS_PUBLIC_CHANNEL,
  getChatRoomChannelName,
  getChatsUserChannelName,
  sanitizeRealtimeChannelSegment,
} from "../../../src/shared/constants/realtime.js";
import { getRoom } from "./_redis.js";

interface BatchEvent {
  channel: string;
  name: string;
  data: unknown;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Sanitize strings for Pusher channel names
 */
export function sanitizeForChannel(name: string): string {
  return sanitizeRealtimeChannelSegment(name);
}

function getPrivateChatsChannelName(username: string): string {
  return getChatsUserChannelName(username);
}

/**
 * Filter visible rooms for a given username (or public if null)
 */
export function filterRoomsForUser(
  rooms: Room[],
  username: string | null
): Room[] {
  if (!username) {
    return rooms.filter(
      (room) => !room.type || room.type === "public" || room.type === "irc"
    );
  }
  const lower = username.toLowerCase();
  return rooms.filter((room) => {
    if (!room.type || room.type === "public" || room.type === "irc") return true;
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
    const roomObj = await getRoom(roomId);
    if (!roomObj) return;

    const count = await refreshRoomUserCount(roomId);
    const room: Room = { ...roomObj, userCount: count };

    if (!room.type || room.type === "public" || room.type === "irc") {
      await triggerRealtimeEvent(CHATS_PUBLIC_CHANNEL, "room-updated", { room });
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
    if (!room.type || room.type === "public" || room.type === "irc") {
      await triggerRealtimeEvent(CHATS_PUBLIC_CHANNEL, "room-created", { room });
    } else if (Array.isArray(room.members) && room.members.length > 0) {
      // Use batch trigger for multiple members
      const events: BatchEvent[] = room.members.map((m) => ({
        channel: getPrivateChatsChannelName(m),
        name: "room-created",
        data: { room },
      }));
      await triggerRealtimeBatch(events);
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
    if (!type || type === "public" || type === "irc") {
      await triggerRealtimeEvent(CHATS_PUBLIC_CHANNEL, "room-deleted", { roomId });
    } else if (Array.isArray(members) && members.length > 0) {
      // Use batch trigger for multiple members
      const events: BatchEvent[] = members.map((m) => ({
        channel: getPrivateChatsChannelName(m),
        name: "room-deleted",
        data: { roomId },
      }));
      await triggerRealtimeBatch(events);
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
    // Resolve room so private rooms broadcast on the authorized channel and
    // public/IRC rooms broadcast on the open channel.
    const room = roomData ?? (await getRoom(roomId));
    const payload = { roomId, message };
    if (room?.type === "private" && Array.isArray(room.members)) {
      await fanOutToPrivateMembersBatched(room.members, "room-message", payload);
    } else {
      await triggerRealtimeEvent(
        getChatRoomChannelName(roomId, room?.type),
        "room-message",
        payload
      );
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
    const room = roomData ?? (await getRoom(roomId));
    const payload = { roomId, messageId };
    if (room?.type === "private" && Array.isArray(room.members)) {
      await fanOutToPrivateMembersBatched(room.members, "message-deleted", payload);
    } else {
      await triggerRealtimeEvent(
        getChatRoomChannelName(roomId, room?.type),
        "message-deleted",
        payload
      );
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
    channel: getPrivateChatsChannelName(member),
    name: eventName,
    data: payload,
  }));
  
  await triggerRealtimeBatch(events);
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
    const roomObj = await getRoom(roomId);
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
 * Broadcast presence update (join/leave) to a room channel.
 * Clients can bind to "presence-update" on `room-{roomId}` to get live
 * user-count and join/leave events without refetching the room list.
 */
export async function broadcastPresenceUpdate(
  roomId: string,
  payload: { username: string; action: "joined" | "left"; userCount: number },
  roomType?: string | null
): Promise<void> {
  try {
    // Resolve type when not provided so private-room presence stays on the
    // authorized channel.
    const room = await getRoom(roomId);
    const type = roomType ?? room?.type;
    if (type === "private" && room?.members) {
      await fanOutToPrivateMembersBatched(room.members, "presence-update", {
        roomId,
        ...payload,
      });
    } else {
      await triggerRealtimeEvent(
        getChatRoomChannelName(roomId, type),
        "presence-update",
        payload
      );
    }
  } catch (err) {
    console.error("[broadcastPresenceUpdate] Failed:", err);
  }
}

/**
 * Broadcast a typing indicator event to a room channel.
 * Clients bind to "user-typing" on `room-{roomId}`.
 */
export async function broadcastTypingIndicator(
  roomId: string,
  payload: { username: string; isTyping: boolean },
  roomType?: string | null
): Promise<void> {
  try {
    const room = await getRoom(roomId);
    const type = roomType ?? room?.type;
    if (type === "private" && room?.members) {
      await fanOutToPrivateMembersBatched(room.members, "user-typing", {
        roomId,
        ...payload,
      });
    } else {
      await triggerRealtimeEvent(
        getChatRoomChannelName(roomId, type),
        "user-typing",
        payload
      );
    }
  } catch (err) {
    console.error("[broadcastTypingIndicator] Failed:", err);
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
      const userRooms = filterRoomsForUser(rooms, username);
      return {
        channel: getPrivateChatsChannelName(username),
        name: "rooms-updated",
        data: { rooms: userRooms },
      };
    });

    await triggerRealtimeBatch(events);
  } catch (err) {
    console.error("[broadcastToSpecificUsers] Failed to broadcast:", err);
  }
}

