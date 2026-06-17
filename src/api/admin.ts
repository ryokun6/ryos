import { apiRequest } from "@/api/core";

type QueryValue = string | number | boolean | null | undefined;

async function adminGet<TResponse>(
  action: string,
  query: Record<string, QueryValue> = {}
): Promise<TResponse> {
  return apiRequest<TResponse>({
    path: "/api/admin",
    method: "GET",
    query: { action, ...query },
  });
}

async function adminPost<TResponse, TBody extends Record<string, unknown>>(
  body: TBody
): Promise<TResponse> {
  return apiRequest<TResponse, TBody>({
    path: "/api/admin",
    method: "POST",
    body,
  });
}

export async function getAdminStats<TResponse>(): Promise<TResponse> {
  return adminGet<TResponse>("getStats");
}

export async function getAdminServerInfo<TResponse>(): Promise<TResponse> {
  return adminGet<TResponse>("getServerInfo");
}

export async function getAdminUsers<TResponse>(): Promise<TResponse> {
  return adminGet<TResponse>("getAllUsers");
}

export async function getAdminUserProfile<TResponse>(
  username: string
): Promise<TResponse> {
  return adminGet<TResponse>("getUserProfile", { username });
}

export async function getAdminUserMessages<TResponse>(
  username: string,
  limit?: number
): Promise<TResponse> {
  return adminGet<TResponse>("getUserMessages", { username, limit });
}

export async function getAdminUserMemories<TResponse>(
  username: string
): Promise<TResponse> {
  return adminGet<TResponse>("getUserMemories", { username });
}

export async function banAdminUser<TResponse>(
  username: string,
  reason?: string
): Promise<TResponse> {
  return adminPost<
    TResponse,
    { action: string; targetUsername: string; reason?: string }
  >({
    action: "banUser",
    targetUsername: username,
    ...(reason ? { reason } : {}),
  });
}

export async function unbanAdminUser<TResponse>(
  username: string
): Promise<TResponse> {
  return adminPost<TResponse, { action: string; targetUsername: string }>({
    action: "unbanUser",
    targetUsername: username,
  });
}

export async function deleteAdminUser<TResponse>(
  username: string
): Promise<TResponse> {
  return adminPost<TResponse, { action: string; targetUsername: string }>({
    action: "deleteUser",
    targetUsername: username,
  });
}

export async function clearAdminUserMemories<TResponse>(
  username: string
): Promise<TResponse> {
  return adminPost<TResponse, { action: string; targetUsername: string }>({
    action: "clearUserMemories",
    targetUsername: username,
  });
}

export async function forceAdminDailyNotes<TResponse>(
  username: string
): Promise<TResponse> {
  return adminPost<TResponse, { action: string; targetUsername: string }>({
    action: "forceProcessDailyNotes",
    targetUsername: username,
  });
}

export async function getAdminUserHeartbeats<TResponse>(
  username: string,
  days?: number
): Promise<TResponse> {
  return adminGet<TResponse>("getUserHeartbeats", { username, days });
}

export async function getAdminAnalytics<TResponse>(
  days: number = 7,
  detail: boolean = false
): Promise<TResponse> {
  return adminGet<TResponse>("getAnalytics", { days, detail });
}

export async function getAdminCursorAgentRuns<TResponse>(
  limit: number = 50
): Promise<TResponse> {
  return adminGet<TResponse>("getCursorAgentRuns", { limit });
}

export async function getAdminRedisKeys<TResponse>(input: {
  pattern?: string;
  cursor?: string;
  count?: number;
} = {}): Promise<TResponse> {
  return adminGet<TResponse>("listRedisKeys", input);
}

export async function getAdminRedisKey<TResponse>(
  key: string
): Promise<TResponse> {
  return adminGet<TResponse>("getRedisKey", { key });
}

export async function getAdminRedisBackup<TResponse>(input: {
  pattern?: string;
  limit?: number;
} = {}): Promise<TResponse> {
  return adminGet<TResponse>("backupRedisKeys", input);
}

export async function deleteAdminRedisKey<TResponse>(
  key: string
): Promise<TResponse> {
  return adminPost<TResponse, { action: string; key: string; confirmKey: string }>({
    action: "deleteRedisKey",
    key,
    confirmKey: key,
  });
}

export async function getAdminRedisKeyMigrationStatus<TResponse>(input: {
  limit?: number;
} = {}): Promise<TResponse> {
  return adminGet<TResponse>("getRedisKeyMigrationStatus", input);
}

export async function backfillAdminRedisKeyScheme<TResponse>(input: {
  pattern: string;
  limit?: number;
  dryRun?: boolean;
}): Promise<TResponse> {
  return adminPost<
    TResponse,
    {
      action: string;
      pattern: string;
      confirmPattern: string;
      limit?: number;
      dryRun?: boolean;
    }
  >({
    action: "backfillRedisKeyScheme",
    pattern: input.pattern,
    confirmPattern: input.pattern,
    ...(input.limit ? { limit: input.limit } : {}),
    ...(input.dryRun !== undefined ? { dryRun: input.dryRun } : {}),
  });
}

export async function deleteAdminLegacyRedisKeys<TResponse>(input: {
  pattern: string;
  limit?: number;
  dryRun?: boolean;
}): Promise<TResponse> {
  return adminPost<
    TResponse,
    {
      action: string;
      pattern: string;
      confirmPattern: string;
      limit?: number;
      dryRun?: boolean;
    }
  >({
    action: "deleteLegacyRedisKeys",
    pattern: input.pattern,
    confirmPattern: input.pattern,
    ...(input.limit ? { limit: input.limit } : {}),
    ...(input.dryRun !== undefined ? { dryRun: input.dryRun } : {}),
  });
}

export async function postAdminStartCursorAgent<TResponse>(input: {
  prompt: string;
  modelId?: string;
}): Promise<TResponse> {
  return adminPost<TResponse, { action: string; prompt: string; modelId?: string }>({
    action: "startCursorAgent",
    prompt: input.prompt,
    ...(input.modelId ? { modelId: input.modelId } : {}),
  });
}

