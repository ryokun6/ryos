import { apiRequest, apiRequestRaw } from "@/api/core";
import type {
  CheckPasswordResponse,
  LoginResponse,
  RegisterResponse,
  SessionResponse,
  VerifyTokenResponse,
} from "@/shared/contracts/auth";

export type {
  CheckPasswordResponse,
  LoginResponse,
  RegisterResponse,
  SessionResponse,
  VerifyTokenResponse,
} from "@/shared/contracts/auth";

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

export async function logoutUserSafe(): Promise<void> {
  try {
    await logoutUser();
  } catch {
    // Logout should always clear local state, even if the server call fails.
  }
}

export async function checkUserPassword(): Promise<CheckPasswordResponse> {
  return apiRequest<CheckPasswordResponse>({
    path: "/api/auth/password/check",
    method: "GET",
  });
}

export async function getAuthSession(): Promise<
  | { ok: true; data: SessionResponse }
  | { ok: false; status: number }
> {
  const response = await apiRequestRaw({
    path: "/api/auth/session",
    method: "GET",
    timeout: 10000,
    retry: { maxAttempts: 2, initialDelayMs: 500 },
  });

  if (!response.ok) {
    return { ok: false, status: response.status };
  }

  return { ok: true, data: (await response.json()) as SessionResponse };
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
