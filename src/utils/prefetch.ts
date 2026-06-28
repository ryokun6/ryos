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
import { getApiUrl, isDesktop } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import {
  isInReloadLoop,
  trackReload,
  clearStaleReload,
} from "@/utils/reloadGuard";
import { shouldPrefetchNow } from "@/utils/network";
import { track, SYSTEM_ANALYTICS } from "@/utils/analytics";
import { createVisibilityGatedInterval } from "@/utils/backgroundTask";
import { getSupportedDesktopDownloadTarget } from "@/utils/desktopDownload";
import { createClientLogger } from "@/utils/logger";

const log = createClientLogger("Prefetch");

// Storage key for manifest timestamp (for cache invalidation)
const MANIFEST_KEY = 'ryos:manifest-timestamp';

// Periodic update check interval (5 minutes)
const UPDATE_CHECK_INTERVAL = 5 * 60 * 1000;
let disposeUpdateCheckInterval: (() => void) | null = null;

// HMR cleanup - clear interval when module is replaced
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (disposeUpdateCheckInterval) {
      disposeUpdateCheckInterval();
      disposeUpdateCheckInterval = null;
      log.debug("HMR cleanup: cleared update check interval");
    }
  });
}

// Flag to prevent concurrent operations
let isUpdateInProgress = false;

// Reload-loop detection is centralized in @/utils/reloadGuard (shared keys with
// index.html's inline bootstrap script and main.tsx).

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
  log.debug("Stored version", { version, buildNumber });
}

/**
 * Reload the page to apply updates
 * Unregisters service worker first to avoid Safari "redirections from worker" errors
 * @param version - Optional version string to show in boot screen
 * @param buildNumber - Optional build number to show in boot screen
 */
async function reloadPage(version?: string, buildNumber?: string): Promise<void> {
  if (isInReloadLoop()) {
    console.warn('[Prefetch] Reload loop detected, aborting reload');
    return;
  }
  trackReload();

  // Set boot message to show boot screen after reload
  if (version && buildNumber) {
    setNextBootMessage(i18n.t("common.system.updatingToRyOSWithBuild", { version, buildNumber }));
  } else if (version) {
    setNextBootMessage(i18n.t("common.system.updatingToRyOS", { version }));
  } else {
    setNextBootMessage(i18n.t("common.system.rebooting"));
  }
  
  track(SYSTEM_ANALYTICS.UPDATE_APPLIED, {
    category: "events",
    buildNumber: buildNumber ?? null,
  });

  try {
    // Nudge any waiting service worker to take over so the reload lands on the
    // fresh precache. We intentionally do NOT unregister the SW anymore:
    // unregistering would discard the Workbox precache and force a full
    // re-download on the next load. skipWaiting/clientsClaim + the cache-bust
    // navigation below are enough to get fresh content.
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    }
  } catch (error) {
    console.warn('[Prefetch] Failed to activate waiting service worker:', error);
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
    log.debug("Flag cleared; will re-prefetch on next boot");
  } catch {
    // localStorage might not be available
  }
}

export function hasStoredPrefetchManifestTimestamp(): boolean {
  try {
    return Boolean(localStorage.getItem(MANIFEST_KEY));
  } catch {
    // Avoid repeatedly running background warmup in storage-restricted contexts.
    return true;
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
 * @param forceRemote - If true, always fetch from production server (used for desktop update checks)
 */
async function fetchServerVersion(forceRemote: boolean = false): Promise<ServerVersion | null> {
  try {
    // In the desktop shell, /version.json would fetch from the bundled app, not the live server.
    // For desktop update checks, we need to fetch from the production server.
    // Use getApiUrl() which returns the production URL in the desktop shell.
    const url = forceRemote || isDesktop() ? getApiUrl('/version.json') : '/version.json';
    
    const response = await abortableFetch(url, { 
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      timeout: 15000,
      throwOnHttpError: false,
      retry: { maxAttempts: 1, initialDelayMs: 250 },
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
  // Check supported desktop download targets (both web and desktop shell).
  if (!getSupportedDesktopDownloadTarget()) {
    return;
  }
  
  const result = await checkDesktopUpdate();
  
  if (result.type !== 'none' && desktopUpdateCallback) {
    desktopUpdateCallback(result);
  }
}

type CheckResult = 
  | { action: 'none'; server?: ServerVersion }  // Already up to date, or version unavailable
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
    log.debug("First-time user detected");
    return { action: 'first-time', server: serverVersion };
  }
  
  // Check if versions differ
  if (serverVersion.buildNumber !== stored.buildNumber) {
    log.debug("Update available", {
      storedBuildNumber: stored.buildNumber,
      serverBuildNumber: serverVersion.buildNumber,
    });
    return { action: 'update', server: serverVersion };
  }
  
  log.debug("Already on latest version");
  return { action: 'none', server: serverVersion };
}

/**
 * Unified check and update function
 * Handles first-time load, updates on load, and periodic checks
 * 
 * @param isManual - If true, shows toast feedback even when already up-to-date
 */
async function checkAndUpdate(isManual: boolean = false): Promise<void> {
  if (isUpdateInProgress) {
    log.debug("Update already in progress; skipping");
    return;
  }
  
  const result = await determineUpdateAction();
  
  if (result.action === 'none') {
    const shouldWarmAssets =
      Boolean(result.server) && !hasStoredPrefetchManifestTimestamp();
    if (isManual) {
      const stored = getStoredVersion();
      toast.success('Already running the latest version', {
        description: stored.version ? `ryOS ${stored.version} (${stored.buildNumber})` : undefined,
      });
    }
    if (shouldWarmAssets && result.server) {
      log.debug("Asset warmup flag missing; refreshing runtime assets");
      isUpdateInProgress = true;
      try {
        await runPrefetchWithToast(false, result.server);
      } finally {
        isUpdateInProgress = false;
      }
    }
    return;
  }
  
  isUpdateInProgress = true;
  
  try {
    // For updates (not first-time), clear caches first
    if (result.action === 'update') {
      // Store version IMMEDIATELY to prevent re-detection if the page reloads
      // mid-flow (e.g. VitePWA's auto-update triggers a controllerchange reload
      // during clearRuntimeCaches → registration.update()).  Without this, the
      // stored version would still be old after reload, causing an infinite
      // detect-update → clear-caches → reload cycle.
      storeVersion(result.server.version, result.server.buildNumber, result.server.buildTime);

      toast.dismiss('prefetch-progress');
      clearPrefetchFlag();
      await clearRuntimeCaches();
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
  log.debug("Manual update check triggered");
  
  // Also check for desktop updates when manually checking
  await checkAndNotifyDesktopUpdate();
  
  if (isUpdateInProgress) {
    log.debug("Update already in progress; skipping");
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
    // Store version immediately (same early-store rationale as checkAndUpdate)
    storeVersion(serverVersion.version, serverVersion.buildNumber, serverVersion.buildTime);

    // Clear runtime caches and refetch for new version (preserves the Workbox
    // precache so JS updates stay revision-efficient).
    toast.dismiss('prefetch-progress');
    clearPrefetchFlag();
    await clearRuntimeCaches();
    
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
  log.debug("Starting prefetch");

  // JS chunks are now precached by the service worker (Workbox) and load from
  // cache offline, so we no longer crawl/prefetch them here. This pass only
  // warms NON-JS runtime assets (themed icons, UI sounds, static textures).

  // Be polite on metered / slow connections: skip the background asset warmup
  // but still finalize the version + update toast. Missing assets just load
  // on-demand (and the SW caches them then).
  if (!shouldPrefetchNow()) {
    log.debug("Skipping asset warmup (data saver / slow network)");
    track(SYSTEM_ANALYTICS.PREFETCH_SKIPPED_NETWORK, { category: "events" });
    finalizePrefetch(showVersionToast, server);
    return;
  }

  // Fetch manifest first
  const manifest = await fetchIconManifest();
  if (!manifest) {
    toast.error('Failed to load asset manifest');
    log.debug("Could not fetch manifest");
    return;
  }
  
  // Gather all URLs
  const iconUrls = getIconUrlsFromManifest(manifest);
  const soundUrls = getSoundUrls();
  const assetUrls = getStaticAssetUrls();
  
  const totalItems = iconUrls.length + soundUrls.length + assetUrls.length;
  
  if (totalItems === 0) {
    toast.info('No assets to cache');
    log.debug("No assets to prefetch");
    return;
  }

  track(SYSTEM_ANALYTICS.PREFETCH_START, {
    category: "events",
    total: totalItems,
  });
  
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

    track(SYSTEM_ANALYTICS.PREFETCH_COMPLETE, {
      category: "events",
      total: totalItems,
    });

    // Dismiss the progress toast and finalize (store version + reboot toast)
    toast.dismiss(toastId);
    finalizePrefetch(showVersionToast, server);
  } catch (error) {
    console.error('[Prefetch] Error during prefetch:', error);
    toast.error('Failed to cache assets', { id: toastId });
  }
}

/**
 * Persist the resolved version and (for updates) show the reboot toast.
 * Shared by the normal and network-skipped prefetch paths.
 */
function finalizePrefetch(
  showVersionToast: boolean,
  server: ServerVersion
): void {
  // Store version in app store so update detection settles
  storeVersion(server.version, server.buildNumber, server.buildTime);

  if (showVersionToast) {
    log.debug("Showing update toast", {
      version: server.version,
      buildNumber: server.buildNumber,
    });
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
  '/assets/splash/win98.gif',
  '/assets/splash/xp.png',
  '/assets/splash/xp-boot.gif',
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

// Max simultaneous prefetch requests. Bounded so the background warmup doesn't
// saturate the connection or contend with foreground app/network traffic.
const PREFETCH_CONCURRENCY = 8;

/**
 * Run an async task over items with a bounded concurrency pool.
 */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  const poolSize = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;
  const workers = Array.from({ length: poolSize }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await task(items[index]);
    }
  });
  await Promise.all(workers);
}

/**
 * Prefetch a list of URLs with progress tracking, bounded concurrency.
 */
async function prefetchUrlsWithProgress(
  urls: string[], 
  label: string,
  onProgress: (completed: number, total: number) => void,
  options?: { skipCache?: boolean }
): Promise<number> {
  let completed = 0;
  let succeeded = 0;
  const total = urls.length;

  await runWithConcurrency(urls, PREFETCH_CONCURRENCY, async (url) => {
    try {
      await abortableFetch(url, {
        method: 'GET',
        // Use 'reload' when skipCache is true (e.g., after cache clear on updates)
        // to bypass browser HTTP cache and fetch fresh from network.
        // Otherwise use 'default' to let browser decide (respects cache headers).
        cache: options?.skipCache ? 'reload' : 'default',
        timeout: 15000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      });
      succeeded++;
    } catch {
      // best-effort: count as attempted below regardless
    } finally {
      completed++;
      onProgress(completed, total);
    }
  });

  log.debug("Asset cache batch complete", {
    label,
    succeeded,
    total: urls.length,
  });
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
    const response = await abortableFetch('/icons/manifest.json', {
      method: 'GET',
      timeout: 15000,
      throwOnHttpError: false,
      retry: { maxAttempts: 1, initialDelayMs: 250 },
    });
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
 * Clear runtime (non-precache) caches so themed icons / sounds / data refresh
 * on update, while PRESERVING the Workbox precache (`workbox-precache-*`). This
 * keeps JS updates revision-efficient — only changed hashed chunks are fetched
 * by the new service worker — instead of nuking and re-downloading everything.
 */
async function clearRuntimeCaches(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    const cacheNames = await caches.keys();
    const runtimeCaches = cacheNames.filter(
      (name) => !name.startsWith('workbox-precache')
    );
    await Promise.all(runtimeCaches.map((name) => caches.delete(name)));
    log.debug("Cleared runtime caches; precache preserved", {
      runtimeCacheCount: runtimeCaches.length,
      runtimeCaches,
    });

    // Ask the service worker to check for an updated precache.
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      await registration?.update();
      log.debug("Service worker update triggered");
    }
  } catch (error) {
    console.warn('[Prefetch] Failed to clear runtime caches:', error);
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
  if (disposeUpdateCheckInterval) return; // Already running
  
  log.debug("Starting periodic update checks", {
    intervalSeconds: UPDATE_CHECK_INTERVAL / 1000,
  });
  
  // Paused while the tab is hidden; catches up immediately on return when a
  // check is overdue.
  disposeUpdateCheckInterval = createVisibilityGatedInterval(() => {
    log.debug("Periodic update check");
    void (async () => {
      await checkAndUpdate(false);
      // Also check for desktop updates during periodic checks
      await checkAndNotifyDesktopUpdate();
    })();
  }, UPDATE_CHECK_INTERVAL);
}

/**
 * Stop periodic update checking
 */
export function stopPeriodicUpdateCheck(): void {
  if (disposeUpdateCheckInterval) {
    disposeUpdateCheckInterval();
    disposeUpdateCheckInterval = null;
    log.debug("Stopped periodic update checks");
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
    clearStaleReload();
  }
  
  const runPrefetchFlow = async () => {
    // Safety net: bail out if we're stuck in a reload loop
    if (isInReloadLoop()) {
      console.warn('[Prefetch] Reload loop detected, skipping update check');
      startPeriodicUpdateCheck();
      return;
    }

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
