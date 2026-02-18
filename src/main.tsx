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
// Delegates to index.html's stale bundle logic (cache clear, SW unregister)
// ============================================================================
const handlePreloadError = () => {
  console.warn("[ryOS] Chunk load failed, triggering stale-bundle reload");
  window.dispatchEvent(new Event("ryos-stale-bundle"));
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
