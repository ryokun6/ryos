/**
 * Prefetch utility for caching assets after initial boot
 * This runs during idle time to cache icons, sounds, and app components
 * without blocking the initial page load.
 */

import { toast } from "sonner";
import { createElement } from "react";
import { PrefetchToast } from "@/components/shared/PrefetchToast";
import { BUILD_VERSION } from "@/config/buildVersion";

// Storage key for tracking prefetch status
const PREFETCH_KEY = 'ryos-prefetch-version';
// Use build version - automatically updates on each build
const PREFETCH_VERSION = BUILD_VERSION;

/**
 * Clear the prefetch flag to force re-prefetch on next boot
 * Call this when resetting settings or formatting file system
 */
export function clearPrefetchFlag(): void {
  try {
    localStorage.removeItem(PREFETCH_KEY);
    console.log('[Prefetch] Flag cleared, will re-prefetch on next boot');
  } catch {
    // localStorage might not be available
  }
}

// App component chunks to prefetch (these are the lazy-loaded app bundles)
const APP_COMPONENT_PATTERNS = [
  'ChatsAppComponent',
  'FinderAppComponent',
  'InternetExplorerAppComponent',
  'IpodAppComponent',
  'MinesweeperAppComponent',
  'PaintAppComponent',
  'PhotoBoothComponent',
  'SoundboardAppComponent',
  'SynthAppComponent',
  'TerminalAppComponent',
  'TextEditAppComponent',
  'VideosAppComponent',
  'ControlPanelsAppComponent',
  'AppletViewerAppComponent',
  'PcAppComponent',
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

/**
 * Get all icon URLs from the icon manifest
 */
async function getIconUrls(): Promise<string[]> {
  try {
    const response = await fetch('/icons/manifest.json');
    if (!response.ok) return [];
    
    const manifest = await response.json();
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
  } catch (error) {
    console.warn('[Prefetch] Failed to load icon manifest:', error);
    return [];
  }
}

/**
 * Get all UI sound URLs
 */
function getSoundUrls(): string[] {
  return UI_SOUNDS.map(sound => `/sounds/${sound}`);
}

/**
 * Discover app component chunks by fetching the main bundle and parsing for dynamic imports
 */
async function discoverAppComponentChunks(): Promise<string[]> {
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
    
    // Dedupe
    const uniqueAssets = [...new Set(allAssets)];
    
    // Filter to only app component chunks
    const appChunks = uniqueAssets.filter(url => 
      APP_COMPONENT_PATTERNS.some(pattern => url.includes(pattern))
    );
    
    console.log(`[Prefetch] Discovered ${appChunks.length} app component chunks from main bundle`);
    return appChunks;
    
  } catch (error) {
    console.warn('[Prefetch] Failed to discover app chunks:', error);
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
  
  // Gather all URLs first
  const [iconUrls, componentUrls] = await Promise.all([
    getIconUrls(),
    discoverAppComponentChunks(),
  ]);
  const soundUrls = getSoundUrls();
  
  const totalItems = iconUrls.length + soundUrls.length + componentUrls.length;
  
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
    
    // Prefetch app components
    if (componentUrls.length > 0) {
      const baseCompleted = overallCompleted;
      await prefetchUrlsWithProgress(componentUrls, 'App Components', (completed, total) => {
        overallCompleted = baseCompleted + completed;
        updateToast('components', completed, total);
      });
    }
    
    // Mark as complete and show success toast
    markPrefetchComplete();
    toast.success('Assets cached for offline use', {
      id: toastId,
      duration: 2000,
    });
    
  } catch (error) {
    console.error('[Prefetch] Error during prefetch:', error);
    toast.dismiss(toastId);
  }
}

/**
 * Initialize prefetching after the app has loaded
 */
export function initPrefetch(): void {
  if (document.readyState === 'complete') {
    setTimeout(prefetchAssets, 3000);
  } else {
    window.addEventListener('load', () => {
      setTimeout(prefetchAssets, 3000);
    }, { once: true });
  }
}
