import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";
import { useThemeStore } from "./stores/useThemeStore";
import { useLanguageStore } from "./stores/useLanguageStore";
import { preloadFileSystemData } from "./stores/useFilesStore";
import { preloadIpodData } from "./stores/useIpodStore";
import { initPrefetch } from "./utils/prefetch";
import { initializeI18n } from "./lib/i18n";
import { primeReactResources } from "./lib/reactResources";
import { initializeAnalytics } from "./utils/analytics";

// Prime React 19 resource hints before anything else runs
primeReactResources();

// ============================================================================
// POST-RECOVERY CLEANUP — must run synchronously before any imports can fail
//
// After a stale-bundle recovery redirect (URL contains ?_cb=), clear the
// cooldown flag immediately so that if a *different* chunk still 404s on
// this fresh page load we get another recovery attempt instead of bailing
// out due to the previous page's cooldown.  The prefetch module also does
// this, but it runs later (after async i18n init), which is too late if a
// lazy chunk fails during early bootstrap.
// ============================================================================
try {
  if (new URL(window.location.href).searchParams.has("_cb")) {
    sessionStorage.removeItem("ryos-stale-reload");
  }
} catch {
  // URL parsing or sessionStorage may throw in edge cases
}

// ============================================================================
// CHUNK LOAD ERROR HANDLING - Reload when old assets 404 after deployment
//
// Vite wraps dynamic imports with a preload helper that catches 404s and
// dispatches "vite:preloadError" instead of letting them become unhandled
// rejections. This means the index.html stale-bundle detection (which
// listens for unhandledrejection) never fires for lazy-loaded chunks.
//
// We must do the FULL recovery here: clear Cache Storage, unregister the
// service worker, then redirect with a cache-busting param — identical to
// what index.html does for script-tag errors.  A bare reload() would just
// serve the same stale SW-cached HTML/JS again, hit the 10 s cooldown,
// and leave a blank page.
// ============================================================================
let isPreloadReloading = false;

const handlePreloadError = (event: Event) => {
  console.warn("[ryOS] Chunk load failed:", event);

  if (isPreloadReloading) return;

  if (!navigator.onLine) {
    console.warn("[ryOS] Skipping reload - device is offline");
    return;
  }

  // Counter-based loop guard (shared with index.html and prefetch.ts)
  const countKey = "ryos:reload-count";
  const windowKey = "ryos:reload-window-start";
  try {
    const now = Date.now();
    const count = parseInt(sessionStorage.getItem(countKey) || "0", 10);
    const wStart = parseInt(sessionStorage.getItem(windowKey) || "0", 10);
    if (wStart && now - wStart <= 60000 && count >= 3) {
      console.warn("[ryOS] Too many reloads (" + count + "), stopping to prevent loop");
      return;
    }
    if (!wStart || now - wStart > 60000) {
      sessionStorage.setItem(windowKey, String(now));
      sessionStorage.setItem(countKey, "1");
    } else {
      sessionStorage.setItem(countKey, String(count + 1));
    }
  } catch {
    // sessionStorage may throw
  }

  const reloadKey = "ryos-stale-reload";
  const lastReload = sessionStorage.getItem(reloadKey);
  const now = Date.now();

  if (lastReload && now - parseInt(lastReload, 10) < 10000) {
    console.warn("[ryOS] Recently reloaded for stale bundle, skipping to prevent loop");
    return;
  }

  isPreloadReloading = true;
  sessionStorage.setItem(reloadKey, String(now));
  console.log("[ryOS] Stale chunk detected — clearing caches and reloading...");

  const doNavigate = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("_cb", String(Date.now()));
    window.location.replace(url.toString());
  };

  const unregisterAndNavigate = () => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => (reg ? reg.unregister() : undefined))
        .then(() => doNavigate())
        .catch(() => doNavigate());
    } else {
      doNavigate();
    }
  };

  if (typeof caches !== "undefined") {
    caches
      .keys()
      .then((names) => Promise.all(names.map((n) => caches.delete(n))))
      .then(() => unregisterAndNavigate())
      .catch(() => unregisterAndNavigate());
  } else {
    unregisterAndNavigate();
  }
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

const renderApp = () => {
  initializeAnalytics();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
};

const bootstrap = async () => {
  try {
    await initializeI18n();
  } catch (error) {
    console.error("[ryOS] Failed to initialize i18n during bootstrap:", error);
  }

  // Hydrate theme and language from localStorage before rendering
  useThemeStore.getState().hydrate();

  try {
    await useLanguageStore.getState().hydrate();
  } catch (error) {
    console.error("[ryOS] Failed to hydrate language store:", error);
  }

  // ============================================================================
  // PREFETCHING - Cache icons, sounds, and app components after boot
  // This runs during idle time to populate the service worker cache
  // ============================================================================
  initPrefetch();

  renderApp();
};

void bootstrap();
