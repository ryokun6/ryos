/**
 * API Library - Shared utilities for all API routes
 */

// Redis
export { getRedis, createRedis, Redis } from "./redis.js";

// Constants
export { REDIS_KEYS, TTL, RATE_LIMITS, VALIDATION, API_CONFIG, ADMIN_USERNAME } from "./constants.js";

// Types
export type {
  AuthContext,
  TokenInfo,
  User,
  UserProfile,
  RoomType,
  Room,
  RoomWithUsers,
  Message,
  RateLimitResult,
  RateLimitConfig,
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiResponse,
  PaginatedResponse,
  Handler,
  AuthenticatedHandler,
  LyricsSource,
  Applet,
} from "./types.js";

// Errors
export {
  ErrorCode,
  ApiError,
  unauthorized,
  invalidToken,
  tokenExpired,
  invalidCredentials,
  forbidden,
  adminRequired,
  validationError,
  invalidInput,
  missingField,
  profanityDetected,
  notFound,
  alreadyExists,
  conflict,
  rateLimitExceeded,
  blocked,
  internalError,
  serviceUnavailable,
  methodNotAllowed,
} from "./errors.js";
export type { ErrorCodeType } from "./errors.js";

// Response helpers
export {
  jsonSuccess,
  jsonPaginated,
  jsonError,
  jsonRateLimitError,
  withCors,
  corsPreflightResponse,
  streamingResponse,
  ok,
  created,
  noContent,
} from "./response.js";

// Logging
export {
  generateRequestId,
  logRequest,
  logInfo,
  logError,
  logWarn,
  logComplete,
  createLogger,
} from "./logging.js";
export type { LogFn } from "./logging.js";
