import { useCallback, useEffect, useRef, useState } from "react";
import { useChatsStore } from "@/stores/useChatsStore";
import { useSyncSettingsStore } from "@/stores/useSyncSettingsStore";
import { syncWithSettings, getOrCreateDeviceId } from "@/stores/sync";

const DEFAULT_AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Hook to orchestrate sync based on sync settings and chat auth.
 * Provides a manual trigger and exposes basic sync state.
 */
export function useSyncController() {
  const { authToken, username } = useChatsStore();
  const settings = useSyncSettingsStore();
  const [isSyncing, setIsSyncing] = useState(false);
  const inFlight = useRef(false);

  const syncNow = useCallback(async () => {
    if (inFlight.current) return { ok: false, status: 0, error: "already_syncing" };
    if (!settings.enabled) return { ok: false, status: 0, error: "sync_disabled" };
    if (!authToken || !username) return { ok: false, status: 0, error: "no_auth" };
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { ok: false, status: 0, error: "offline" };
    }

    inFlight.current = true;
    setIsSyncing(true);
    const result = await syncWithSettings({ authToken, username });
    inFlight.current = false;
    setIsSyncing(false);
    return result;
  }, [authToken, username, settings.enabled]);

  useEffect(() => {
    if (!settings.enabled) return;
    if (!authToken || !username) return;

    // Trigger an immediate sync when enabled/auth present
    syncNow();

    if (!settings.autoSync) return;

    const interval = setInterval(() => {
      syncNow();
    }, DEFAULT_AUTO_SYNC_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [settings.enabled, settings.autoSync, authToken, username, syncNow]);

  return {
    syncNow,
    isSyncing,
    lastSyncAt: settings.lastSyncAt,
    lastError: settings.lastError,
    deviceId: getOrCreateDeviceId(),
  };
}
