import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";
import { useThemeStore } from "./stores/useThemeStore";
import { useLanguageStore } from "./stores/useLanguageStore";
import { preloadIpodData } from "./stores/ipodPreload";
import { initPrefetch } from "./utils/prefetch";
import { initializeI18nForFirstPaint } from "./lib/i18n";
import { primeReactResources } from "./lib/reactResources";
import { initializeAnalytics, track, SYSTEM_ANALYTICS } from "./utils/analytics";
import {
  isInReloadLoop,
  trackReload,
  isStaleReloadOnCooldown,
  markStaleReload,
  clearStaleReload,
} from "./utils/reloadGuard";

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
    clearStaleReload();
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
    // Offline + chunk missing means the chunk wasn't precached/cached. Don't
    // reload (it can't help offline); just record it so we can tune what we
    // precache. Most chunks are precached by the service worker now.
    console.warn("[ryOS] Skipping reload - device is offline");
    track(SYSTEM_ANALYTICS.OFFLINE_CHUNK_FAILURE, { category: "errors" });
    return;
  }

  // Shared reload-loop + cooldown guards (see utils/reloadGuard).
  if (isInReloadLoop()) {
    console.warn("[ryOS] Too many reloads, stopping to prevent loop");
    return;
  }
  trackReload();

  if (isStaleReloadOnCooldown()) {
    console.warn("[ryOS] Recently reloaded for stale bundle, skipping to prevent loop");
    return;
  }

  isPreloadReloading = true;
  markStaleReload();
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

const scheduleIdleWork = (fn: () => void, timeoutMs = 2500) => {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(() => fn(), { timeout: timeoutMs });
  } else {
    setTimeout(fn, 0);
  }
};

const renderApp = () => {
  initializeAnalytics();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
};

const bootstrap = async () => {
  // Theme attributes for first paint (before React)
  useThemeStore.getState().hydrate();

  try {
    await initializeI18nForFirstPaint();
  } catch (error) {
    console.error("[ryOS] Failed to initialize i18n during bootstrap:", error);
  }

  useLanguageStore.getState().hydrate();

  renderApp();

  // Non-critical network work after first paint so it does not compete with
  // the initial JS/CSS/i18n critical path.
  scheduleIdleWork(() => {
    preloadIpodData();
    initPrefetch();
  });
};

void bootstrap();
