import { useEffect, useRef, useState } from "react";
import { useChatsStore } from "@/stores/useChatsStore";
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
import { writeAgentDebugLog } from "@/utils/agentDebugLog";
import { getSyncChannelName } from "@/shared/constants/realtime";
import {
  SYNC_OPS_REALTIME_EVENT,
  type SyncOpsRealtimeEvent,
} from "@/shared/sync2/types";
import { createCloudSyncEngine, destroyCloudSyncEngine } from "@/sync/engine";

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
  const username = useChatsStore((state) => state.username);
  const isAuthenticated = useChatsStore((state) => state.isAuthenticated);
  const autoSyncEnabled = useCloudSyncStore((state) => state.autoSyncEnabled);
  const [syncApiAvailable, setSyncApiAvailable] = useState(false);

  const lastVisibilityCheckRef = useRef(0);
  const lastExplicitCheckRef = useRef(0);

  // Adopt the cross-device Auto Sync preference on login.
  useEffect(() => {
    if (!username || !isAuthenticated) {
      setSyncApiAvailable(false);
      return;
    }
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let checking = false;

    const checkAvailability = async () => {
      if (checking || cancelled) return;
      checking = true;
      const result = await fetchAutoSyncPreferenceFromServer();
      checking = false;
      if (cancelled) return;
      // #region agent log
      writeAgentDebugLog({
        hypothesisId: "H2",
        location: "src/hooks/useAutoCloudSync.ts:66",
        message: "auto sync preference check completed",
        data: {
          ok: result.ok,
          apply: result.ok ? result.apply : null,
          enabledFromServer: result.ok && result.apply ? result.enabled : null,
          localAutoSyncEnabled: useCloudSyncStore.getState().autoSyncEnabled,
          hasUsername: Boolean(username),
          isAuthenticated,
        },
      });
      // #endregion
      if (!result.ok) {
        setSyncApiAvailable(false);
        retryTimer = setTimeout(
          () => void checkAvailability(),
          API_AVAILABILITY_RETRY_MS
        );
        return;
      }
      setSyncApiAvailable(true);
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
    username && isAuthenticated && autoSyncEnabled && syncApiAvailable
  );
  const isSyncActive = syncRequested;

  useEffect(() => {
    if (!isSyncActive || !username) {
      destroyCloudSyncEngine();
      return;
    }

    const engine = createCloudSyncEngine(username, {
      onError: (error) => useCloudSyncStore.getState().setLastError(error),
    });
    void engine.start();

    const unsubscribeChanges = subscribeToCloudSyncDomainChanges(
      (namespace, keys) => {
        if (engine.isApplyingNamespace(namespace)) return;
        engine.markDirty(namespace, keys);
      }
    );

    const unsubscribeChecks = subscribeToCloudSyncCheckRequests(() => {
      const now = Date.now();
      if (now - lastExplicitCheckRef.current < EXPLICIT_CHECK_COOLDOWN_MS) {
        return;
      }
      lastExplicitCheckRef.current = now;
      void engine.pull();
      engine.schedulePendingFlush();
    });

    // Realtime: inline ops apply with zero HTTP requests; gaps trigger a pull.
    const channelName = getSyncChannelName(username);
    const channel = subscribePusherChannel(channelName);
    const realtimeHandler = (payload: SyncOpsRealtimeEvent) => {
      engine.handleRealtimeEvent(payload);
    };
    channel.bind(SYNC_OPS_REALTIME_EVENT, realtimeHandler);

    // Visibility / focus / online: one cheap cursor check (with cooldown).
    const checkOnWake = () => {
      const now = Date.now();
      if (now - lastVisibilityCheckRef.current < VISIBILITY_CHECK_COOLDOWN_MS) {
        return;
      }
      lastVisibilityCheckRef.current = now;
      void engine.pull();
      engine.schedulePendingFlush();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkOnWake();
      } else {
        // Flush pending changes before the tab may be discarded.
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
        void engine.pull();
        engine.schedulePendingFlush();
      }, pollMs);
    };
    startPolling();

    const unsubscribeConnection = subscribeRealtimeConnection((state) => {
      if (state === "connected") {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          void engine.pull();
          engine.schedulePendingFlush();
        }, RECONNECT_CATCHUP_DEBOUNCE_MS);
        startPolling();
      } else if (state === "disconnected") {
        startPolling();
      }
    });

    return () => {
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
  }, [isSyncActive, username]);
}
