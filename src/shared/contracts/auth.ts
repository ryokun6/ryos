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
  username?: string;
  message?: string;
  expired?: boolean;
  expiredAt?: number;
}

export interface CheckPasswordResponse {
  hasPassword: boolean;
  username: string;
}

export interface LoginResponse {
  username: string;
  timeZone?: string;
}

export interface RegisterResponse {
  user: {
    username: string;
    hasPassword?: boolean;
    createdAt?: number;
    timeZone?: string;
  };
}

export interface SessionResponse {
  authenticated: boolean;
  username?: string;
  expired?: boolean;
  timeZone?: string;
  /** Account creation timestamp (ms since epoch) from the stored user profile. */
  createdAt?: number;
}

export interface RecoveryRequestResponse {
  success: boolean;
  message?: string;
}

export interface ResetPasswordResponse {
  success: boolean;
  username: string;
}

export interface EmailStatusResponse {
  hasEmail: boolean;
  /** Masked address (e.g. `a***@example.com`) or null when none set. */
  email: string | null;
  emailVerified: boolean;
  /** Whether the server has an email provider configured. */
  emailConfigured: boolean;
}

export interface EmailMutationResponse {
  success: boolean;
  email?: string;
  emailVerified?: boolean;
}

export interface DeleteAccountResponse {
  success: boolean;
}
