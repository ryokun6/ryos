export type RoomType = "public" | "private" | "irc";

export interface BaseRoom {
  id: string;
  name: string;
  createdAt: number;
  userCount: number;
  members?: string[];
  ircHost?: string;
  ircPort?: number;
  ircTls?: boolean;
  ircChannel?: string;
  ircServerLabel?: string;
}

export interface Room extends BaseRoom {
  type: RoomType;
}

export interface RoomSummary extends BaseRoom {
  type?: RoomType;
}

export interface ChatRoom extends RoomSummary {
  users?: string[];
}

export interface RoomWithUsers extends Room {
  users: string[];
}

export interface Message {
  id: string;
  roomId: string;
  username: string;
  content: string;
  timestamp: number;
}

export interface RoomMessage extends Message {
  clientId?: string;
}

export type ChatMessage = RoomMessage;

export interface BulkMessagesResult<TMessage extends Message = Message> {
  messagesMap: Record<string, TMessage[]>;
  validRoomIds: string[];
  invalidRoomIds: string[];
}

export interface User {
  username: string;
  lastActive: number;
}

export interface CreateRoomData {
  name?: string;
  type?: RoomType;
  members?: string[];
  ircServerId?: string;
  ircHost?: string;
  ircPort?: number;
  ircTls?: boolean;
  ircChannel?: string;
  ircServerLabel?: string;
}

export interface CreateRoomPayload extends CreateRoomData {
  type: RoomType;
}

export interface JoinLeaveRoomData {
  roomId: string;
  username: string;
}

export interface SwitchRoomData {
  previousRoomId?: string;
  nextRoomId?: string;
  username: string;
}
