/**
 * Constants for chat-rooms API
 * Redis key prefixes, TTLs, and configuration values
 */

// ============================================================================
// Redis Key Prefixes
// ============================================================================

export const CHAT_ROOM_PREFIX = "chat:room:";
export const CHAT_MESSAGES_PREFIX = "chat:messages:";
export const CHAT_USERS_PREFIX = "chat:users:";
export const CHAT_ROOM_USERS_PREFIX = "chat:room:users:";
export const CHAT_ROOM_PRESENCE_PREFIX = "chat:presence:";
export const CHAT_ROOM_PRESENCE_ZSET_PREFIX = "chat:presencez:";
export const CHAT_ROOMS_SET = "chat:rooms";

// ============================================================================
// TTL Constants (in seconds)
// ============================================================================

// Room presence TTL - after this period of inactivity, user is considered offline
export const ROOM_PRESENCE_TTL_SECONDS = 86400; // 1 day (24 hours)

// User/Token expiration time
export const USER_EXPIRATION_TIME = 7776000; // 90 days
export const USER_TTL_SECONDS = USER_EXPIRATION_TIME; // Alias for clarity

// Token grace period - allows refresh after token expires
export const TOKEN_GRACE_PERIOD = 86400 * 30; // 30 days grace period for refresh after expiry

// ============================================================================
// Chat Rate Limiting
// ============================================================================

export const CHAT_BURST_PREFIX = "rl:chat:b:";
export const CHAT_BURST_SHORT_WINDOW_SECONDS = 10;
export const CHAT_BURST_SHORT_LIMIT = 3;
export const CHAT_BURST_LONG_WINDOW_SECONDS = 60;
export const CHAT_BURST_LONG_LIMIT = 20;
export const CHAT_MIN_INTERVAL_SECONDS = 2;

// ============================================================================
// API Configuration
// ============================================================================

export const runtime = "nodejs";
export const maxDuration = 15;

