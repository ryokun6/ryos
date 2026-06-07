export type RoomType = "public" | "private" | "irc";

export interface ChatRoom {
  id: string;
  name: string;
  type?: RoomType;
  createdAt: number;
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

export type ApiChatMessage = Omit<ChatMessage, "clientId">;

export interface ChatUser {
  username: string;
  lastActive: number;
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
