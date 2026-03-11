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
