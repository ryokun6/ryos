import type { ChatMessage, ChatRoom } from "@/types/chat";
import { getPrivateRoomDisplayName } from "@/utils/chat";

type RoomMessagesById = Record<string, ChatMessage[] | undefined>;

interface SortPrivateRoomsForSidebarOptions {
  username?: string | null;
  onlineUsers?: string[];
  roomMessages?: RoomMessagesById;
}

const normalizeUsername = (value?: string | null): string =>
  value?.trim().toLowerCase() ?? "";

export function isPrivateRoomOnline(
  room: ChatRoom,
  username?: string | null,
  onlineUsers: Iterable<string> = []
): boolean {
  if (room.type !== "private" || !Array.isArray(room.members)) {
    return false;
  }

  const self = normalizeUsername(username);
  const onlineUsersSet = new Set(
    Array.from(onlineUsers, (user) => normalizeUsername(user)).filter(Boolean)
  );

  return room.members.some((member) => {
    const normalizedMember = normalizeUsername(member);
    return normalizedMember !== self && onlineUsersSet.has(normalizedMember);
  });
}

function getRoomRecentActivityAt(
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

export function sortPrivateRoomsForSidebar(
  rooms: ChatRoom[],
  {
    username = null,
    onlineUsers = [],
    roomMessages = {},
  }: SortPrivateRoomsForSidebarOptions = {}
): ChatRoom[] {
  return [...rooms].sort((a, b) => {
    const aOnline = isPrivateRoomOnline(a, username, onlineUsers);
    const bOnline = isPrivateRoomOnline(b, username, onlineUsers);

    if (aOnline !== bOnline) {
      return aOnline ? -1 : 1;
    }

    const aRecentAt = getRoomRecentActivityAt(a, roomMessages);
    const bRecentAt = getRoomRecentActivityAt(b, roomMessages);
    if (aRecentAt !== bRecentAt) {
      return bRecentAt - aRecentAt;
    }

    const aDisplayName = getPrivateRoomDisplayName(a, username);
    const bDisplayName = getPrivateRoomDisplayName(b, username);
    const displayNameComparison = aDisplayName.localeCompare(bDisplayName);
    return displayNameComparison || a.id.localeCompare(b.id);
  });
}
