import type { ChatMessage, ChatRoom } from "@/types/chat";

type RoomMessagesById = Record<string, ChatMessage[] | undefined>;

/** Newest of a room's local messages, `lastMessageAt`, and `createdAt`. */
export function getRoomRecentActivityAt(
  room: ChatRoom,
  roomMessages: RoomMessagesById
): number {
  const newestLocalMessageAt = (roomMessages[room.id] ?? []).reduce(
    (newest, message) =>
      Number.isFinite(message.timestamp)
        ? Math.max(newest, message.timestamp)
        : newest,
    0
  );

  return Math.max(newestLocalMessageAt, room.lastMessageAt ?? 0, room.createdAt);
}

/**
 * Compact signature of per-room recent-activity timestamps used for private
 * room sidebar ordering. Selecting this string (instead of the whole
 * `roomMessages` map) keeps the sidebar from re-rendering on every message
 * content tick when the newest timestamp for each room is unchanged.
 */
export function getRoomActivitySignature(
  rooms: ChatRoom[],
  roomMessages: RoomMessagesById
): string {
  return rooms
    .map(
      (room) => `${room.id}\u001f${getRoomRecentActivityAt(room, roomMessages)}`
    )
    .join("\u001e");
}
