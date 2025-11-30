import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { Analytics } from "@vercel/analytics/react";
import "./index.css";
import { useThemeStore } from "./stores/useThemeStore";
import { preloadFileSystemData } from "./stores/useFilesStore";
import { preloadIpodData } from "./stores/useIpodStore";
import { initPrefetch } from "./utils/prefetch";

// ============================================================================
// CHUNK LOAD ERROR HANDLING - Reload when old assets 404 after deployment
// ============================================================================
window.addEventListener("vite:preloadError", (event) => {
  console.warn("[ryOS] Chunk load failed, reloading for fresh assets...", event);
  window.location.reload();
});

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

// Hydrate theme from localStorage before rendering
useThemeStore.getState().hydrate();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <Analytics />
  </React.StrictMode>
);
