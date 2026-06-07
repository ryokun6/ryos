import { apiRequest, apiRequestRaw } from "@/api/core";

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

export async function logoutAllDevices(): Promise<{
  success: boolean;
  message?: string;
}> {
  return apiRequest<{ success: boolean; message?: string }>({
    path: "/api/auth/logout-all",
    method: "POST",
  });
}

export async function checkUserPassword(): Promise<{
  hasPassword: boolean;
  username: string;
}> {
  return apiRequest<{ hasPassword: boolean; username: string }>({
    path: "/api/auth/password/check",
    method: "GET",
  });
}

export interface SetPasswordRequest {
  /** New password to store. */
  password: string;
  /**
   * Existing password. Required by the server when the user already has
   * a password set; omitted only for first-time setup on legacy accounts.
   */
  currentPassword?: string;
}

export async function setUserPassword(
  params: SetPasswordRequest
): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }, SetPasswordRequest>({
    path: "/api/auth/password/set",
    method: "POST",
    body: params,
  });
}

export async function restoreAuthSession(params: {
  username: string;
  legacyToken?: string | null;
}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (params.legacyToken) {
    headers.Authorization = `Bearer ${params.legacyToken}`;
    headers["X-Username"] = params.username;
  }

  return apiRequestRaw({
    path: "/api/auth/session",
    method: "GET",
    headers,
    timeout: 10000,
    retry: { maxAttempts: 2, initialDelayMs: 500 },
  });
}
