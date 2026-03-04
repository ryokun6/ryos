import { useCallback, useEffect, useRef } from "react";
import {
  useCloudSyncStore,
  SYNC_CATEGORY_KEYS,
  type SyncCategory,
} from "@/stores/useCloudSyncStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { getApiUrl } from "@/utils/platform";
import { toast } from "sonner";
import { useThemeStore } from "@/stores/useThemeStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useAppStore } from "@/stores/useAppStore";
import { useDockStore } from "@/stores/useDockStore";
import { useFilesStore } from "@/stores/useFilesStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useCalendarStore } from "@/stores/useCalendarStore";
import { useStickiesStore } from "@/stores/useStickiesStore";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const PUSH_DEBOUNCE_MS = 3000; // 3 seconds debounce after changes

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(36);
}

function collectCategoryData(category: SyncCategory): string {
  const keys = SYNC_CATEGORY_KEYS[category];
  const data: Record<string, string | null> = {};
  for (const key of keys) {
    data[key] = localStorage.getItem(key);
  }
  return JSON.stringify(data);
}

function applyCategoryData(category: SyncCategory, rawData: string): boolean {
  try {
    const data: Record<string, string | null> = JSON.parse(rawData);
    const keys = SYNC_CATEGORY_KEYS[category];
    for (const key of keys) {
      if (key in data) {
        if (data[key] === null) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, data[key]!);
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

function rehydrateStoresAfterPull(pulledCategories: SyncCategory[]) {
  for (const cat of pulledCategories) {
    switch (cat) {
      case "settings":
        useThemeStore.getState().hydrate();
        useLanguageStore.getState().hydrate();
        useDisplaySettingsStore.persist.rehydrate();
        useAudioSettingsStore.persist.rehydrate();
        useAppStore.persist.rehydrate();
        useDockStore.persist.rehydrate();
        break;
      case "files":
        useFilesStore.persist.rehydrate();
        break;
      case "musicLibrary":
        useIpodStore.persist.rehydrate();
        break;
      case "calendar":
        useCalendarStore.persist.rehydrate();
        break;
      case "stickies":
        useStickiesStore.persist.rehydrate();
        break;
    }
  }
}

export function useCloudAutoSync() {
  const enabled = useCloudSyncStore((s) => s.enabled);
  const getEnabledCategories = useCloudSyncStore(
    (s) => s.getEnabledCategories
  );
  const setLastSyncTimestamp = useCloudSyncStore(
    (s) => s.setLastSyncTimestamp
  );
  const lastPushHashes = useCloudSyncStore((s) => s.lastPushHashes);
  const setLastPushHash = useCloudSyncStore((s) => s.setLastPushHash);

  const username = useChatsStore((s) => s.username);
  const authToken = useChatsStore((s) => s.authToken);

  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pullTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSyncingRef = useRef(false);
  const isPullingRef = useRef(false);
  const lastPullTimestampsRef = useRef<Record<string, string>>({});

  const pushCategories = useCallback(
    async (categories: SyncCategory[]) => {
      if (!username || !authToken || categories.length === 0) return;
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;

      try {
        const payload: Record<string, string> = {};
        for (const cat of categories) {
          const data = collectCategoryData(cat);
          const hash = hashString(data);
          if (hash !== lastPushHashes[cat]) {
            payload[cat] = data;
          }
        }

        if (Object.keys(payload).length === 0) {
          return;
        }

        const res = await fetch(getApiUrl("/api/sync/auto/push"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
            "X-Username": username,
          },
          body: JSON.stringify({ categories: payload }),
        });

        if (res.ok) {
          const result = await res.json();
          for (const cat of Object.keys(payload)) {
            const hash = hashString(payload[cat]);
            setLastPushHash(cat, hash);
          }
          if (result.timestamp) {
            setLastSyncTimestamp(result.timestamp);
          }
        }
      } catch (error) {
        console.error("[CloudAutoSync] Push error:", error);
      } finally {
        isSyncingRef.current = false;
      }
    },
    [username, authToken, lastPushHashes, setLastPushHash, setLastSyncTimestamp]
  );

  const debouncedPush = useCallback(
    (categories: SyncCategory[]) => {
      if (pushTimerRef.current) {
        clearTimeout(pushTimerRef.current);
      }
      pushTimerRef.current = setTimeout(() => {
        pushCategories(categories);
      }, PUSH_DEBOUNCE_MS);
    },
    [pushCategories]
  );

  const checkAndPull = useCallback(async () => {
    if (!username || !authToken || !enabled) return;
    if (isPullingRef.current) return;
    isPullingRef.current = true;

    try {
      const categories = getEnabledCategories();
      if (categories.length === 0) return;

      const tsRes = await fetch(getApiUrl("/api/sync/auto/timestamps"), {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "X-Username": username,
        },
      });

      if (!tsRes.ok) return;
      const tsData = await tsRes.json();
      const remoteTimestamps: Record<string, string> =
        tsData.timestamps || {};

      const categoriesToPull: SyncCategory[] = [];
      for (const cat of categories) {
        const remoteTs = remoteTimestamps[cat];
        if (!remoteTs) continue;
        const localTs = lastPullTimestampsRef.current[cat];
        if (!localTs || remoteTs > localTs) {
          categoriesToPull.push(cat);
        }
      }

      if (categoriesToPull.length === 0) return;

      const pullRes = await fetch(
        getApiUrl(
          `/api/sync/auto/pull?categories=${categoriesToPull.join(",")}`
        ),
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
            "X-Username": username,
          },
        }
      );

      if (!pullRes.ok) return;
      const pullData = await pullRes.json();

      const applied: SyncCategory[] = [];
      for (const cat of categoriesToPull) {
        const entry = pullData.categories?.[cat];
        if (!entry?.data) continue;

        const currentData = collectCategoryData(cat);
        const currentHash = hashString(currentData);
        const remoteHash = hashString(entry.data);

        if (currentHash === remoteHash) {
          lastPullTimestampsRef.current[cat] = entry.timestamp;
          setLastPushHash(cat, currentHash);
          continue;
        }

        if (applyCategoryData(cat, entry.data)) {
          lastPullTimestampsRef.current[cat] = entry.timestamp;
          const newHash = hashString(entry.data);
          setLastPushHash(cat, newHash);
          applied.push(cat);
        }
      }

      if (applied.length > 0) {
        rehydrateStoresAfterPull(applied);
        setLastSyncTimestamp(new Date().toISOString());
      }
    } catch (error) {
      console.error("[CloudAutoSync] Pull error:", error);
    } finally {
      isPullingRef.current = false;
    }
  }, [
    username,
    authToken,
    enabled,
    getEnabledCategories,
    setLastSyncTimestamp,
    setLastPushHash,
  ]);

  const syncNow = useCallback(async () => {
    if (!username || !authToken) {
      toast.error("Please log in to sync.");
      return;
    }

    const categories = getEnabledCategories();
    if (categories.length === 0) {
      toast.error("No sync categories enabled.");
      return;
    }

    await pushCategories(categories);
    await checkAndPull();
    toast.success("Synced successfully.");
  }, [username, authToken, getEnabledCategories, pushCategories, checkAndPull]);

  useEffect(() => {
    if (!enabled || !username || !authToken) return;

    const initialPull = setTimeout(() => {
      checkAndPull();
    }, 2000);

    pullTimerRef.current = setInterval(() => {
      checkAndPull();
    }, POLL_INTERVAL_MS);

    return () => {
      clearTimeout(initialPull);
      if (pullTimerRef.current) {
        clearInterval(pullTimerRef.current);
        pullTimerRef.current = null;
      }
    };
  }, [enabled, username, authToken, checkAndPull]);

  useEffect(() => {
    if (!enabled || !username || !authToken) return;

    const categories = getEnabledCategories();
    if (categories.length === 0) return;

    const unsubscribers: (() => void)[] = [];

    const monitoredKeys = new Set<string>();
    for (const cat of categories) {
      for (const key of SYNC_CATEGORY_KEYS[cat]) {
        monitoredKeys.add(key);
      }
    }

    const handleStorageChange = (e: StorageEvent) => {
      if (!e.key || !monitoredKeys.has(e.key)) return;

      const affectedCategories: SyncCategory[] = [];
      for (const cat of categories) {
        if (SYNC_CATEGORY_KEYS[cat].includes(e.key)) {
          affectedCategories.push(cat);
        }
      }
      if (affectedCategories.length > 0) {
        debouncedPush(affectedCategories);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    unsubscribers.push(() =>
      window.removeEventListener("storage", handleStorageChange)
    );

    const checkInterval = setInterval(() => {
      const changedCategories: SyncCategory[] = [];
      for (const cat of categories) {
        const data = collectCategoryData(cat);
        const hash = hashString(data);
        const store = useCloudSyncStore.getState();
        if (hash !== store.lastPushHashes[cat]) {
          changedCategories.push(cat);
        }
      }
      if (changedCategories.length > 0) {
        debouncedPush(changedCategories);
      }
    }, 10000);

    unsubscribers.push(() => clearInterval(checkInterval));

    return () => {
      unsubscribers.forEach((unsub) => unsub());
      if (pushTimerRef.current) {
        clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
    };
  }, [enabled, username, authToken, getEnabledCategories, debouncedPush]);

  return {
    syncNow,
    checkAndPull,
    pushCategories,
  };
}
