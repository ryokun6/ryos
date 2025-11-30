/**
 * Prefetch utility for caching assets after initial boot
 * This runs during idle time to cache icons, sounds, and app components
 * without blocking the initial page load.
 */

import { toast } from "sonner";
import { createElement } from "react";
import { PrefetchToast, PrefetchCompleteToast } from "@/components/shared/PrefetchToast";
import { BUILD_VERSION, COMMIT_SHA_SHORT } from "@/config/buildVersion";

// Storage keys for tracking prefetch status
const PREFETCH_KEY = 'ryos-prefetch-version';
const MANIFEST_KEY = 'ryos-manifest-timestamp';
// Use commit SHA - automatically updates on each deployment
const PREFETCH_VERSION = COMMIT_SHA_SHORT;

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
    localStorage.removeItem(PREFETCH_KEY);
    localStorage.removeItem(MANIFEST_KEY);
    console.log('[Prefetch] Flag cleared, will re-prefetch on next boot');
  } catch {
    // localStorage might not be available
  }
}

/**
 * Force clear all caches and immediately re-prefetch with toast
 * Use this for manual "Check for Updates" action
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
        version: BUILD_VERSION,
        buildNumber: COMMIT_SHA_SHORT,
      }),
      {
        id: toastId,
        duration: 5000,
        action: {
          label: "Reload",
          onClick: reloadPage,
        },
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
 * Check if prefetching has already been completed for the current version
 */
function isPrefetchComplete(): boolean {
  try {
    return localStorage.getItem(PREFETCH_KEY) === PREFETCH_VERSION;
  } catch {
    return false;
  }
}

/**
 * Check if version has changed (first time or new version)
 */
function hasVersionChanged(): boolean {
  try {
    const storedVersion = localStorage.getItem(PREFETCH_KEY);
    // First time: no stored version
    if (!storedVersion) {
      return true;
    }
    // Version changed: stored version doesn't match current version
    return storedVersion !== PREFETCH_VERSION;
  } catch {
    return true; // Assume changed if we can't check
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
 * Handles both first-time prefetch and version updates
 */
export async function prefetchAssets(): Promise<void> {
  // Skip if already prefetched this version
  if (isPrefetchComplete()) {
    console.log('[Prefetch] Already completed for this version, skipping');
    return;
  }
  
  // Check if version changed (first time or new version)
  const versionChanged = hasVersionChanged();
  
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
  
  if (versionChanged) {
    console.log('[Prefetch] Version changed, clearing caches and starting prefetch...');
    // Clear caches when version changes to ensure fresh prefetch
    await clearSwCaches();
  } else {
    console.log('[Prefetch] Starting background prefetch...');
  }
  
  // Fetch manifest first to check if assets have changed
  const manifest = await fetchIconManifest();
  if (!manifest) {
    console.log('[Prefetch] Could not fetch manifest, skipping');
    return;
  }
  
  // If version didn't change but manifest updated, clear caches
  if (!versionChanged && isManifestUpdated(manifest)) {
    console.log('[Prefetch] Manifest updated, clearing old caches...');
    await clearSwCaches();
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
  
  // Only show toast if version changed
  let toastId: string | number | undefined;
  if (versionChanged) {
    // Create a toast with progress
    toastId = toast.loading(
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
  }
  
  const updateToast = (phase: string, phaseCompleted: number, phaseTotal: number) => {
    if (!versionChanged || !toastId) return;
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
    
    // Only show completion toast if version changed
    if (versionChanged && toastId) {
      toast.success(
        createElement(PrefetchCompleteToast, {
          version: BUILD_VERSION,
          buildNumber: COMMIT_SHA_SHORT,
        }),
        {
          id: toastId,
          duration: 5000,
          action: {
            label: "Reload",
            onClick: reloadPage,
          },
        }
      );
    }
    
  } catch (error) {
    console.error('[Prefetch] Error during prefetch:', error);
    if (toastId) {
      toast.dismiss(toastId);
    }
  }
}

// Flag to prevent concurrent prefetch operations
let isPrefetchInProgress = false;

/**
 * Check if a newer version is available by fetching index.html without cache
 * This runs on every app load to detect updates even if the user has cached assets
 * Returns true if an update was found and triggered
 */
async function checkForVersionUpdate(): Promise<boolean> {
  try {
    // Fetch index.html without cache to get the latest version
    const response = await fetch('/index.html', { 
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
      }
    });
    
    if (!response.ok) {
      console.log('[Prefetch] Could not fetch index.html for version check');
      return false;
    }
    
    const html = await response.text();
    
    // Extract the main bundle hash from the HTML
    // The bundle looks like: /assets/index-XXXX.js
    const bundleMatch = html.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/);
    if (!bundleMatch || !bundleMatch[1]) {
      console.log('[Prefetch] Could not find bundle hash in index.html');
      return false;
    }
    
    const serverBundleHash = bundleMatch[1];
    
    // Get the current bundle hash from the running app
    // We can find this by checking the script tags that are already loaded
    const currentScripts = Array.from(document.querySelectorAll('script[src*="/assets/index-"]'));
    const currentBundleMatch = currentScripts[0]?.getAttribute('src')?.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/);
    const currentBundleHash = currentBundleMatch?.[1];
    
    if (!currentBundleHash) {
      console.log('[Prefetch] Could not determine current bundle hash');
      return false;
    }
    
    console.log(`[Prefetch] Version check: current=${currentBundleHash}, server=${serverBundleHash}`);
    
    // If the hashes are different, a new version is available
    if (serverBundleHash !== currentBundleHash) {
      console.log('[Prefetch] New version detected, triggering update...');
      // Clear the prefetch flag to force re-prefetch
      clearPrefetchFlag();
      // Run the prefetch with toast to show update progress
      isPrefetchInProgress = true;
      try {
        await runPrefetchWithToast();
      } finally {
        isPrefetchInProgress = false;
      }
      return true;
    } else {
      console.log('[Prefetch] Already running latest version');
      return false;
    }
  } catch (error) {
    console.warn('[Prefetch] Version check failed:', error);
    return false;
  }
}

/**
 * Initialize prefetching after the app has loaded
 * Checks for new versions without cache on every load, then handles first-time prefetch
 */
export function initPrefetch(): void {
  const runPrefetchFlow = async () => {
    // First, check for version updates without cache
    const updateTriggered = await checkForVersionUpdate();
    
    // If an update was already triggered, skip the regular prefetch
    if (updateTriggered) {
      console.log('[Prefetch] Update already triggered, skipping regular prefetch');
      return;
    }
    
    // If no update was triggered and no prefetch is in progress, run regular prefetch
    // This handles first-time users or users whose localStorage was cleared
    if (!isPrefetchInProgress) {
      await prefetchAssets();
    }
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
