import { apiRequest, type ApiAuthContext } from "@/api/core";

export interface LoginResponse {
  token: string;
  username: string;
}

export interface VerifyTokenResponse {
  valid: boolean;
  username?: string;
  expired?: boolean;
}

export interface RegisterResponse {
  token: string;
  user: {
    username: string;
    hasPassword: boolean;
    createdAt: number;
  };
}

export async function loginWithPassword(params: {
  username: string;
  password: string;
  oldToken?: string | null;
}): Promise<LoginResponse> {
  return apiRequest<LoginResponse, {
    username: string;
    password: string;
    oldToken?: string;
  }>({
    path: "/api/auth/login",
    method: "POST",
    body: {
      username: params.username,
      password: params.password,
      ...(params.oldToken ? { oldToken: params.oldToken } : {}),
    },
  });
}

export async function verifyAuthToken(params: {
  username: string;
  token: string;
}): Promise<VerifyTokenResponse> {
  return apiRequest<VerifyTokenResponse>({
    path: "/api/auth/token/verify",
    method: "POST",
    auth: {
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

export async function logoutUser(auth: ApiAuthContext): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    path: "/api/auth/logout",
    method: "POST",
    auth,
  });
}

