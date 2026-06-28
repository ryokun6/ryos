export type RoomType = "public" | "private" | "irc";

export const ROOM_MESSAGE_HISTORY_LIMIT = 100;

export interface ChatRoom {
  id: string;
  name: string;
  type?: RoomType;
  createdAt: number;
  lastMessageAt?: number;
  userCount: number;
  users?: string[];
  members?: string[];
  ircHost?: string;
  ircPort?: number;
  ircTls?: boolean;
  ircChannel?: string;
  ircServerLabel?: string;
}

export interface ApiChatRoom extends Omit<ChatRoom, "type" | "users"> {
  type: RoomType;
}

export interface ChatRoomWithUsers extends ApiChatRoom {
  users: string[];
}

export interface ChatMessage {
  id: string;
  clientId?: string;
  roomId: string;
  username: string;
  content: string;
  timestamp: number;
}

export type ApiChatMessage = ChatMessage;

export interface SendRoomMessageRequest {
  content: string;
  clientId: string;
}

export interface ChatUser {
  username: string;
  lastActive: number;
}

export interface CreateRoomIrcOptions {
  ircServerId?: string;
  ircHost?: string;
  ircPort?: number;
  ircTls?: boolean;
  ircChannel?: string;
  ircServerLabel?: string;
}

export interface CreateRoomRequest extends CreateRoomIrcOptions {
  type: RoomType;
  name?: string;
  members?: string[];
}

export interface BulkMessagesResult {
  messagesMap: Record<string, ChatMessage[]>;
  validRoomIds: string[];
  invalidRoomIds: string[];
}

export function normalizeChatTimestamp(
  value: unknown,
  fallbackMs: number = Date.now()
): number {
  if (typeof value !== "string" && typeof value !== "number") {
    return fallbackMs;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : fallbackMs;
}
