/**
 * Prefetch utility for caching assets after initial boot
 * This runs during idle time to cache icons, sounds, and app components
 * without blocking the initial page load.
 * 
 * Update checking uses version.json as the single source of truth.
 * Version is stored in useAppStore after successful prefetch.
 * 
 * Unified flow handles:
 * 1. First-time load (no stored version) - prefetch silently
 * 2. Returning user with update - clear caches, prefetch, show reload toast
 * 3. Periodic checks (every 5 min) - same as #2
 */

import { toast } from "sonner";
import { createElement } from "react";
import { PrefetchToast, PrefetchCompleteToast } from "@/components/shared/PrefetchToast";
import { useAppStore } from "@/stores/useAppStore";
import { setNextBootMessage } from "@/utils/bootMessage";
import i18n from "@/lib/i18n";
import { getApiUrl, isTauri } from "@/utils/platform";

// Storage key for manifest timestamp (for cache invalidation)
const MANIFEST_KEY = 'ryos:manifest-timestamp';
const LEGACY_MANIFEST_KEY = 'ryos-manifest-timestamp';

// Periodic update check interval (5 minutes)
const UPDATE_CHECK_INTERVAL = 5 * 60 * 1000;
let updateCheckIntervalId: ReturnType<typeof setInterval> | null = null;

// HMR cleanup - clear interval when module is replaced
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (updateCheckIntervalId) {
      clearInterval(updateCheckIntervalId);
      updateCheckIntervalId = null;
      console.log('[Prefetch] HMR cleanup: cleared update check interval');
    }
  });
}

// Flag to prevent concurrent operations
let isUpdateInProgress = false;

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
 * Unregisters service worker first to avoid Safari "redirections from worker" errors
 * @param version - Optional version string to show in boot screen
 * @param buildNumber - Optional build number to show in boot screen
 */
async function reloadPage(version?: string, buildNumber?: string): Promise<void> {
  // Set boot message to show boot screen after reload
  if (version && buildNumber) {
    setNextBootMessage(i18n.t("common.system.updatingToRyOSWithBuild", { version, buildNumber }));
  } else if (version) {
    setNextBootMessage(i18n.t("common.system.updatingToRyOS", { version }));
  } else {
    setNextBootMessage(i18n.t("common.system.rebooting"));
  }
  
  try {
    // Unregister service worker before reloading to avoid Safari navigation issues
    // Safari can error with "redirections from worker" when SW is in transitional state
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.unregister();
        console.log('[Prefetch] Service worker unregistered for clean reload');
      }
    }
  } catch (error) {
    console.warn('[Prefetch] Failed to unregister service worker:', error);
  }
  
  // Add cache-busting query param to force fresh index.html fetch
  const url = new URL(window.location.href);
  url.searchParams.set('_cb', Date.now().toString());
  window.location.href = url.toString();
}

/**
 * Clear the prefetch flag to force re-prefetch on next boot
 * Call this when resetting settings or formatting file system
 */
export function clearPrefetchFlag(): void {
  try {
    localStorage.removeItem(MANIFEST_KEY);
    localStorage.removeItem(LEGACY_MANIFEST_KEY);
    console.log('[Prefetch] Flag cleared, will re-prefetch on next boot');
  } catch {
    // localStorage might not be available
  }
}

export interface ServerVersion {
  version: string;
  buildNumber: string;
  buildTime?: string;
  desktopVersion?: string;
}

/**
 * Fetch version info from version.json
 * This is the single source of truth for version checking
 * @param forceRemote - If true, always fetch from production server (used for desktop update checks in Tauri)
 */
async function fetchServerVersion(forceRemote: boolean = false): Promise<ServerVersion | null> {
  try {
    // In Tauri, /version.json would fetch from the bundled app, not the live server.
    // For desktop update checks, we need to fetch from the production server.
    // Use getApiUrl() which returns the production URL in Tauri.
    const url = forceRemote || isTauri() ? getApiUrl('/version.json') : '/version.json';
    
    const response = await fetch(url, { 
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
        desktopVersion: data.desktopVersion,
      };
    }
    
    console.warn('[Prefetch] version.json missing required fields');
    return null;
  } catch (error) {
    console.warn('[Prefetch] Failed to fetch server version:', error);
    return null;
  }
}

export interface DesktopUpdateResult {
  type: 'first-time' | 'update' | 'none';
  version: string | null;
}

/**
 * Check for desktop app updates
 * Returns info about whether this is a first time visit, update available, or no changes
 */
export async function checkDesktopUpdate(): Promise<DesktopUpdateResult> {
  const serverVersion = await fetchServerVersion();
  if (!serverVersion?.desktopVersion) {
    return { type: 'none', version: null };
  }
  
  const lastSeenVersion = useAppStore.getState().lastSeenDesktopVersion;
  
  // If never seen before, this is the first time
  if (!lastSeenVersion) {
    return { type: 'first-time', version: serverVersion.desktopVersion };
  }
  
  // Check if desktop version has changed
  if (serverVersion.desktopVersion !== lastSeenVersion) {
    return { type: 'update', version: serverVersion.desktopVersion };
  }
  
  return { type: 'none', version: null };
}

// Callback for desktop update notifications (set by App.tsx)
let desktopUpdateCallback: ((result: DesktopUpdateResult) => void) | null = null;

/**
 * Register a callback to be called when a desktop update is found
 * Used by App.tsx to show the download toast
 */
export function onDesktopUpdate(callback: (result: DesktopUpdateResult) => void): void {
  desktopUpdateCallback = callback;
}

/**
 * Check for desktop updates and notify via callback
 * Called during periodic checks and manual "Check for Updates"
 */
async function checkAndNotifyDesktopUpdate(): Promise<void> {
  // Check for macOS users (both web and Tauri)
  const isMacOS = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');
  
  if (!isMacOS) {
    return;
  }
  
  const result = await checkDesktopUpdate();
  
  if (result.type !== 'none' && desktopUpdateCallback) {
    desktopUpdateCallback(result);
  }
}

type CheckResult = 
  | { action: 'none' }  // Already up to date
  | { action: 'first-time'; server: ServerVersion }
  | { action: 'update'; server: ServerVersion };

/**
 * Check what action is needed based on stored vs server version
 */
async function determineUpdateAction(): Promise<CheckResult> {
  const serverVersion = await fetchServerVersion();
  
  if (!serverVersion) {
    return { action: 'none' };
  }
  
  const stored = getStoredVersion();
  
  // First-time user (no stored version)
  if (!stored.buildNumber) {
    console.log('[Prefetch] First-time user detected');
    return { action: 'first-time', server: serverVersion };
  }
  
  // Check if versions differ
  if (serverVersion.buildNumber !== stored.buildNumber) {
    console.log(`[Prefetch] Update available: ${stored.buildNumber} → ${serverVersion.buildNumber}`);
    return { action: 'update', server: serverVersion };
  }
  
  console.log('[Prefetch] Already on latest version');
  return { action: 'none' };
}

/**
 * Unified check and update function
 * Handles first-time load, updates on load, and periodic checks
 * 
 * @param isManual - If true, shows toast feedback even when already up-to-date
 */
async function checkAndUpdate(isManual: boolean = false): Promise<void> {
  if (isUpdateInProgress) {
    console.log('[Prefetch] Update already in progress, skipping');
    return;
  }
  
  const result = await determineUpdateAction();
  
  if (result.action === 'none') {
    if (isManual) {
      const stored = getStoredVersion();
      toast.success('Already running the latest version', {
        description: stored.version ? `ryOS ${stored.version} (${stored.buildNumber})` : undefined,
      });
    }
    return;
  }
  
  isUpdateInProgress = true;
  
  try {
    // For updates (not first-time), clear caches first
    if (result.action === 'update') {
      toast.dismiss('prefetch-progress');
      clearPrefetchFlag();
      await clearAllCaches();
    }
    
    // Run prefetch - show reload toast for updates, dismiss silently for first-time
    const showReloadToast = result.action === 'update';
    await runPrefetchWithToast(showReloadToast, result.server);
    
  } finally {
    isUpdateInProgress = false;
  }
}

/**
 * Force refresh cache and show update ready toast
 * Use this for manual "Check for Updates" action
 * Only shows reboot button if version is actually new
 */
export async function forceRefreshCache(): Promise<void> {
  console.log('[Prefetch] Manual update check triggered...');
  
  // Also check for desktop updates when manually checking
  await checkAndNotifyDesktopUpdate();
  
  if (isUpdateInProgress) {
    console.log('[Prefetch] Update already in progress, skipping');
    return;
  }
  
  const serverVersion = await fetchServerVersion();
  
  if (!serverVersion) {
    toast.error('Could not check for updates');
    return;
  }
  
  const stored = getStoredVersion();
  const isNewVersion = serverVersion.buildNumber !== stored.buildNumber;
  
  // If already on latest version, just show success message without reboot
  if (!isNewVersion) {
    toast.success('Already running the latest version', {
      description: stored.version ? `ryOS ${stored.version} (${stored.buildNumber})` : undefined,
    });
    return;
  }
  
  isUpdateInProgress = true;
  
  try {
    // Clear caches and refetch for new version
    toast.dismiss('prefetch-progress');
    clearPrefetchFlag();
    await clearAllCaches();
    
    // Show update ready toast with reboot button (only for new versions)
    await runPrefetchWithToast(true, serverVersion);
  } finally {
    isUpdateInProgress = false;
  }
}

/**
 * Run the prefetch logic with toast
 * @param showVersionToast - If true, shows "Updated to version X" with reload button. 
 *                           If false, just dismisses the toast on completion.
 * @param server - Version info from version.json
 */
async function runPrefetchWithToast(
  showVersionToast: boolean,
  server: ServerVersion
): Promise<void> {
  console.log('[Prefetch] Starting prefetch...');
  
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
  const assetUrls = getStaticAssetUrls();
  
  const totalItems = iconUrls.length + soundUrls.length + jsUrls.length + assetUrls.length;
  
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
  
  // Skip browser HTTP cache when prefetching to ensure fresh resources.
  // The service worker will cache these responses, and ignoreSearch: true
  // means we don't need ?v= cache busting params anymore.
  const prefetchOptions = { skipCache: true };
  
  try {
    // Prefetch icons
    if (iconUrls.length > 0) {
      await prefetchUrlsWithProgress(iconUrls, 'Icons', (completed, total) => {
        overallCompleted = completed;
        updateToast('icons', completed, total);
      }, prefetchOptions);
    }
    
    // Prefetch sounds
    if (soundUrls.length > 0) {
      const baseCompleted = overallCompleted;
      await prefetchUrlsWithProgress(soundUrls, 'Sounds', (completed, total) => {
        overallCompleted = baseCompleted + completed;
        updateToast('sounds', completed, total);
      }, prefetchOptions);
    }
    
    // Prefetch JS chunks
    if (jsUrls.length > 0) {
      const baseCompleted = overallCompleted;
      await prefetchUrlsWithProgress(jsUrls, 'Scripts', (completed, total) => {
        overallCompleted = baseCompleted + completed;
        updateToast('scripts', completed, total);
      }, prefetchOptions);
    }
    
    // Prefetch static assets (textures, splash screens, etc.)
    if (assetUrls.length > 0) {
      const baseCompleted = overallCompleted;
      await prefetchUrlsWithProgress(assetUrls, 'Assets', (completed, total) => {
        overallCompleted = baseCompleted + completed;
        updateToast('assets', completed, total);
      }, prefetchOptions);
    }
    
    // Store manifest timestamp
    storeManifestTimestamp(manifest);
    
    // Store version in app store after successful prefetch
    storeVersion(server.version, server.buildNumber, server.buildTime);
    
    // Dismiss the progress toast
    toast.dismiss(toastId);
    
    // Show completion toast - with version/reload for updates, just dismiss for first-time
    if (showVersionToast) {
      console.log(`[Prefetch] Showing update toast: ${server.version} (${server.buildNumber})`);
      
      // Create a new toast (not replacing the old one)
      toast.success(
        createElement(PrefetchCompleteToast, {
          version: server.version,
          buildNumber: server.buildNumber,
        }),
        {
          duration: Infinity,
          action: {
            label: i18n.t("common.toast.reboot"),
            onClick: () => reloadPage(server.version, server.buildNumber),
          },
        }
      );
    }
    
  } catch (error) {
    console.error('[Prefetch] Error during prefetch:', error);
    toast.error('Failed to cache assets', { id: toastId });
  }
}

// Static assets that should be prefetched for UI theming
const STATIC_ASSETS = [
  // Theme textures
  '/assets/brushed-metal.jpg',
  '/assets/button.svg',
  '/assets/button-default.svg',
  // Splash screens
  '/assets/splash/hello.svg',
  '/assets/splash/macos.svg',
  '/assets/splash/win98.png',
  '/assets/splash/xp.png',
  // Video player controls
  '/assets/videos/play.png',
  '/assets/videos/pause.png',
  '/assets/videos/stop.png',
  '/assets/videos/prev.png',
  '/assets/videos/next.png',
  '/assets/videos/clear.png',
  '/assets/videos/switch.png',
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
  onProgress: (completed: number, total: number) => void,
  options?: { skipCache?: boolean }
): Promise<number> {
  let completed = 0;
  const total = urls.length;
  
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      try {
        await fetch(url, { 
          method: 'GET',
          // Use 'reload' when skipCache is true (e.g., after cache clear on updates)
          // to bypass browser HTTP cache and fetch fresh from network.
          // Otherwise use 'default' to let browser decide (respects cache headers).
          cache: options?.skipCache ? 'reload' : 'default',
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
 * Get all static asset URLs (textures, splash screens, etc.)
 */
function getStaticAssetUrls(): string[] {
  return STATIC_ASSETS;
}

/**
 * Clear ALL caches and update service worker to ensure fresh assets
 */
async function clearAllCaches(): Promise<void> {
  try {
    // Clear ALL Cache Storage caches (not just filtered ones)
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
    console.log(`[Prefetch] Cleared ${cacheNames.length} caches:`, cacheNames);
    
    // Tell service worker to skip waiting and activate new version
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      // Force update check
      await registration?.update();
      console.log('[Prefetch] Service worker update triggered');
    }
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
      // In development mode, Vite serves source directly (no bundled assets)
      if (import.meta.env.DEV) {
        console.log('[Prefetch] Skipping JS chunk discovery in development mode');
      } else {
        console.warn('[Prefetch] Could not find main bundle in index.html');
      }
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
 * Start periodic update checking (every 5 minutes)
 */
function startPeriodicUpdateCheck(): void {
  if (updateCheckIntervalId) return; // Already running
  
  console.log(`[Prefetch] Starting periodic update checks every ${UPDATE_CHECK_INTERVAL / 1000}s`);
  
  updateCheckIntervalId = setInterval(async () => {
    console.log('[Prefetch] Periodic update check...');
    await checkAndUpdate(false);
    // Also check for desktop updates during periodic checks
    await checkAndNotifyDesktopUpdate();
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
 * 
 * Unified flow:
 * 1. First-time load → prefetch silently, store version
 * 2. Returning user with update → clear caches, prefetch, show reload toast
 * 3. Returning user, no update → do nothing
 * 4. Start periodic checks every 5 minutes
 */
export function initPrefetch(): void {
  // Clean up cache-busting param from URL after reload
  const url = new URL(window.location.href);
  if (url.searchParams.has('_cb')) {
    url.searchParams.delete('_cb');
    window.history.replaceState({}, '', url.toString());
    // Clear the stale reload flag since we successfully loaded fresh content
    try {
      sessionStorage.removeItem('ryos-stale-reload');
    } catch {
      // sessionStorage might not be available
    }
  }
  
  const runPrefetchFlow = async () => {
    // Single unified check handles first-time, updates, and no-op
    await checkAndUpdate(false);
    
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
