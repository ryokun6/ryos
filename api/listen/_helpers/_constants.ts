/**
 * Constants for listen-together sessions
 * Redis key prefixes, TTLs, and configuration values
 */

// ============================================================================
// Redis Key Prefixes
// ============================================================================

export const LISTEN_SESSION_PREFIX = "listen:session:";
export const LISTEN_SESSIONS_SET = "listen:sessions";

// ============================================================================
// Session Configuration
// ============================================================================

// Session TTL - auto-expire after 4 hours of inactivity
export const LISTEN_SESSION_TTL_SECONDS = 4 * 60 * 60;

// Maximum listeners per session (including host)
export const LISTEN_SESSION_MAX_USERS = 10;

// ============================================================================
// API Configuration
// ============================================================================

export const runtime = "nodejs";
export const maxDuration = 15;
