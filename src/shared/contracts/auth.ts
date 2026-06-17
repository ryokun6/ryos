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

export interface AuthGeoResponse {
  city?: string;
  region?: string;
  country?: string;
  latitude?: string;
  longitude?: string;
}

export interface LoginResponse {
  username: string;
  timeZone?: string;
  geo?: AuthGeoResponse;
}

export interface RegisterResponse {
  user: {
    username: string;
    hasPassword?: boolean;
    createdAt?: number;
    timeZone?: string;
    geo?: AuthGeoResponse;
  };
}

export interface SessionResponse {
  authenticated: boolean;
  username?: string;
  expired?: boolean;
  timeZone?: string;
  geo?: AuthGeoResponse;
}
