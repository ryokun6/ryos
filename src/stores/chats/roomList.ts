import type { ChatRoom } from "@/types/chat";

export const sortChatRoomsForUi = (rooms: ChatRoom[]): ChatRoom[] =>
  [...rooms].sort((a, b) => {
    const aOrder = a.type === "private" ? 1 : 0;
    const bOrder = b.type === "private" ? 1 : 0;
    if (aOrder !== bOrder) return aOrder - bOrder;

    const aName = (a.name || "").toLowerCase();
    const bName = (b.name || "").toLowerCase();
    if (aName !== bName) return aName.localeCompare(bName);

    return a.id.localeCompare(b.id);
  });

export const areChatRoomListsEqual = (
  currentRooms: ChatRoom[],
  nextRooms: ChatRoom[]
): boolean => JSON.stringify(currentRooms) === JSON.stringify(nextRooms);
