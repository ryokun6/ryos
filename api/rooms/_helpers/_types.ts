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
  ChatUser as User,
} from "../../../src/shared/contracts/chat.js";

export type { TokenResponse } from "../../../src/shared/contracts/auth.js";

export type { VerifyTokenResponse } from "../../../src/shared/contracts/auth.js";

