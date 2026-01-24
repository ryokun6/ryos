/**
 * TypeScript types for chat-rooms API
 */

// ============================================================================
// Room Types
// ============================================================================

export type RoomType = "public" | "private";

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  createdAt: number;
  userCount: number;
  members?: string[]; // Only for private rooms
}

export interface RoomWithUsers extends Room {
  users: string[];
}

// ============================================================================
// Message Types
// ============================================================================

export interface Message {
  id: string;
  roomId: string;
  username: string;
  content: string;
  timestamp: number;
}

export interface BulkMessagesResult {
  messagesMap: Record<string, Message[]>;
  validRoomIds: string[];
  invalidRoomIds: string[];
}

// ============================================================================
// User Types
// ============================================================================

export interface User {
  username: string;
  lastActive: number;
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface CreateRoomData {
  name?: string;
  type?: RoomType;
  members?: string[];
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

export interface TokenResponse {
  token: string;
  username?: string;
}

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

export interface VerifyTokenResponse {
  valid: boolean;
  username: string;
  message: string;
  expired?: boolean;
  expiredAt?: number;
}

export interface CheckPasswordResponse {
  hasPassword: boolean;
  username: string;
}

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

