import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";

export type AutoSyncPreferenceFetch =
  | { ok: true; apply: false }
  | { ok: true; apply: true; enabled: boolean }
  | { ok: false };

/** Load server preference. Only `apply: true` when user has saved a choice (new devices follow it). */
export async function fetchAutoSyncPreferenceFromServer(): Promise<AutoSyncPreferenceFetch> {
  try {
    const res = await abortableFetch(
      getApiUrl("/api/sync/auto-sync-preference"),
      {
        method: "GET",
        credentials: "include",
        throwOnHttpError: false,
        timeout: 12000,
        retry: { maxAttempts: 1, initialDelayMs: 200 },
      }
    );
    if (!res.ok) {
      return { ok: false };
    }
    const data = (await res.json()) as {
      hasPreference?: unknown;
      enabled?: unknown;
    };
    if (data.hasPreference !== true) {
      return { ok: true, apply: false };
    }
    return {
      ok: true,
      apply: true,
      enabled: data.enabled === true,
    };
  } catch {
    return { ok: false };
  }
}

export async function persistAutoSyncPreferenceToServer(
  enabled: boolean
): Promise<void> {
  try {
    await abortableFetch(getApiUrl("/api/sync/auto-sync-preference"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
      credentials: "include",
      throwOnHttpError: false,
      timeout: 12000,
      retry: { maxAttempts: 2, initialDelayMs: 400 },
    });
  } catch (e) {
    console.warn("[CloudSync] Failed to persist auto-sync preference:", e);
  }
}
