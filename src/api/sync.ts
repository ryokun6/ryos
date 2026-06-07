import { apiRequest } from "@/api/core";

export interface AutoSyncPreferenceResponse {
  hasPreference: boolean;
  enabled: boolean;
}

export interface SaveAutoSyncPreferenceResponse {
  ok: boolean;
  enabled: boolean;
}

export async function getAutoSyncPreference(): Promise<AutoSyncPreferenceResponse> {
  return apiRequest<AutoSyncPreferenceResponse>({
    path: "/api/sync/auto-sync-preference",
    method: "GET",
    timeout: 12000,
    retry: { maxAttempts: 1, initialDelayMs: 200 },
  });
}

export async function saveAutoSyncPreference(
  enabled: boolean
): Promise<SaveAutoSyncPreferenceResponse> {
  return apiRequest<SaveAutoSyncPreferenceResponse, { enabled: boolean }>({
    path: "/api/sync/auto-sync-preference",
    method: "PUT",
    body: { enabled },
    timeout: 12000,
    retry: { maxAttempts: 2, initialDelayMs: 400 },
  });
}
