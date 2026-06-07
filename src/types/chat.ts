import { type UIMessage } from "@ai-sdk/react";
import type { Message, Room } from "@ryos/shared/contracts/chat-rooms";

export type {
  RoomType,
  Room,
  Message,
  User,
  RoomWithUsers,
  BulkMessagesResult,
  CreateRoomData,
  JoinLeaveRoomData,
  SwitchRoomData,
  SendMessageData,
  GenerateTokenData,
  RefreshTokenData,
  AuthenticateWithPasswordData,
  SetPasswordData,
  GenerateRyoReplyData,
  ApiResponse,
  RoomsResponse,
  RoomResponse,
  MessagesResponse,
  UserResponse,
  TokenResponse,
  SuccessResponse,
  TokenListResponse,
  VerifyTokenResponse,
  CheckPasswordResponse,
  PresenceData,
  DebugPresenceResponse,
  CleanupPresenceResponse,
} from "@ryos/shared/contracts/chat-rooms";

// Message metadata for AI chat
export interface MessageMetadata extends Record<string, unknown> {
  createdAt: Date;
}

// AI chat message type with metadata
export type AIChatMessage = UIMessage<MessageMetadata>;

/** Client-side message with optional optimistic clientId */
export type ChatMessage = Message & {
  clientId?: string;
};

/** Client-side room view — type/users optional for backward compatibility */
export type ChatRoom = Omit<Room, "type"> & {
  type?: Room["type"];
  users?: string[];
};
