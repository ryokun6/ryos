import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { Analytics } from "@vercel/analytics/react";
import "./index.css";
import { useThemeStore } from "./stores/useThemeStore";
import { useLanguageStore } from "./stores/useLanguageStore";
import { preloadFileSystemData } from "./stores/useFilesStore";
import { preloadIpodData } from "./stores/useIpodStore";
import { initPrefetch } from "./utils/prefetch";
import "./lib/i18n";
import { primeReactResources } from "./lib/reactResources";

// Prime React 19 resource hints before anything else runs
primeReactResources();

// ============================================================================
// CHUNK LOAD ERROR HANDLING - Reload when old assets 404 after deployment
// ============================================================================
const handlePreloadError = (event: Event) => {
  console.warn("[ryOS] Chunk load failed:", event);
  
  // Don't reload if offline - it won't help and will cause a flash loop
  if (!navigator.onLine) {
    console.warn("[ryOS] Skipping reload - device is offline");
    return;
  }
  
  // Use the same loop protection as index.html's stale bundle detection
  const reloadKey = "ryos-stale-reload";
  const lastReload = sessionStorage.getItem(reloadKey);
  const now = Date.now();
  
  // If we reloaded in the last 10 seconds, don't reload again
  if (lastReload && now - parseInt(lastReload, 10) < 10000) {
    console.warn("[ryOS] Recently reloaded for stale bundle, skipping to prevent loop");
    return;
  }
  
  // Mark that we're reloading
  sessionStorage.setItem(reloadKey, String(now));
  console.log("[ryOS] Reloading for fresh assets...");
  window.location.reload();
};

window.addEventListener("vite:preloadError", handlePreloadError);

// HMR cleanup - prevent listener stacking during development
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.removeEventListener("vite:preloadError", handlePreloadError);
  });
}

// ============================================================================
// PRELOADING - Start fetching JSON data early (non-blocking)
// These run in parallel before React even mounts
// ============================================================================
preloadFileSystemData();
preloadIpodData();

// ============================================================================
// PREFETCHING - Cache icons, sounds, and app components after boot
// This runs during idle time to populate the service worker cache
// ============================================================================
initPrefetch();

// Hydrate theme and language from localStorage before rendering
useThemeStore.getState().hydrate();
useLanguageStore.getState().hydrate();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <Analytics />
  </React.StrictMode>
);
