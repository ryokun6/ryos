import {
  getAutoSyncPreference,
  saveAutoSyncPreference,
} from "@/api/sync";

export type AutoSyncPreferenceFetch =
  | { ok: true; apply: false }
  | { ok: true; apply: true; enabled: boolean }
  | { ok: false };

/** Load server preference. Only `apply: true` when user has saved a choice (new devices follow it). */
export async function fetchAutoSyncPreferenceFromServer(): Promise<AutoSyncPreferenceFetch> {
  try {
    const data = await getAutoSyncPreference();
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
    await saveAutoSyncPreference(enabled);
  } catch (e) {
    console.warn("[CloudSync] Failed to persist auto-sync preference:", e);
  }
}
