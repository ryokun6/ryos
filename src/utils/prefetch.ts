/**
 * Prefetch utility for caching assets after initial boot
 * This runs during idle time to cache icons, sounds, and app components
 * without blocking the initial page load.
 * 
 * Update checking uses version.json as the single source of truth.
 * Version is stored in useAppStore after successful prefetch.
 */

import { toast } from "sonner";
import { createElement } from "react";
import { PrefetchToast, PrefetchCompleteToast } from "@/components/shared/PrefetchToast";
import { useAppStore } from "@/stores/useAppStore";

// Storage key for manifest timestamp (for cache invalidation)
const MANIFEST_KEY = 'ryos-manifest-timestamp';

// Periodic update check interval (5 minutes)
const UPDATE_CHECK_INTERVAL = 5 * 60 * 1000;
let updateCheckIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Get the currently stored version from the app store
 */
function getStoredVersion(): { version: string | null; buildNumber: string | null } {
  const state = useAppStore.getState();
  return {
    version: state.ryOSVersion,
    buildNumber: state.ryOSBuildNumber,
  };
}

/**
 * Store version in the app store (call after successful prefetch)
 */
function storeVersion(version: string, buildNumber: string, buildTime?: string): void {
  useAppStore.getState().setRyOSVersion(version, buildNumber, buildTime);
  console.log(`[Prefetch] Stored version: ${version} (${buildNumber})`);
}

/**
 * Reload the page to apply updates
 */
function reloadPage(): void {
  window.location.reload();
}

/**
 * Clear the prefetch flag to force re-prefetch on next boot
 * Call this when resetting settings or formatting file system
 */
export function clearPrefetchFlag(): void {
  try {
    localStorage.removeItem(MANIFEST_KEY);
    console.log('[Prefetch] Flag cleared, will re-prefetch on next boot');
  } catch {
    // localStorage might not be available
  }
}

/**
 * Force check for updates and refresh cache
 * Use this for manual "Check for Updates" action
 */
export async function forceRefreshCache(): Promise<void> {
  console.log('[Prefetch] Manual update check triggered...');
  
  const serverVersion = await fetchServerVersion();
  
  if (!serverVersion) {
    toast.error('Could not check for updates');
    return;
  }
  
  // Check if already on latest version (compare with stored version)
  const stored = getStoredVersion();
  if (stored.buildNumber && serverVersion.buildNumber === stored.buildNumber) {
    toast.success('Already running the latest version', {
      description: `ryOS ${serverVersion.version} (${serverVersion.buildNumber})`,
    });
    return;
  }
  
  // New version available - trigger update
  await triggerUpdate(serverVersion.version, serverVersion.buildNumber, serverVersion.buildTime);
}

/**
 * Run the prefetch logic with toast
 * @param showVersionToast - If true, shows "Updated to version X" with reload button. 
 *                           If false, just dismisses the toast on completion.
 * @param serverVersion - Version from version.json (stored after successful prefetch)
 * @param serverBuildNumber - Build number from version.json
 * @param serverBuildTime - Build time from version.json
 */
async function runPrefetchWithToast(
  showVersionToast: boolean = true,
  serverVersion?: string,
  serverBuildNumber?: string,
  serverBuildTime?: string
): Promise<void> {
  console.log('[Prefetch] Starting prefetch with toast...');
  
  // Fetch manifest first
  const manifest = await fetchIconManifest();
  if (!manifest) {
    toast.error('Failed to load asset manifest');
    console.log('[Prefetch] Could not fetch manifest');
    return;
  }
  
  // Gather all URLs
  const iconUrls = getIconUrlsFromManifest(manifest);
  const jsUrls = await discoverAllJsChunks();
  const soundUrls = getSoundUrls();
  
  const totalItems = iconUrls.length + soundUrls.length + jsUrls.length;
  
  if (totalItems === 0) {
    toast.info('No assets to cache');
    console.log('[Prefetch] No assets to prefetch');
    return;
  }
  
  let overallCompleted = 0;
  
  // Create a toast with progress
  const toastId = toast.loading(
    createToastContent({ 
      phase: 'icons', 
      completed: 0, 
      total: totalItems 
    }),
    {
      duration: Infinity,
      id: 'prefetch-progress',
    }
  );
  
  const updateToast = (phase: string, phaseCompleted: number, phaseTotal: number) => {
    const percentage = Math.round((overallCompleted / totalItems) * 100);
    toast.loading(
      createToastContent({
        phase,
        completed: overallCompleted,
        total: totalItems,
        phaseCompleted,
        phaseTotal,
        percentage,
      }),
      { id: toastId, duration: Infinity }
    );
  };
  
  try {
    // Prefetch icons
    if (iconUrls.length > 0) {
      await prefetchUrlsWithProgress(iconUrls, 'Icons', (completed, total) => {
        overallCompleted = completed;
        updateToast('icons', completed, total);
      });
    }
    
    // Prefetch sounds
    if (soundUrls.length > 0) {
      const baseCompleted = overallCompleted;
      await prefetchUrlsWithProgress(soundUrls, 'Sounds', (completed, total) => {
        overallCompleted = baseCompleted + completed;
        updateToast('sounds', completed, total);
      });
    }
    
    // Prefetch JS chunks
    if (jsUrls.length > 0) {
      const baseCompleted = overallCompleted;
      await prefetchUrlsWithProgress(jsUrls, 'Scripts', (completed, total) => {
        overallCompleted = baseCompleted + completed;
        updateToast('scripts', completed, total);
      });
    }
    
    // Store manifest timestamp
    storeManifestTimestamp(manifest);
    
    // Store version in app store after successful prefetch
    if (serverVersion && serverBuildNumber) {
      storeVersion(serverVersion, serverBuildNumber, serverBuildTime);
    }
    
    // Show completion toast - with version/reload for updates, just dismiss for first-time
    if (showVersionToast && serverVersion && serverBuildNumber) {
      console.log(`[Prefetch] Showing update toast with version: ${serverVersion} (${serverBuildNumber})`);
      
      toast.success(
        createElement(PrefetchCompleteToast, {
          version: serverVersion,
          buildNumber: serverBuildNumber,
        }),
        {
          id: toastId,
          duration: Infinity,
          action: {
            label: "Reload",
            onClick: reloadPage,
          },
        }
      );
    } else {
      // First-time prefetch or no version info - just dismiss the progress toast
      toast.dismiss(toastId);
    }
    
  } catch (error) {
    console.error('[Prefetch] Error during prefetch:', error);
    toast.error('Failed to cache assets', { id: toastId });
  }
}

// Cache names used by the service worker (from vite.config.ts workbox config)
const SW_CACHE_NAMES = [
  'static-resources',  // JS/CSS
  'images',
  'fonts', 
  'audio',
  'data-files',
  'wallpapers',
];

// UI sound files in /sounds/ directory
const UI_SOUNDS = [
  'AlertBonk.mp3',
  'AlertGrowl.mp3',
  'AlertIndigo.mp3',
  'AlertQuack.mp3',
  'AlertSosumi.mp3',
  'AlertTabitha.mp3',
  'AlertWildEep.mp3',
  'Beep.mp3',
  'Boot.mp3',
  'ButtonClickDown.mp3',
  'ButtonClickUp.mp3',
  'Click.mp3',
  'EmailMailError.mp3',
  'EmailMailSent.mp3',
  'EmailNewMail.mp3',
  'EmailNoMail.mp3',
  'InputRadioClickDown.mp3',
  'InputRadioClickUp.mp3',
  'MSNNudge.mp3',
  'MenuClose.mp3',
  'MenuItemClick.mp3',
  'MenuItemHover.mp3',
  'MenuOpen.mp3',
  'PhotoShutter.mp3',
  'Thump.mp3',
  'VideoTapeIn.mp3',
  'Volume.mp3',
  'WheelsOfTime.m4a',
  'WindowClose.mp3',
  'WindowCollapse.mp3',
  'WindowControlClickDown.mp3',
  'WindowControlClickUp.mp3',
  'WindowExpand.mp3',
  'WindowFocus.mp3',
  'WindowMoveIdle.mp3',
  'WindowMoveMoving.mp3',
  'WindowMoveStop.mp3',
  'WindowOpen.mp3',
  'WindowResizeIdle.mp3',
  'WindowResizeResizing.mp3',
  'WindowResizeStop.mp3',
  'WindowZoomMaximize.mp3',
  'WindowZoomMinimize.mp3',
];

/**
 * Prefetch a list of URLs with progress tracking
 */
async function prefetchUrlsWithProgress(
  urls: string[], 
  label: string,
  onProgress: (completed: number, total: number) => void
): Promise<number> {
  let completed = 0;
  const total = urls.length;
  
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      try {
        await fetch(url, { 
          method: 'GET',
          cache: 'force-cache',
        });
        completed++;
        onProgress(completed, total);
      } catch {
        completed++;
        onProgress(completed, total);
      }
    })
  );
  
  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  console.log(`[Prefetch] ${label}: ${succeeded}/${urls.length} cached`);
  return succeeded;
}

interface IconManifest {
  version: number;
  generatedAt: string;
  themes: Record<string, string[]>;
}

/**
 * Fetch and parse the icon manifest
 */
async function fetchIconManifest(): Promise<IconManifest | null> {
  try {
    const response = await fetch('/icons/manifest.json');
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.warn('[Prefetch] Failed to load icon manifest:', error);
    return null;
  }
}

/**
 * Get all icon URLs from the icon manifest
 */
function getIconUrlsFromManifest(manifest: IconManifest): string[] {
  const urls: string[] = [];
  
  if (manifest.themes && typeof manifest.themes === 'object') {
    for (const [themeName, icons] of Object.entries(manifest.themes)) {
      if (Array.isArray(icons)) {
        const prefix = themeName === 'default' ? '/icons/default/' : `/icons/${themeName}/`;
        urls.push(...icons.map((icon: string) => `${prefix}${icon}`));
      }
    }
  }
  
  return urls;
}

/**
 * Store the manifest timestamp after successful prefetch
 */
function storeManifestTimestamp(manifest: IconManifest): void {
  try {
    localStorage.setItem(MANIFEST_KEY, manifest.generatedAt);
  } catch {
    // localStorage might not be available
  }
}

/**
 * Get all UI sound URLs
 */
function getSoundUrls(): string[] {
  return UI_SOUNDS.map(sound => `/sounds/${sound}`);
}

/**
 * Clear service worker caches to ensure fresh prefetch
 */
async function clearSwCaches(): Promise<void> {
  try {
    const cacheNames = await caches.keys();
    const swCaches = cacheNames.filter(name => 
      SW_CACHE_NAMES.some(swName => name.includes(swName))
    );
    
    await Promise.all(swCaches.map(name => caches.delete(name)));
    console.log(`[Prefetch] Cleared ${swCaches.length} caches`);
  } catch (error) {
    console.warn('[Prefetch] Failed to clear caches:', error);
  }
}

/**
 * Discover all JS chunks by fetching the main bundle and parsing for dynamic imports
 */
async function discoverAllJsChunks(): Promise<string[]> {
  try {
    // First, get the main bundle URL from index.html
    const indexResponse = await fetch('/index.html');
    if (!indexResponse.ok) return [];
    
    const html = await indexResponse.text();
    
    // Find the main index bundle: /assets/index-XXXX.js
    const mainBundleMatch = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
    if (!mainBundleMatch) {
      console.warn('[Prefetch] Could not find main bundle in index.html');
      return [];
    }
    
    // Fetch the main bundle to find dynamic import URLs
    const bundleResponse = await fetch(mainBundleMatch[0]);
    if (!bundleResponse.ok) return [];
    
    const bundleCode = await bundleResponse.text();
    
    // Find all asset URLs in the bundle
    // Dynamic imports look like: "assets/ChatsAppComponent-BHyz_x7A.js" or "./ChatsAppComponent-..."
    const assetPattern = /["'](?:\.\/|assets\/)([A-Za-z0-9_-]+)-[A-Za-z0-9_-]+\.js["']/g;
    const matches = bundleCode.matchAll(assetPattern);
    
    // Extract just the filename part and build full URLs
    const allAssets: string[] = [];
    for (const match of matches) {
      const filename = match[0].replace(/["']/g, '').replace(/^\.\//, '').replace(/^assets\//, '');
      allAssets.push(`/assets/${filename}`);
    }
    
    // Dedupe and return all JS chunks
    const uniqueAssets = [...new Set(allAssets)];
    
    console.log(`[Prefetch] Discovered ${uniqueAssets.length} JS chunks from main bundle`);
    return uniqueAssets;
    
  } catch (error) {
    console.warn('[Prefetch] Failed to discover JS chunks:', error);
    return [];
  }
}

/**
 * Fetch version info from version.json
 * This is the single source of truth for version checking
 * Note: Does NOT store version - that happens after successful prefetch
 */
async function fetchServerVersion(): Promise<{ version: string; buildNumber: string; buildTime?: string } | null> {
  try {
    const response = await fetch('/version.json', { 
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      }
    });
    
    if (!response.ok) {
      console.warn('[Prefetch] Could not fetch version.json');
      return null;
    }
    
    const data = await response.json();
    if (data.version && data.buildNumber) {
      return {
        version: data.version,
        buildNumber: data.buildNumber,
        buildTime: data.buildTime,
      };
    }
    
    console.warn('[Prefetch] version.json missing required fields');
    return null;
  } catch (error) {
    console.warn('[Prefetch] Failed to fetch server version:', error);
    return null;
  }
}

/**
 * Helper to create toast content using createElement
 */
function createToastContent(props: {
  phase: string;
  completed: number;
  total: number;
  phaseCompleted?: number;
  phaseTotal?: number;
  percentage?: number;
}) {
  return createElement(PrefetchToast, props);
}

/**
 * Check if prefetching has been completed (version is stored)
 */
function isPrefetchComplete(): boolean {
  const stored = getStoredVersion();
  return stored.buildNumber !== null;
}

// Flag to prevent concurrent prefetch operations
let isPrefetchInProgress = false;

/**
 * Check if a newer version is available by comparing version.json with stored version
 * Returns true if an update was found and triggered
 */
async function checkForVersionUpdate(silent: boolean = false): Promise<boolean> {
  try {
    const serverVersion = await fetchServerVersion();
    
    if (!serverVersion) {
      if (!silent) console.log('[Prefetch] Could not fetch server version');
      return false;
    }
    
    const stored = getStoredVersion();
    const storedBuildNumber = stored.buildNumber;
    const serverBuildNumber = serverVersion.buildNumber;
    
    // First-time user (no stored version) - not an update, let initPrefetch handle it
    if (!storedBuildNumber) {
      if (!silent) console.log('[Prefetch] First-time user, no stored version');
      return false;
    }
    
    console.log(`[Prefetch] Version check: stored=${storedBuildNumber}, server=${serverBuildNumber}`);
    
    // If build numbers differ, a new version is available
    if (serverBuildNumber !== storedBuildNumber) {
      console.log('[Prefetch] New version detected, triggering update...');
      await triggerUpdate(serverVersion.version, serverVersion.buildNumber, serverVersion.buildTime);
      return true;
    } else {
      if (!silent) console.log('[Prefetch] Already running latest version');
      return false;
    }
  } catch (error) {
    console.warn('[Prefetch] Version check failed:', error);
    return false;
  }
}

/**
 * Trigger the update process: clear caches and prefetch new assets
 */
async function triggerUpdate(version: string, buildNumber: string, buildTime?: string): Promise<void> {
  // Dismiss any existing prefetch toasts
  toast.dismiss('prefetch-progress');
  
  // Clear caches
  clearPrefetchFlag();
  await clearSwCaches();
  
  // Run prefetch with toast
  isPrefetchInProgress = true;
  try {
    await runPrefetchWithToast(true, version, buildNumber, buildTime);
  } finally {
    isPrefetchInProgress = false;
  }
}

/**
 * Start periodic update checking
 */
function startPeriodicUpdateCheck(): void {
  if (updateCheckIntervalId) return; // Already running
  
  console.log(`[Prefetch] Starting periodic update checks every ${UPDATE_CHECK_INTERVAL / 1000}s`);
  
  updateCheckIntervalId = setInterval(async () => {
    if (isPrefetchInProgress) return; // Skip if already updating
    
    console.log('[Prefetch] Periodic update check...');
    await checkForVersionUpdate(true); // Silent check
  }, UPDATE_CHECK_INTERVAL);
}

/**
 * Stop periodic update checking
 */
export function stopPeriodicUpdateCheck(): void {
  if (updateCheckIntervalId) {
    clearInterval(updateCheckIntervalId);
    updateCheckIntervalId = null;
    console.log('[Prefetch] Stopped periodic update checks');
  }
}

/**
 * Initialize prefetching after the app has loaded
 * - Checks for new versions on load
 * - Handles first-time prefetch
 * - Starts periodic update checking
 */
export function initPrefetch(): void {
  const runPrefetchFlow = async () => {
    // First, check for version updates (returns false for first-time users)
    const updateTriggered = await checkForVersionUpdate();
    
    // If an update was already triggered, skip the regular prefetch
    if (updateTriggered) {
      console.log('[Prefetch] Update already triggered, skipping regular prefetch');
      startPeriodicUpdateCheck();
      return;
    }
    
    // If no update was triggered, check if this is a first-time user
    // who needs initial prefetch (no stored version)
    if (!isPrefetchInProgress && !isPrefetchComplete()) {
      console.log('[Prefetch] First-time user, starting initial prefetch...');
      
      // Fetch server version for first-time users (to store after prefetch)
      const serverVersion = await fetchServerVersion();
      
      isPrefetchInProgress = true;
      try {
        // Use same function but don't show version/reload toast for first-time users
        // Pass version info so it gets stored after successful prefetch
        await runPrefetchWithToast(
          false, 
          serverVersion?.version, 
          serverVersion?.buildNumber,
          serverVersion?.buildTime
        );
      } finally {
        isPrefetchInProgress = false;
      }
    }
    
    // Start periodic update checking
    startPeriodicUpdateCheck();
  };
  
  if (document.readyState === 'complete') {
    // Delay to not interfere with initial render
    setTimeout(runPrefetchFlow, 2000);
  } else {
    window.addEventListener('load', () => {
      setTimeout(runPrefetchFlow, 2000);
    }, { once: true });
  }
}
