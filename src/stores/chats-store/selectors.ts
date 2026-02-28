import type { ChatMessage, ChatRoom } from "@/types/chat";
import type { ChatsStoreState } from "./types";

type AuthSlice = Pick<ChatsStoreState, "username" | "authToken">;
type RoomMessagesSlice = Pick<ChatsStoreState, "currentRoomId" | "roomMessages">;
type UnreadSlice = Pick<ChatsStoreState, "unreadCounts">;
type RoomsSlice = Pick<ChatsStoreState, "rooms" | "currentRoomId">;

export const selectIsAuthenticated = (state: AuthSlice): boolean =>
  Boolean(state.username && state.authToken);

export const selectCurrentRoomMessages = (
  state: RoomMessagesSlice
): ChatMessage[] => {
  if (!state.currentRoomId) {
    return [];
  }
  return state.roomMessages[state.currentRoomId] || [];
};

export const selectUnreadCountForRoom = (
  state: UnreadSlice,
  roomId: string | null
): number => {
  if (!roomId) {
    return 0;
  }
  return state.unreadCounts[roomId] || 0;
};

export const selectTotalUnreadCount = (state: UnreadSlice): number =>
  Object.values(state.unreadCounts).reduce((sum, count) => sum + count, 0);

export const selectHasUnreadMessages = (state: UnreadSlice): boolean =>
  selectTotalUnreadCount(state) > 0;

export const selectCurrentRoom = (state: RoomsSlice): ChatRoom | null => {
  if (!state.currentRoomId) {
    return null;
  }
  return state.rooms.find((room) => room.id === state.currentRoomId) || null;
};
