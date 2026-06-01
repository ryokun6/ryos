import type { ChatMessage, ChatRoom } from "@/types/chat";

type RoomActivityFields = ChatRoom & {
  updatedAt?: number;
  lastMessageAt?: number;
};

export const getLastMessageTimestampForRoom = (
  roomId: string,
  roomMessages?: Record<string, ChatMessage[]>
): number | undefined => {
  const messages = roomMessages?.[roomId];
  if (!messages?.length) return undefined;
  const last = messages[messages.length - 1];
  const timestamp = last?.timestamp;
  return typeof timestamp === "number" && Number.isFinite(timestamp)
    ? timestamp
    : undefined;
};

export const getPrivateRoomActivityTimestamp = (
  room: ChatRoom,
  roomMessages?: Record<string, ChatMessage[]>
): number => {
  const fromMessages = getLastMessageTimestampForRoom(room.id, roomMessages);
  if (fromMessages !== undefined) return fromMessages;

  const extended = room as RoomActivityFields;
  if (
    typeof extended.lastMessageAt === "number" &&
    Number.isFinite(extended.lastMessageAt)
  ) {
    return extended.lastMessageAt;
  }
  if (
    typeof extended.updatedAt === "number" &&
    Number.isFinite(extended.updatedAt)
  ) {
    return extended.updatedAt;
  }
  if (typeof room.createdAt === "number" && Number.isFinite(room.createdAt)) {
    return room.createdAt;
  }
  return 0;
};

/** Public/IRC rooms: type group, then name, then id. Private rooms: newest activity first. */
export const sortChatRooms = (
  rooms: ChatRoom[],
  roomMessages?: Record<string, ChatMessage[]>
): ChatRoom[] =>
  [...rooms].sort((a, b) => {
    const ao = a.type === "private" ? 1 : 0;
    const bo = b.type === "private" ? 1 : 0;
    if (ao !== bo) return ao - bo;

    if (a.type === "private" && b.type === "private") {
      const at = getPrivateRoomActivityTimestamp(a, roomMessages);
      const bt = getPrivateRoomActivityTimestamp(b, roomMessages);
      if (at !== bt) return bt - at;
      return a.id.localeCompare(b.id);
    }

    const an = (a.name || "").toLowerCase();
    const bn = (b.name || "").toLowerCase();
    if (an !== bn) return an.localeCompare(bn);
    return a.id.localeCompare(b.id);
  });

export const upsertChatRoom = (
  rooms: ChatRoom[],
  incomingRoom: ChatRoom
): ChatRoom[] => {
  const existingIndex = rooms.findIndex((room) => room.id === incomingRoom.id);

  if (existingIndex === -1) {
    return [...rooms, incomingRoom];
  }

  const existingRoom = rooms[existingIndex];
  const mergedRoom = { ...existingRoom, ...incomingRoom };

  if (JSON.stringify(existingRoom) === JSON.stringify(mergedRoom)) {
    return rooms;
  }

  const nextRooms = [...rooms];
  nextRooms[existingIndex] = mergedRoom;
  return nextRooms;
};

export const removeChatRoomById = (
  rooms: ChatRoom[],
  roomId: string
): ChatRoom[] => rooms.filter((room) => room.id !== roomId);
