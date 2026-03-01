import { apiRequest, type ApiAuthContext } from "@/api/core";

type QueryValue = string | number | boolean | null | undefined;

async function adminGet<TResponse>(
  auth: ApiAuthContext,
  action: string,
  query: Record<string, QueryValue> = {}
): Promise<TResponse> {
  return apiRequest<TResponse>({
    path: "/api/admin",
    method: "GET",
    auth,
    query: { action, ...query },
  });
}

async function adminPost<TResponse, TBody extends Record<string, unknown>>(
  auth: ApiAuthContext,
  body: TBody
): Promise<TResponse> {
  return apiRequest<TResponse, TBody>({
    path: "/api/admin",
    method: "POST",
    auth,
    body,
  });
}

export async function getAdminStats<TResponse>(
  auth: ApiAuthContext
): Promise<TResponse> {
  return adminGet<TResponse>(auth, "getStats");
}

export async function getAdminUsers<TResponse>(
  auth: ApiAuthContext
): Promise<TResponse> {
  return adminGet<TResponse>(auth, "getAllUsers");
}

export async function getAdminUserProfile<TResponse>(
  auth: ApiAuthContext,
  username: string
): Promise<TResponse> {
  return adminGet<TResponse>(auth, "getUserProfile", { username });
}

export async function getAdminUserMessages<TResponse>(
  auth: ApiAuthContext,
  username: string,
  limit?: number
): Promise<TResponse> {
  return adminGet<TResponse>(auth, "getUserMessages", { username, limit });
}

export async function getAdminUserMemories<TResponse>(
  auth: ApiAuthContext,
  username: string
): Promise<TResponse> {
  return adminGet<TResponse>(auth, "getUserMemories", { username });
}

export async function banAdminUser<TResponse>(
  auth: ApiAuthContext,
  username: string
): Promise<TResponse> {
  return adminPost<TResponse, { action: string; username: string }>(auth, {
    action: "banUser",
    username,
  });
}

export async function unbanAdminUser<TResponse>(
  auth: ApiAuthContext,
  username: string
): Promise<TResponse> {
  return adminPost<TResponse, { action: string; username: string }>(auth, {
    action: "unbanUser",
    username,
  });
}

export async function deleteAdminUser<TResponse>(
  auth: ApiAuthContext,
  username: string
): Promise<TResponse> {
  return adminPost<TResponse, { action: string; username: string }>(auth, {
    action: "deleteUser",
    username,
  });
}

export async function clearAdminUserMemories<TResponse>(
  auth: ApiAuthContext,
  username: string
): Promise<TResponse> {
  return adminPost<TResponse, { action: string; username: string }>(auth, {
    action: "clearUserMemories",
    username,
  });
}

export async function forceAdminDailyNotes<TResponse>(
  auth: ApiAuthContext
): Promise<TResponse> {
  return adminPost<TResponse, { action: string }>(auth, {
    action: "forceProcessDailyNotes",
  });
}

