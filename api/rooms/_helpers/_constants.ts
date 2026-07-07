/**
 * Constants for chat-rooms API
 * Redis key prefixes, TTLs, and configuration values
 */

// ============================================================================
// TTL Constants (in seconds)
// ============================================================================

// Room presence TTL - after this period of inactivity, user is considered offline
export const ROOM_PRESENCE_TTL_SECONDS = 86400; // 1 day (24 hours)

// Canonical user/token TTLs live in the auth constants.
export {
  USER_EXPIRATION_TIME,
  USER_TTL_SECONDS,
  TOKEN_GRACE_PERIOD,
} from "../../_utils/auth/_constants.js";

// ============================================================================
// Chat Rate Limiting
// ============================================================================

export const CHAT_BURST_SHORT_WINDOW_SECONDS = 10;
export const CHAT_BURST_SHORT_LIMIT = 3;
export const CHAT_BURST_LONG_WINDOW_SECONDS = 60;
export const CHAT_BURST_LONG_LIMIT = 20;
export const CHAT_MIN_INTERVAL_SECONDS = 2;

// ============================================================================
// API Configuration
// ============================================================================

