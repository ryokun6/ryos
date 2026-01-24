/**
 * Unified Constants for API
 * 
 * This file consolidates constants used across multiple API endpoints.
 * Domain-specific constants should stay in their respective modules.
 */

// ============================================================================
// Redis Key Prefixes
// ============================================================================

export const REDIS_PREFIXES = {
  // Auth
  authToken: "chat:token:",
  passwordHash: "chat:password:",
  
  // Users
  users: "chat:users:",
  
  // Rooms
  room: "chat:room:",
  messages: "chat:messages:",
  roomUsers: "chat:room:users:",
  roomPresence: "chat:presence:",
  roomPresenceZset: "chat:presencez:",
  roomsSet: "chat:rooms",
  
  // Rate limiting
  rateLimit: "rl:",
  rateLimitBlock: "rl:block:",
  chatBurst: "rl:chat:b:",
  
  // Applets
  appletShare: "applet:share:",
  
  // Songs
  songMeta: "song:meta:",
  songContent: "song:content:",
  songsSet: "songs",
} as const;

// ============================================================================
// TTL Constants (in seconds)
// ============================================================================

export const TTL = {
  // User/Token expiration
  user: 90 * 24 * 60 * 60,        // 90 days
  tokenGrace: 30 * 24 * 60 * 60,  // 30 days grace period
  
  // Presence
  presence: 24 * 60 * 60,         // 1 day
  
  // Rate limit block
  createUserBlock: 24 * 60 * 60,  // 24 hours
  
  // Rate limit windows
  minute: 60,
  hour: 3600,
  day: 86400,
  fiveHours: 5 * 3600,
} as const;

// ============================================================================
// Rate Limit Configurations
// ============================================================================

export const RATE_LIMIT_TIERS = {
  // Burst protection (per minute)
  burst: {
    public: { window: 60, limit: 30 },
    authenticated: { window: 60, limit: 60 },
    admin: { window: 60, limit: 120 },
  },
  
  // Hourly limits
  hourly: {
    public: { window: 3600, limit: 200 },
    authenticated: { window: 3600, limit: 500 },
  },
  
  // Daily limits
  daily: {
    public: { window: 86400, limit: 1000 },
    authenticated: { window: 86400, limit: 5000 },
  },
  
  // AI/expensive operations
  ai: {
    authenticated: { window: 5 * 3600, limit: 15 },  // 15 per 5 hours
    anonymous: { window: 86400, limit: 3 },          // 3 per day
  },
  
  // Chat/messaging
  chat: {
    shortBurst: { window: 10, limit: 3 },
    longBurst: { window: 60, limit: 20 },
    minInterval: 2,  // minimum seconds between messages
  },
} as const;

// ============================================================================
// Password Constraints
// ============================================================================

export const PASSWORD = {
  minLength: 8,
  maxLength: 128,
  bcryptRounds: 10,
} as const;

// ============================================================================
// Validation Constraints
// ============================================================================

export const VALIDATION = {
  username: {
    minLength: 3,
    maxLength: 30,
    // Regex: 3-30 chars, start with letter, alphanumeric with optional single hyphen/underscore
    regex: /^[a-z](?:[a-z0-9]|[-_](?=[a-z0-9])){2,29}$/i,
  },
  message: {
    maxLength: 1000,
  },
  roomId: {
    regex: /^[a-z0-9]+$/i,
  },
} as const;

// ============================================================================
// Token Constants
// ============================================================================

export const TOKEN = {
  length: 32,  // bytes (produces 64 hex chars)
} as const;
