/**
 * Auth module type definitions
 */

// ============================================================================
// Token Types
// ============================================================================

export interface TokenInfo {
  token: string;
  createdAt: number | string | null;
}

export interface TokenListItem extends TokenInfo {
  isCurrent: boolean;
  maskedToken: string;
}

// ============================================================================
// Auth Validation Types
// ============================================================================

export interface AuthValidationResult {
  valid: boolean;
  expired?: boolean;
  newToken?: string;
}

export interface ExtractedAuth {
  username: string | null;
  token: string | null;
}

// ============================================================================
// User Types
// ============================================================================

export interface AuthenticatedUser {
  username: string;
  token: string;
  expired?: boolean;
}

// ============================================================================
// Response Types
// ============================================================================

export interface AuthErrorResponse {
  error: string;
  message?: string;
}

export interface TokenResponse {
  token: string;
  username?: string;
}

export interface VerifyTokenResponse {
  valid: boolean;
  username: string;
  message: string;
  expired?: boolean;
}

export interface CheckPasswordResponse {
  hasPassword: boolean;
  username: string;
}
