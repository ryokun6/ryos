/**
 * Pusher client and broadcast helpers for chat-rooms API
 */

import Pusher from "pusher";
import { redis, parseRoomData } from "./redis.js";
import { refreshRoomUserCount } from "./presence.js";
import { CHAT_ROOM_PREFIX } from "./constants.js";
import type { Room, Message } from "./types.js";

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
    const roomRaw = await redis.get(`${CHAT_ROOM_PREFIX}${roomId}`);
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
 */
export async function broadcastRoomCreated(room: Room): Promise<void> {
  try {
    if (!room.type || room.type === "public") {
      await pusher.trigger("chats-public", "room-created", { room });
    } else if (Array.isArray(room.members)) {
      await Promise.all(
        room.members.map((m) =>
          pusher.trigger(`chats-${sanitizeForChannel(m)}`, "room-created", {
            room,
          })
        )
      );
    }
  } catch (err) {
    console.error("[broadcastRoomCreated] Failed:", err);
  }
}

/**
 * Broadcast room deletion to relevant channels
 */
export async function broadcastRoomDeleted(
  roomId: string,
  type: string | undefined,
  members: string[] = []
): Promise<void> {
  try {
    if (!type || type === "public") {
      await pusher.trigger("chats-public", "room-deleted", { roomId });
    } else if (Array.isArray(members)) {
      await Promise.all(
        members.map((m) =>
          pusher.trigger(`chats-${sanitizeForChannel(m)}`, "room-deleted", {
            roomId,
          })
        )
      );
    }
  } catch (err) {
    console.error("[broadcastRoomDeleted] Failed:", err);
  }
}

/**
 * Broadcast new message to room channel
 */
export async function broadcastNewMessage(
  roomId: string,
  message: Message
): Promise<void> {
  try {
    const channelName = `room-${roomId}`;
    await pusher.trigger(channelName, "room-message", {
      roomId,
      message,
    });

    // Fan-out to private room members as a fallback
    await fanOutToPrivateMembers(roomId, "room-message", { roomId, message });
  } catch (err) {
    console.error("[broadcastNewMessage] Failed:", err);
  }
}

/**
 * Broadcast message deletion to room channel
 */
export async function broadcastMessageDeleted(
  roomId: string,
  messageId: string
): Promise<void> {
  try {
    const channelName = `room-${roomId}`;
    await pusher.trigger(channelName, "message-deleted", {
      roomId,
      messageId,
    });

    await fanOutToPrivateMembers(roomId, "message-deleted", {
      roomId,
      messageId,
    });
  } catch (err) {
    console.error("[broadcastMessageDeleted] Failed:", err);
  }
}

/**
 * Fan out an event to each member's personal channel for a private room
 */
export async function fanOutToPrivateMembers(
  roomId: string,
  eventName: string,
  payload: unknown
): Promise<void> {
  try {
    const roomRaw = await redis.get(`${CHAT_ROOM_PREFIX}${roomId}`);
    if (!roomRaw) return;

    const roomObj = parseRoomData(roomRaw);
    if (!roomObj) return;
    if (roomObj.type !== "private" || !Array.isArray(roomObj.members)) return;

    await Promise.all(
      roomObj.members.map((member) => {
        const safe = sanitizeForChannel(member);
        return pusher.trigger(`chats-${safe}`, eventName, payload);
      })
    );
  } catch (err) {
    console.error(
      `[fanOutToPrivateMembers] Failed to fan-out ${eventName} for room ${roomId}:`,
      err
    );
  }
}

/**
 * Broadcast rooms update to specific users only
 */
export async function broadcastToSpecificUsers(
  usernames: string[],
  rooms: Room[]
): Promise<void> {
  if (!usernames || usernames.length === 0) return;

  try {
    const pushPromises = usernames.map((username) => {
      const safeUsername = sanitizeForChannel(username);
      const userRooms = filterRoomsForUser(rooms, username);
      return pusher.trigger(`chats-${safeUsername}`, "rooms-updated", {
        rooms: userRooms,
      });
    });

    await Promise.all(pushPromises);
  } catch (err) {
    console.error("[broadcastToSpecificUsers] Failed to broadcast:", err);
  }
}

