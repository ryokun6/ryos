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
}

export interface RegisterResponse {
  user: {
    username: string;
    hasPassword?: boolean;
    createdAt?: number;
  };
}
