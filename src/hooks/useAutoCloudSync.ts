import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import {
  getRealtimeConnectionState,
  subscribePusherChannel,
  subscribeRealtimeConnection,
  unsubscribePusherChannel,
} from "@/lib/pusherClient";
import {
  subscribeToCloudSyncCheckRequests,
  subscribeToCloudSyncDomainChanges,
} from "@/utils/cloudSyncEvents";
import {
  fetchAutoSyncPreferenceFromServer,
  persistAutoSyncPreferenceToServer,
} from "@/utils/autoSyncPreference";
import { getSyncChannelName } from "@/shared/constants/realtime";
import {
  SYNC_OPS_REALTIME_EVENT,
  type SyncOpsRealtimeEvent,
} from "@/shared/sync2/types";
import { createCloudSyncEngine, destroyCloudSyncEngine } from "@/sync/engine";
import { cloudSyncLog, summarizeSyncOps } from "@/sync/logging";
import {
  clearManualRestoreIntent,
  getManualRestoreIntent,
} from "@/sync/manualRestoreIntent";
import { markSyncLocalReconcileRequired } from "@/sync/state";

// Realtime delivers changes; polling is only a safety net for missed events.
const POLL_INTERVAL_CONNECTED_MS = 30 * 60 * 1000;
const POLL_INTERVAL_DISCONNECTED_MS = 5 * 60 * 1000;
const VISIBILITY_CHECK_COOLDOWN_MS = 30_000;
const EXPLICIT_CHECK_COOLDOWN_MS = 2_000;
const RECONNECT_CATCHUP_DEBOUNCE_MS = 500;
const API_AVAILABILITY_RETRY_MS = 15_000;

/**
 * Mounts the Cloud Sync v2 engine while a logged-in user has Auto Sync
 * enabled, and wires its triggers: store subscriptions (inside the engine),
 * explicit change events, realtime ops, visibility/online checks, and a
 * slow heartbeat poll.
 */
export function useAutoCloudSync() {
  const username = useAuthStore((state) => state.username);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const autoSyncEnabled = useCloudSyncStore((state) => state.autoSyncEnabled);
  const [syncApiAvailable, setSyncApiAvailable] = useState(false);
  const [restoreIntentVersion, setRestoreIntentVersion] = useState(0);

  const lastVisibilityCheckRef = useRef(0);
  const lastExplicitCheckRef = useRef(0);
  const activeSyncUsernameRef = useRef<string | null>(null);
  const pendingRestoreIntent = username
    ? getManualRestoreIntent(username)
    : null;
  const pendingRestoreIntentKey = pendingRestoreIntent?.createdAt ?? null;

  // Adopt the cross-device Auto Sync preference on login.
  useEffect(() => {
    if (!username || !isAuthenticated) {
      cloudSyncLog.debug("Auto Sync availability check skipped", {
        hasUsername: Boolean(username),
        isAuthenticated,
      });
      setSyncApiAvailable(false);
      return;
    }
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let checking = false;

    const checkAvailability = async () => {
      if (checking || cancelled) return;
      checking = true;
      cloudSyncLog.debug("Checking Auto Sync API availability");
      const result = await fetchAutoSyncPreferenceFromServer();
      checking = false;
      if (cancelled) return;
      if (!result.ok) {
        cloudSyncLog.warn("Auto Sync API unavailable; retry scheduled", {
          retryMs: API_AVAILABILITY_RETRY_MS,
        });
        setSyncApiAvailable(false);
        retryTimer = setTimeout(
          () => void checkAvailability(),
          API_AVAILABILITY_RETRY_MS
        );
        return;
      }
      setSyncApiAvailable(true);
      cloudSyncLog.debug("Auto Sync API available", {
        shouldApplyServerPreference: result.apply,
        serverEnabled: result.apply ? result.enabled : undefined,
      });
      if (result.apply) {
        useCloudSyncStore
          .getState()
          .applyServerAutoSyncPreference(result.enabled);
        return;
      }
      if (useCloudSyncStore.getState().autoSyncEnabled) {
        void persistAutoSyncPreferenceToServer(true);
      }
    };

    const checkNow = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      void checkAvailability();
    };

    setSyncApiAvailable(false);
    checkNow();
    window.addEventListener("online", checkNow);
    return () => {
      cancelled = true;
      window.removeEventListener("online", checkNow);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [username, isAuthenticated]);

  const syncRequested = Boolean(
    username &&
      isAuthenticated &&
      syncApiAvailable &&
      (autoSyncEnabled || pendingRestoreIntent)
  );
  const isSyncActive = syncRequested;

  useEffect(() => {
    if (!isSyncActive || !username) {
      const activeUsername = activeSyncUsernameRef.current;
      if (activeUsername) {
        markSyncLocalReconcileRequired(activeUsername);
        activeSyncUsernameRef.current = null;
        cloudSyncLog.debug("Auto Sync inactive; marked local reconcile", {
          username: activeUsername,
        });
      }
      cloudSyncLog.debug("Auto Sync inactive; destroying engine", {
        hasUsername: Boolean(username),
        isSyncActive,
      });
      destroyCloudSyncEngine();
      return;
    }

    cloudSyncLog.debug("Starting Cloud Sync engine", { username });
    activeSyncUsernameRef.current = username;
    const engine = createCloudSyncEngine(username, {
      onError: (error) => useCloudSyncStore.getState().setLastError(error),
    });
    let engineReady = false;
    let cancelled = false;
    const restoreIntent = getManualRestoreIntent(username);

    const startEngine = async () => {
      try {
        if (restoreIntent) {
          cloudSyncLog.debug("Promoting restored manual backup to Sync v2", {
            username,
            backupTimestamp: restoreIntent.backupTimestamp,
          });
          await engine.restoreLocalStateToCloud();
          clearManualRestoreIntent(username);
          if (!useCloudSyncStore.getState().autoSyncEnabled) {
            if (!cancelled) {
              setRestoreIntentVersion((version) => version + 1);
            }
            return;
          }
        }
        if (cancelled) return;
        await engine.start();
        engineReady = true;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Manual restore sync promotion failed";
        cloudSyncLog.error("Cloud Sync startup failed", { error });
        useCloudSyncStore.getState().setLastError(message);
      }
    };
    void startEngine();

    const unsubscribeChanges = subscribeToCloudSyncDomainChanges(
      (namespace, keys) => {
        if (!engineReady) return;
        if (engine.isApplyingNamespace(namespace)) return;
        cloudSyncLog.debug("Domain change marked dirty", {
          namespace,
          keyCount: keys?.size ?? 0,
        });
        engine.markDirty(namespace, keys);
      }
    );

    const unsubscribeChecks = subscribeToCloudSyncCheckRequests(() => {
      if (!engineReady) return;
      const now = Date.now();
      if (now - lastExplicitCheckRef.current < EXPLICIT_CHECK_COOLDOWN_MS) {
        cloudSyncLog.debug("Explicit sync check skipped by cooldown", {
          cooldownMs: EXPLICIT_CHECK_COOLDOWN_MS,
        });
        return;
      }
      lastExplicitCheckRef.current = now;
      cloudSyncLog.debug("Explicit sync check requested");
      void engine.pull();
      engine.schedulePendingFlush();
    });

    // Realtime: inline ops apply with zero HTTP requests; gaps trigger a pull.
    const channelName = getSyncChannelName(username);
    const channel = subscribePusherChannel(channelName);
    const realtimeHandler = (payload: SyncOpsRealtimeEvent) => {
      if (!engineReady) return;
      cloudSyncLog.debug("Realtime sync event received", {
        seq: payload.seq,
        clientId: payload.c,
        ops: payload.ops ? summarizeSyncOps(payload.ops) : undefined,
      });
      engine.handleRealtimeEvent(payload);
    };
    channel.bind(SYNC_OPS_REALTIME_EVENT, realtimeHandler);

    // Visibility / focus / online: one cheap cursor check (with cooldown).
    const checkOnWake = () => {
      if (!engineReady) return;
      const now = Date.now();
      if (now - lastVisibilityCheckRef.current < VISIBILITY_CHECK_COOLDOWN_MS) {
        cloudSyncLog.debug("Wake sync check skipped by cooldown", {
          cooldownMs: VISIBILITY_CHECK_COOLDOWN_MS,
        });
        return;
      }
      lastVisibilityCheckRef.current = now;
      cloudSyncLog.debug("Wake sync check requested");
      void engine.pull();
      engine.schedulePendingFlush();
    };
    const onVisibilityChange = () => {
      if (!engineReady) return;
      if (document.visibilityState === "visible") {
        cloudSyncLog.debug("Document visible; checking sync");
        checkOnWake();
      } else {
        // Flush pending changes before the tab may be discarded.
        cloudSyncLog.debug("Document hidden; flushing pending sync changes");
        void engine.flush();
      }
    };
    window.addEventListener("focus", checkOnWake);
    window.addEventListener("online", checkOnWake);
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Reconnect catch-up (debounced against connection flapping).
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      const pollMs =
        getRealtimeConnectionState() === "connected"
          ? POLL_INTERVAL_CONNECTED_MS
          : POLL_INTERVAL_DISCONNECTED_MS;
      pollTimer = setInterval(() => {
        if (!engineReady) return;
        cloudSyncLog.debug("Periodic sync poll triggered", { pollMs });
        void engine.pull();
        engine.schedulePendingFlush();
      }, pollMs);
      cloudSyncLog.debug("Periodic sync poll scheduled", { pollMs });
    };
    startPolling();

    const unsubscribeConnection = subscribeRealtimeConnection((state) => {
      cloudSyncLog.debug("Realtime connection state changed", { state });
      if (state === "connected") {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (!engineReady) return;
          cloudSyncLog.debug("Realtime reconnect catch-up triggered");
          void engine.pull();
          engine.schedulePendingFlush();
        }, RECONNECT_CATCHUP_DEBOUNCE_MS);
        startPolling();
      } else if (state === "disconnected") {
        startPolling();
      }
    });

    return () => {
      cloudSyncLog.debug("Stopping Cloud Sync engine", { username });
      cancelled = true;
      unsubscribeChanges();
      unsubscribeChecks();
      unsubscribeConnection();
      channel.unbind(SYNC_OPS_REALTIME_EVENT, realtimeHandler);
      unsubscribePusherChannel(channelName);
      window.removeEventListener("focus", checkOnWake);
      window.removeEventListener("online", checkOnWake);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pollTimer) clearInterval(pollTimer);
      destroyCloudSyncEngine();
    };
  }, [isSyncActive, pendingRestoreIntentKey, restoreIntentVersion, username]);
}
