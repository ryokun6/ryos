/**
 * Constants for Live Desktop sessions.
 */

// Redis key prefixes
export const LIVE_SESSION_PREFIX = "live:session:";
export const LIVE_SESSIONS_SET = "live:sessions";

// Session configuration
export const LIVE_SESSION_TTL_SECONDS = 4 * 60 * 60; // 4 hours inactivity
export const LIVE_SESSION_MAX_USERS = 10;
export const LIVE_SESSION_STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

// API configuration
export const runtime = "nodejs";
export const maxDuration = 15;
