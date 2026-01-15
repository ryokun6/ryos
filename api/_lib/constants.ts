/**
 * Shared constants for API routes
 */

// =============================================================================
// Redis Key Prefixes
// =============================================================================

export const REDIS_KEYS = {
  // Users
  USER: "chat:users:",
  PASSWORD_HASH: "chat:password:",
  
  // Auth tokens
  AUTH_TOKEN: "chat:token:",
  AUTH_TOKEN_USER: "chat:token:user:",
  AUTH_TOKEN_LAST: "chat:token:last:",
  
  // Rooms
  ROOM: "chat:room:",
  ROOMS_SET: "chat:rooms",
  ROOM_USERS: "chat:room:users:",
  ROOM_PRESENCE: "chat:presence:",
  ROOM_PRESENCE_ZSET: "chat:presencez:",
  
  // Messages
  MESSAGES: "chat:messages:",
  
  // Rate limiting
  RATE_LIMIT: "rl:",
  RATE_LIMIT_BLOCK: "rl:block:",
  
  // Songs
  SONG_META: "song:meta:",
  SONG_CONTENT: "song:content:",
  SONGS_SET: "songs",
  
  // Applets
  APPLET_SHARE: "applet:share:",
} as const;

// =============================================================================
// TTL Constants (in seconds)
// =============================================================================

export const TTL = {
  // User/Token expiration - 90 days
  USER_EXPIRATION: 90 * 24 * 60 * 60,
  
  // Token grace period for refresh - 30 days
  TOKEN_GRACE_PERIOD: 30 * 24 * 60 * 60,
  
  // Room presence TTL - 1 day
  ROOM_PRESENCE: 24 * 60 * 60,
  
  // Rate limit block for user creation - 24 hours
  USER_CREATE_BLOCK: 24 * 60 * 60,
} as const;

// =============================================================================
// Rate Limit Configurations
// =============================================================================

export const RATE_LIMITS = {
  // Auth actions
  AUTH: {
    WINDOW_SECONDS: 60,
    MAX_ATTEMPTS: 10,
  },
  
  // Chat messages (burst and sustained)
  CHAT_MESSAGE: {
    BURST_WINDOW: 10,
    BURST_LIMIT: 3,
    SUSTAINED_WINDOW: 60,
    SUSTAINED_LIMIT: 20,
    MIN_INTERVAL: 2,
  },
  
  // AI Chat
  AI_CHAT: {
    AUTH_LIMIT: 15,
    AUTH_WINDOW: 5 * 60 * 60, // 5 hours
    ANON_LIMIT: 3,
    ANON_WINDOW: 24 * 60 * 60, // 24 hours
  },
  
  // Applet AI
  APPLET_AI: {
    TEXT_AUTH_LIMIT: 50,
    TEXT_ANON_LIMIT: 15,
    IMAGE_AUTH_LIMIT: 12,
    IMAGE_ANON_LIMIT: 1,
    WINDOW: 60 * 60, // 1 hour
  },
  
  // Speech
  SPEECH: {
    BURST_LIMIT: 10,
    BURST_WINDOW: 60,
    DAILY_LIMIT: 50,
    DAILY_WINDOW: 24 * 60 * 60,
  },
} as const;

// =============================================================================
// Validation Constants
// =============================================================================

export const VALIDATION = {
  USERNAME: {
    MIN_LENGTH: 3,
    MAX_LENGTH: 30,
    // 3-30 chars, start with letter, letters/numbers, optional single hyphen/underscore between alphanumerics
    REGEX: /^[a-z](?:[a-z0-9]|[-_](?=[a-z0-9])){2,29}$/i,
  },
  
  PASSWORD: {
    MIN_LENGTH: 8,
    MAX_LENGTH: 128,
    BCRYPT_ROUNDS: 10,
  },
  
  ROOM_ID: {
    REGEX: /^[a-z0-9]+$/i,
  },
  
  MESSAGE: {
    MAX_LENGTH: 1000,
  },
} as const;

// =============================================================================
// API Configuration
// =============================================================================

export const API_CONFIG = {
  // Default runtime for API routes
  DEFAULT_RUNTIME: "nodejs" as const,
  
  // Edge runtime for performance-critical routes
  EDGE_RUNTIME: "edge" as const,
  
  // Default max duration
  DEFAULT_MAX_DURATION: 15,
  
  // Extended max duration for AI routes
  AI_MAX_DURATION: 60,
  
  // Streaming routes max duration
  STREAMING_MAX_DURATION: 80,
} as const;

// =============================================================================
// Admin
// =============================================================================

export const ADMIN_USERNAME = "ryo";
