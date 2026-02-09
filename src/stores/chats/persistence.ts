import type { ChatMessage } from "@/types/chat";
import { capRoomMessages } from "./roomState";

export const buildPersistedRoomMessages = (
  roomMessages: Record<string, ChatMessage[]>
): Record<string, ChatMessage[]> =>
  Object.fromEntries(
    Object.entries(roomMessages).map(([roomId, messages]) => [
      roomId,
      capRoomMessages(messages),
    ])
  );
