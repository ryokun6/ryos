/**
 * Auth module - Unified authentication utilities
 * 
 * This module provides all authentication-related functionality:
 * - Token generation and management
 * - Password hashing and verification
 * - Auth validation
 * - Request auth extraction
 * 
 * Usage:
 *   import { validateAuth, extractAuth, generateAuthToken } from "../_utils/auth/index.js";
 */

// Types
export type {
  TokenInfo,
  TokenListItem,
  AuthValidationResult,
  ExtractedAuth,
  AuthenticatedUser,
  AuthErrorResponse,
  TokenResponse,
  VerifyTokenResponse,
  CheckPasswordResponse,
} from "./_types.js";

// Constants
export {
  TOKEN_LENGTH,
  USER_TTL_SECONDS,
  USER_EXPIRATION_TIME,
  TOKEN_GRACE_PERIOD,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_BCRYPT_ROUNDS,
  RATE_LIMIT_WINDOW_SECONDS,
  RATE_LIMIT_ATTEMPTS,
  CREATE_USER_BLOCK_TTL_SECONDS,
} from "./_constants.js";

// Token operations (Edge compatible)
export {
  getLastTokenKey,
  generateAuthToken,
  storeToken,
  deleteToken,
  deleteAllUserTokens,
  getUserTokens,
  storeLastValidToken,
  refreshTokenTTL,
} from "./_tokens.js";

// Password storage operations (Edge-compatible - no bcrypt)
export {
  setUserPasswordHash,
  getUserPasswordHash,
  deleteUserPasswordHash,
  userHasPassword,
} from "./_password-storage.js";

// NOTE: hashPassword and verifyPassword use bcrypt and are NOT exported here.
// Import directly from "./_password.js" in Node.js endpoints:
//   import { hashPassword, verifyPassword } from "../_utils/auth/_password.js";

// Validation (Edge compatible)
export type { ValidateAuthOptions } from "./_validate.js";
export { validateAuth } from "./_validate.js";

// Request extraction (Edge compatible)
export { extractAuth, extractAuthNormalized } from "./_extract.js";

// Stored user-record helpers (ban status, etc.)
export type { StoredUserRecord } from "./_user-record.js";
export {
  parseStoredUser,
  isUserBanned,
  normalizeUserTimeZone,
  getStoredUserRecord,
  setStoredUserRecord,
  createStoredUserRecordIfAbsent,
  createStoredUserAccount,
  patchStoredUserRecord,
  getStoredUserTimeZone,
  updateStoredUserTimeZone,
  normalizeEmail,
  isValidEmail,
  getUsernameByEmail,
  setUserEmailIndex,
  deleteUserEmailIndex,
} from "./_user-record.js";

// Account deletion (shared by self-service + admin)
export { purgeUserAccount } from "./_purge.js";
export type { PurgeAccountResult } from "./_purge.js";

// Per-username login lockout (shared by login + register)
export {
  isLoginLocked,
  recordLoginFailure,
  resetLoginFailures,
  PER_USER_FAIL_LIMIT,
  PER_USER_FAIL_WINDOW_SECONDS,
  PER_USER_LOCKOUT_SECONDS,
} from "./_login-lockout.js";
