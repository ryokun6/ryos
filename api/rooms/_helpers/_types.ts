/**
 * TypeScript types for chat-rooms API
 */

// ============================================================================
// Room / Message Types
// ============================================================================

export type {
  RoomType,
  ApiChatRoom as Room,
  ChatRoomWithUsers as RoomWithUsers,
  ApiChatMessage as Message,
} from "../../../src/shared/contracts/chat.js";

export interface BulkMessagesResult {
  messagesMap: Record<string, Message[]>;
  validRoomIds: string[];
  invalidRoomIds: string[];
}

// ============================================================================
// User Types
// ============================================================================

export type { ChatUser as User } from "../../../src/shared/contracts/chat.js";

// ============================================================================
// Request/Response Types
// ============================================================================

export interface CreateRoomData {
  name?: string;
  type?: RoomType;
  members?: string[];
  // IRC bridging metadata. Only used when `type === "irc"`.
  /** Registry id from GET /api/irc/servers — required for non-admin IRC room creation. */
  ircServerId?: string;
  ircHost?: string;
  ircPort?: number;
  ircTls?: boolean;
  ircChannel?: string;
  ircServerLabel?: string;
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

export interface SendMessageData {
  roomId: string;
  username: string;
  content: string;
}

export interface GenerateTokenData {
  username: string;
  force?: boolean;
}

export interface RefreshTokenData {
  username: string;
  oldToken: string;
}

export interface AuthenticateWithPasswordData {
  username: string;
  password: string;
  oldToken?: string;
}

export interface SetPasswordData {
  password: string;
}

export interface GenerateRyoReplyData {
  roomId: string;
  prompt: string;
  systemState?: {
    chatRoomContext?: {
      recentMessages?: string;
      mentionedMessage?: string;
    };
  };
  model?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
}

export interface RoomsResponse {
  rooms: Room[];
}

export interface RoomResponse {
  room: Room;
}

export interface MessagesResponse {
  messages: Message[];
}

export interface UserResponse {
  user: User;
  token?: string;
}

export type { TokenResponse } from "../../../src/shared/contracts/auth.js";

export interface SuccessResponse {
  success: boolean;
  message?: string;
}

export interface TokenListResponse {
  tokens: Array<{
    token: string;
    createdAt: number | string | null;
    isCurrent: boolean;
    maskedToken: string;
  }>;
  count: number;
}

export type {
  VerifyTokenResponse,
  CheckPasswordResponse,
} from "../../../src/shared/contracts/auth.js";

// ============================================================================
// Presence Types
// ============================================================================

export interface PresenceData {
  value: unknown;
  ttl: number;
}

export interface DebugPresenceResponse {
  presenceKeys: number;
  presenceData: Record<string, PresenceData>;
  rooms: Array<{
    id: string;
    name: string;
    userCount: number;
    users: string[];
  }>;
}

export interface CleanupPresenceResponse {
  success: boolean;
  roomsUpdated?: number;
  error?: string;
}

