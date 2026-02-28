import { abortableFetch } from "@/utils/abortableFetch";
import type { FileSystemData, FileSystemItemData } from "./types";

let cachedFileSystemData: FileSystemData | null = null;
let cachedAppletsData: { applets: FileSystemItemData[] } | null = null;
let fileSystemDataPromise: Promise<FileSystemData> | null = null;
let appletsDataPromise: Promise<{ applets: FileSystemItemData[] }> | null = null;
let preloadStarted = false;

/**
 * Preload filesystem data early (can be called before React mounts).
 * This starts fetching JSON files in parallel without blocking.
 * Call this as early as possible in your app's entry point.
 */
export function preloadFileSystemData(): void {
  if (preloadStarted) return;
  preloadStarted = true;

  // Start fetching both JSON files in parallel (non-blocking)
  loadDefaultFiles();
  loadDefaultApplets();
}

/** Load default files from filesystem.json (with caching and deduplication). */
export async function loadDefaultFiles(): Promise<FileSystemData> {
  if (cachedFileSystemData) {
    return cachedFileSystemData;
  }

  if (fileSystemDataPromise) {
    return fileSystemDataPromise;
  }

  fileSystemDataPromise = (async () => {
    try {
      const res = await abortableFetch("/data/filesystem.json", {
        timeout: 15000,
        retry: { maxAttempts: 2, initialDelayMs: 500 },
      });
      const data = await res.json();
      cachedFileSystemData = data as FileSystemData;
      return cachedFileSystemData;
    } catch (err) {
      console.error("Failed to load filesystem.json", err);
      return { directories: [], files: [] };
    } finally {
      fileSystemDataPromise = null;
    }
  })();

  return fileSystemDataPromise;
}

/** Load default applets from applets.json (with caching and deduplication). */
export async function loadDefaultApplets(): Promise<{
  applets: FileSystemItemData[];
}> {
  if (cachedAppletsData) {
    return cachedAppletsData;
  }

  if (appletsDataPromise) {
    return appletsDataPromise;
  }

  appletsDataPromise = (async () => {
    try {
      const res = await abortableFetch("/data/applets.json", {
        timeout: 15000,
        retry: { maxAttempts: 2, initialDelayMs: 500 },
      });
      const data = await res.json();
      cachedAppletsData = { applets: data.applets || [] };
      return cachedAppletsData;
    } catch (err) {
      console.error("Failed to load applets.json", err);
      return { applets: [] };
    } finally {
      appletsDataPromise = null;
    }
  })();

  return appletsDataPromise;
}
