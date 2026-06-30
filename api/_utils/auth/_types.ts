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

export type {
  AuthErrorResponse,
  TokenResponse,
  VerifyTokenResponse,
} from "../../../src/shared/contracts/auth.js";
