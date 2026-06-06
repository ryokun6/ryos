import type { ChatRoom } from "@/types/chat";

type RoomSubscriptionSummary = Pick<ChatRoom, "id" | "type">;

export const shouldSubscribeToForegroundRoomUpdates = (
  room: RoomSubscriptionSummary,
  currentRoomId: string | null
): boolean => room.type !== "irc" || room.id === currentRoomId;

export const shouldSubscribeToBackgroundRoomUpdates = (
  room: Pick<ChatRoom, "type">
): boolean => room.type !== "irc";
