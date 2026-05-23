/**
 * Tracks newly created TextEdit instances so that an immediate AI
 * `open` tool call right after a `write` tool call can find and focus
 * the instance even before the file system / app store sync settles.
 *
 * Used as a fallback in `useAiChat` for the write→open race.
 */

import { useAppStore } from "@/stores/useAppStore";

interface TrackedInstance {
  instanceId: string;
  path: string;
  timestamp: number;
}

const recentlyCreatedTextEditInstances = new Map<string, TrackedInstance>();

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/** Record a newly created TextEdit instance and prune stale entries. */
export const trackNewTextEditInstance = (
  instanceId: string,
  path: string
): void => {
  recentlyCreatedTextEditInstances.set(instanceId, {
    instanceId,
    path,
    timestamp: Date.now(),
  });

  const fiveMinutesAgo = Date.now() - FIVE_MINUTES_MS;
  for (const [id, data] of recentlyCreatedTextEditInstances.entries()) {
    if (data.timestamp < fiveMinutesAgo) {
      recentlyCreatedTextEditInstances.delete(id);
    }
  }
};

/**
 * Return the most recently tracked TextEdit instance for a given path
 * that is still open in the app store, or null if none match.
 */
export const getRecentTextEditInstanceForPath = (
  path: string
): string | null => {
  const appStore = useAppStore.getState();
  let newestMatch: { instanceId: string; timestamp: number } | null = null;

  for (const [id, tracked] of recentlyCreatedTextEditInstances.entries()) {
    if (tracked.path !== path) {
      continue;
    }

    const instance = appStore.instances[id];
    if (!instance || !instance.isOpen || instance.appId !== "textedit") {
      recentlyCreatedTextEditInstances.delete(id);
      continue;
    }

    if (!newestMatch || tracked.timestamp > newestMatch.timestamp) {
      newestMatch = { instanceId: id, timestamp: tracked.timestamp };
    }
  }

  return newestMatch?.instanceId ?? null;
};
