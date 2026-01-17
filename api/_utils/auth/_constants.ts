/**
 * Auth module constants
 */

// ============================================================================
// Token Constants
// ============================================================================

/** Token key prefix in Redis */
export const AUTH_TOKEN_PREFIX = "chat:token:";

/** Token length in bytes (32 bytes = 256 bits = 64 hex chars) */
export const TOKEN_LENGTH = 32;

/** User/token TTL in seconds (90 days) */
export const USER_TTL_SECONDS = 90 * 24 * 60 * 60;

/** User expiration time for Redis SET command */
export const USER_EXPIRATION_TIME = USER_TTL_SECONDS;

/** Token grace period in seconds (30 days) */
export const TOKEN_GRACE_PERIOD = 30 * 24 * 60 * 60;

// ============================================================================
// Password Constants
// ============================================================================

/** Password hash key prefix in Redis */
export const PASSWORD_HASH_PREFIX = "chat:password:";

/** Minimum password length */
export const PASSWORD_MIN_LENGTH = 8;

/** Maximum password length (prevents bcrypt DoS) */
export const PASSWORD_MAX_LENGTH = 128;

/** Bcrypt rounds for password hashing */
export const PASSWORD_BCRYPT_ROUNDS = 10;

// ============================================================================
// Rate Limiting Constants
// ============================================================================

/** Rate limit key prefix */
export const RATE_LIMIT_PREFIX = "rl:";

/** Rate limit block key prefix */
export const RATE_LIMIT_BLOCK_PREFIX = "rl:block:";

/** Rate limit window in seconds (1 minute) */
export const RATE_LIMIT_WINDOW_SECONDS = 60;

/** Max attempts per rate limit window */
export const RATE_LIMIT_ATTEMPTS = 10;

/** Block TTL for createUser abuse (24 hours) */
export const CREATE_USER_BLOCK_TTL_SECONDS = 24 * 60 * 60;

// ============================================================================
// User Constants
// ============================================================================

/** Users key prefix in Redis */
export const CHAT_USERS_PREFIX = "chat:users:";
