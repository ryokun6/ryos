import { apiRequest } from "@/api/core";

export interface LoginResponse {
  username: string;
}

export interface VerifyTokenResponse {
  valid: boolean;
  username?: string;
  expired?: boolean;
}

export interface RegisterResponse {
  user: {
    username: string;
    hasPassword?: boolean;
    createdAt?: number;
  };
}

export interface SessionResponse {
  authenticated: boolean;
  username?: string;
  expired?: boolean;
}

export interface PasswordStatusResponse {
  hasPassword: boolean;
  username: string;
}

export interface PasswordSetResponse {
  success: boolean;
}

export interface LogoutAllDevicesResponse {
  success: boolean;
  message: string;
  deletedCount: number;
}

export async function loginWithPassword(params: {
  username: string;
  password: string;
}): Promise<LoginResponse> {
  return apiRequest<LoginResponse, {
    username: string;
    password: string;
  }>({
    path: "/api/auth/login",
    method: "POST",
    body: {
      username: params.username,
      password: params.password,
    },
  });
}

export async function verifyAuthToken(params: {
  username: string;
  token: string;
}): Promise<VerifyTokenResponse> {
  return apiRequest<VerifyTokenResponse, { username: string; token: string }>({
    path: "/api/auth/token/verify",
    method: "POST",
    body: {
      username: params.username,
      token: params.token,
    },
  });
}

export async function registerUser(params: {
  username: string;
  password: string;
}): Promise<RegisterResponse> {
  return apiRequest<RegisterResponse, { username: string; password: string }>({
    path: "/api/auth/register",
    method: "POST",
    body: params,
  });
}

export async function logoutUser(): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    path: "/api/auth/logout",
    method: "POST",
  });
}

export async function getSession(params?: {
  legacyToken?: string | null;
  username?: string;
}): Promise<SessionResponse> {
  const headers = new Headers();

  if (params?.legacyToken) {
    headers.set("Authorization", `Bearer ${params.legacyToken}`);
  }
  if (params?.username) {
    headers.set("X-Username", params.username);
  }

  return apiRequest<SessionResponse>({
    path: "/api/auth/session",
    method: "GET",
    headers,
    retry: { maxAttempts: 2, initialDelayMs: 500 },
    timeout: 10000,
  });
}

export async function checkPassword(): Promise<PasswordStatusResponse> {
  return apiRequest<PasswordStatusResponse>({
    path: "/api/auth/password/check",
    method: "GET",
  });
}

export async function setPassword(params: {
  password: string;
}): Promise<PasswordSetResponse> {
  return apiRequest<PasswordSetResponse, { password: string }>({
    path: "/api/auth/password/set",
    method: "POST",
    body: { password: params.password },
  });
}

export async function logoutAllDevices(): Promise<LogoutAllDevicesResponse> {
  return apiRequest<LogoutAllDevicesResponse>({
    path: "/api/auth/logout-all",
    method: "POST",
  });
}
