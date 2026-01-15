/**
 * Standardized error handling for API routes
 */

// =============================================================================
// Error Codes
// =============================================================================

export const ErrorCode = {
  // Authentication errors
  UNAUTHORIZED: "UNAUTHORIZED",
  INVALID_TOKEN: "INVALID_TOKEN",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  
  // Authorization errors
  FORBIDDEN: "FORBIDDEN",
  ADMIN_REQUIRED: "ADMIN_REQUIRED",
  
  // Validation errors
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_INPUT: "INVALID_INPUT",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
  PROFANITY_DETECTED: "PROFANITY_DETECTED",
  
  // Resource errors
  NOT_FOUND: "NOT_FOUND",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  CONFLICT: "CONFLICT",
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  BLOCKED: "BLOCKED",
  
  // Server errors
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  
  // Method errors
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

// =============================================================================
// API Error Class
// =============================================================================

export class ApiError extends Error {
  public readonly code: ErrorCodeType;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(
    code: ErrorCodeType,
    message: string,
    statusCode: number = 400,
    details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

// =============================================================================
// Error Factories
// =============================================================================

export function unauthorized(message = "Authentication required"): ApiError {
  return new ApiError(ErrorCode.UNAUTHORIZED, message, 401);
}

export function invalidToken(message = "Invalid authentication token"): ApiError {
  return new ApiError(ErrorCode.INVALID_TOKEN, message, 401);
}

export function tokenExpired(message = "Authentication token has expired"): ApiError {
  return new ApiError(ErrorCode.TOKEN_EXPIRED, message, 401);
}

export function invalidCredentials(message = "Invalid username or password"): ApiError {
  return new ApiError(ErrorCode.INVALID_CREDENTIALS, message, 401);
}

export function forbidden(message = "Access denied"): ApiError {
  return new ApiError(ErrorCode.FORBIDDEN, message, 403);
}

export function adminRequired(message = "Admin access required"): ApiError {
  return new ApiError(ErrorCode.ADMIN_REQUIRED, message, 403);
}

export function validationError(message: string, details?: unknown): ApiError {
  return new ApiError(ErrorCode.VALIDATION_ERROR, message, 400, details);
}

export function invalidInput(message: string, details?: unknown): ApiError {
  return new ApiError(ErrorCode.INVALID_INPUT, message, 400, details);
}

export function missingField(field: string): ApiError {
  return new ApiError(
    ErrorCode.MISSING_REQUIRED_FIELD,
    `Missing required field: ${field}`,
    400,
    { field }
  );
}

export function profanityDetected(message = "Content contains inappropriate language"): ApiError {
  return new ApiError(ErrorCode.PROFANITY_DETECTED, message, 400);
}

export function notFound(resource = "Resource"): ApiError {
  return new ApiError(ErrorCode.NOT_FOUND, `${resource} not found`, 404);
}

export function alreadyExists(resource = "Resource"): ApiError {
  return new ApiError(ErrorCode.ALREADY_EXISTS, `${resource} already exists`, 409);
}

export function conflict(message: string): ApiError {
  return new ApiError(ErrorCode.CONFLICT, message, 409);
}

export function rateLimitExceeded(
  message = "Too many requests",
  details?: { limit?: number; windowSeconds?: number; resetSeconds?: number }
): ApiError {
  return new ApiError(ErrorCode.RATE_LIMIT_EXCEEDED, message, 429, details);
}

export function blocked(message = "You have been temporarily blocked"): ApiError {
  return new ApiError(ErrorCode.BLOCKED, message, 429);
}

export function internalError(message = "Internal server error"): ApiError {
  return new ApiError(ErrorCode.INTERNAL_ERROR, message, 500);
}

export function serviceUnavailable(message = "Service temporarily unavailable"): ApiError {
  return new ApiError(ErrorCode.SERVICE_UNAVAILABLE, message, 503);
}

export function methodNotAllowed(allowed: string[]): ApiError {
  return new ApiError(
    ErrorCode.METHOD_NOT_ALLOWED,
    `Method not allowed. Allowed methods: ${allowed.join(", ")}`,
    405,
    { allowed }
  );
}
