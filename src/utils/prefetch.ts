/**
 * Prefetch utility for caching assets after initial boot
 * This runs during idle time to cache icons, sounds, and app components
 * without blocking the initial page load.
 */

import { toast } from "sonner";
import { createElement } from "react";
import { PrefetchToast, PrefetchCompleteToast } from "@/components/shared/PrefetchToast";
import { COMMIT_SHA_SHORT } from "@/config/buildVersion";

// Storage keys for tracking prefetch status
const PREFETCH_KEY = 'ryos-prefetch-version';
const MANIFEST_KEY = 'ryos-manifest-timestamp';
const LAST_KNOWN_VERSION_KEY = 'ryos-last-known-version';
// Use commit SHA - automatically updates on each deployment
const PREFETCH_VERSION = COMMIT_SHA_SHORT;

/**
 * Check if there's a new version available (current build differs from last known)
 */
function checkForNewVersion(): boolean {
  try {
    const lastKnownVersion = localStorage.getItem(LAST_KNOWN_VERSION_KEY);
    // If no stored version, this is first run - not an "update"
    if (!lastKnownVersion) {
      localStorage.setItem(LAST_KNOWN_VERSION_KEY, COMMIT_SHA_SHORT);
      return false;
    }
    // Check if version changed
    const hasUpdate = lastKnownVersion !== COMMIT_SHA_SHORT;
    if (hasUpdate) {
      console.log(`[Prefetch] New version detected: ${lastKnownVersion} -> ${COMMIT_SHA_SHORT}`);
    }
    return hasUpdate;
  } catch {
    return false;
  }
}

/**
 * Update the stored version after reload/update
 */
function updateStoredVersion(): void {
  try {
    localStorage.setItem(LAST_KNOWN_VERSION_KEY, COMMIT_SHA_SHORT);
  } catch {
    // localStorage might not be available
  }
}

/**
 * Reload the page to apply updates
 */
function reloadPage(): void {
  updateStoredVersion();
  window.location.reload();
}

/**
 * Clear the prefetch flag to force re-prefetch on next boot
 * Call this when resetting settings or formatting file system
 */
export function clearPrefetchFlag(): void {
  try {
    localStorage.removeItem(PREFETCH_KEY);
    localStorage.removeItem(MANIFEST_KEY);
    console.log('[Prefetch] Flag cleared, will re-prefetch on next boot');
  } catch {
    // localStorage might not be available
  }
}

/**
 * Force clear all caches and immediately re-prefetch with toast
 * Use this for manual "Reset System Cache" action
 * This bypasses service worker checks and always shows the toast
 */
export async function forceRefreshCache(): Promise<void> {
  console.log('[Prefetch] Force refresh triggered...');
  
  // Clear all flags first
  try {
    localStorage.removeItem(PREFETCH_KEY);
    localStorage.removeItem(MANIFEST_KEY);
  } catch {
    // Continue even if localStorage fails
  }
  
  // Clear service worker caches
  try {
    const cacheNames = await caches.keys();
    const swCaches = cacheNames.filter(name => 
      SW_CACHE_NAMES.some(swName => name.includes(swName))
    );
    await Promise.all(swCaches.map(name => caches.delete(name)));
    console.log(`[Prefetch] Force cleared ${swCaches.length} caches`);
  } catch (error) {
    console.warn('[Prefetch] Failed to clear caches:', error);
  }
  
  // Run prefetch logic directly (bypassing service worker checks)
  await runPrefetchWithToast();
}

/**
 * Run the prefetch logic with toast - used by forceRefreshCache
 * This bypasses service worker requirement checks
 */
async function runPrefetchWithToast(): Promise<void> {
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
    
    // Mark as complete and store manifest timestamp
    markPrefetchComplete();
    storeManifestTimestamp(manifest);
    
    // Show completion toast with reload button
    toast.success(
      createElement(PrefetchCompleteToast, {
        hasUpdate: false,
        onReload: reloadPage,
      }),
      {
        id: toastId,
        duration: 5000,
      }
    );
    
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
 * Check if manifest has been updated since last prefetch
 */
function isManifestUpdated(manifest: IconManifest): boolean {
  try {
    const storedTimestamp = localStorage.getItem(MANIFEST_KEY);
    return storedTimestamp !== manifest.generatedAt;
  } catch {
    return true; // Assume updated if we can't check
  }
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
 * Check if prefetching has already been completed
 */
function isPrefetchComplete(): boolean {
  try {
    return localStorage.getItem(PREFETCH_KEY) === PREFETCH_VERSION;
  } catch {
    return false;
  }
}

/**
 * Mark prefetching as complete
 */
function markPrefetchComplete(): void {
  try {
    localStorage.setItem(PREFETCH_KEY, PREFETCH_VERSION);
  } catch {
    // localStorage might not be available
  }
}

/**
 * Main prefetch function with progress toast
 */
export async function prefetchAssets(): Promise<void> {
  // Skip if already prefetched this version
  if (isPrefetchComplete()) {
    console.log('[Prefetch] Already completed, skipping');
    return;
  }
  
  // Only run if service worker is active
  if (!('serviceWorker' in navigator)) {
    console.log('[Prefetch] Service worker not available, skipping');
    return;
  }
  
  // Wait for service worker to be ready
  const registration = await navigator.serviceWorker.ready;
  if (!registration.active) {
    console.log('[Prefetch] No active service worker, skipping');
    return;
  }
  
  console.log('[Prefetch] Starting background prefetch...');
  
  // Fetch manifest first to check if assets have changed
  const manifest = await fetchIconManifest();
  if (!manifest) {
    console.log('[Prefetch] Could not fetch manifest, skipping');
    return;
  }
  
  // Only clear caches if manifest has been updated
  if (isManifestUpdated(manifest)) {
    console.log('[Prefetch] Manifest updated, clearing old caches...');
    await clearSwCaches();
  } else {
    console.log('[Prefetch] Manifest unchanged, keeping existing caches');
  }
  
  // Gather all URLs
  const iconUrls = getIconUrlsFromManifest(manifest);
  const jsUrls = await discoverAllJsChunks();
  const soundUrls = getSoundUrls();
  
  const totalItems = iconUrls.length + soundUrls.length + jsUrls.length;
  
  if (totalItems === 0) {
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
    
    // Mark as complete and store manifest timestamp
    markPrefetchComplete();
    storeManifestTimestamp(manifest);
    
    // Check if there's a new version available
    const hasUpdate = checkForNewVersion();
    
    // Show completion toast with reload button
    toast.success(
      createElement(PrefetchCompleteToast, {
        hasUpdate,
        onReload: reloadPage,
      }),
      {
        id: toastId,
        duration: hasUpdate ? 10000 : 5000, // Longer duration if update available
      }
    );
    
  } catch (error) {
    console.error('[Prefetch] Error during prefetch:', error);
    toast.dismiss(toastId);
  }
}

/**
 * Check for updates by fetching the latest index.html and comparing build version
 * This fetches fresh from the server to detect new deployments
 */
async function checkForUpdatesRemote(): Promise<boolean> {
  try {
    // Fetch index.html with cache-busting to get the latest version
    const response = await fetch('/index.html', {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) return false;
    
    const html = await response.text();
    
    // Find the main bundle hash in the HTML
    // The main bundle looks like: /assets/index-XXXX.js
    const bundleMatch = html.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/);
    if (!bundleMatch) return false;
    
    const remoteBundleHash = bundleMatch[1];
    
    // Get current page's bundle hash
    const scripts = document.querySelectorAll('script[src*="/assets/index-"]');
    for (const script of scripts) {
      const src = script.getAttribute('src') || '';
      const currentMatch = src.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/);
      if (currentMatch) {
        const currentBundleHash = currentMatch[1];
        if (currentBundleHash !== remoteBundleHash) {
          console.log(`[Prefetch] Remote update detected: ${currentBundleHash} -> ${remoteBundleHash}`);
          return true;
        }
      }
    }
    
    return false;
  } catch (error) {
    console.warn('[Prefetch] Failed to check for remote updates:', error);
    return false;
  }
}

/**
 * Show update available toast with reload button
 */
function showUpdateToast(): void {
  toast.info(
    createElement(PrefetchCompleteToast, {
      hasUpdate: true,
      onReload: reloadPage,
    }),
    {
      id: 'update-available',
      duration: 15000,
    }
  );
}

/**
 * Periodically check for updates (every 5 minutes)
 */
let updateCheckInterval: ReturnType<typeof setInterval> | null = null;

function startUpdateChecker(): void {
  // Check immediately on start (after a short delay)
  setTimeout(async () => {
    const hasUpdate = await checkForUpdatesRemote();
    if (hasUpdate) {
      showUpdateToast();
    }
  }, 10000); // Wait 10 seconds after load
  
  // Then check every 5 minutes
  updateCheckInterval = setInterval(async () => {
    const hasUpdate = await checkForUpdatesRemote();
    if (hasUpdate) {
      showUpdateToast();
      // Stop checking once we've detected an update
      if (updateCheckInterval) {
        clearInterval(updateCheckInterval);
        updateCheckInterval = null;
      }
    }
  }, 5 * 60 * 1000); // 5 minutes
}

/**
 * Initialize prefetching after the app has loaded
 */
export function initPrefetch(): void {
  if (document.readyState === 'complete') {
    setTimeout(prefetchAssets, 3000);
    startUpdateChecker();
  } else {
    window.addEventListener('load', () => {
      setTimeout(prefetchAssets, 3000);
      startUpdateChecker();
    }, { once: true });
  }
}
