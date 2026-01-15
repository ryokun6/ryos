/**
 * API Middleware - Shared middleware for all API routes
 */

// CORS
export {
  getEffectiveOrigin,
  isAllowedOrigin,
  handleCorsPreflightIfNeeded,
  createCorsHandler,
  validateOrigin,
} from "./cors.js";

// Authentication
export {
  extractAuth,
  validateAuthToken,
  getAuthContext,
  withAuth,
  withAuthAndCors,
  generateToken,
  storeToken,
  deleteToken,
  deleteAllUserTokens,
  getUserTokens,
  storeLastValidToken,
  isAdmin,
} from "./auth.js";
export type { ValidateAuthOptions, AuthValidationResult, WithAuthOptions } from "./auth.js";

// Rate Limiting
export {
  getClientIp,
  makeKey,
  checkRateLimit,
  isBlocked,
  setBlock,
  checkAuthRateLimit,
  checkAIChatRateLimit,
  checkAppletAIRateLimit,
  checkSpeechRateLimit,
  checkMessageRateLimit,
  withRateLimit,
  getIdentifierFromRequest,
} from "./rate-limit.js";
export type { WithRateLimitOptions } from "./rate-limit.js";

// Validation
export {
  isProfaneUsername,
  validateUsername,
  assertValidUsername,
  validatePassword,
  assertValidPassword,
  validateRoomId,
  assertValidRoomId,
  validateMessageContent,
  escapeHTML,
  cleanProfanity,
  filterProfanityPreservingUrls,
  validateBody,
  validateQuery,
  withValidation,
} from "./validation.js";
export type { WithValidationOptions } from "./validation.js";
