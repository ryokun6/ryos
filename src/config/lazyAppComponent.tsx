import { lazy, Suspense, useState, type ComponentType } from "react";
import type { AppProps } from "@/apps/base/types";
import { ensureCurrentLanguageResources } from "@/lib/i18n";
import { LazyLoadSignal } from "./LazyLoadSignal";
import { loadLazyModuleWithRetry } from "./lazyModuleRetry";

// Cache for lazy components to maintain stable references across HMR.
// `var` so a circular import during startup sees the binding instead of a
// temporal-dead-zone throw. The map is created on first use.
var lazyComponentCache: Map<string, ComponentType<AppProps<unknown>>> | undefined;

function getLazyComponentCache() {
  lazyComponentCache ??= new Map();
  return lazyComponentCache;
}

/** Dynamic import functions registered per app id for intent-based prefetch. */
var appChunkLoaders: Map<string, () => Promise<unknown>> | undefined;

function getAppChunkLoaders() {
  appChunkLoaders ??= new Map();
  return appChunkLoaders;
}

/**
 * Start loading an app chunk before the window mounts (dock/desktop intent).
 */
export function prefetchAppChunk(appId: string): void {
  const loader = getAppChunkLoaders().get(appId);
  if (loader) {
    void loader();
  }
}

/** After boot, warm up to three distinct app chunks from a recent-app list (MRU order). */
export function prefetchLikelyAppChunks(appIds: readonly string[]): void {
  const seen = new Set<string>();
  for (const id of appIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    prefetchAppChunk(id);
    if (seen.size >= 3) break;
  }
}

// Helper to create a lazy-loaded component with Suspense
// Uses a cache to maintain stable component references across HMR
export function createLazyComponent<T = unknown>(
  importFn: () => Promise<{ default: ComponentType<AppProps<T>> }>,
  cacheKey: string
): ComponentType<AppProps<T>> {
  // Return cached component if it exists (prevents HMR issues)
  const cached = getLazyComponentCache().get(cacheKey);
  if (cached) {
    return cached as ComponentType<AppProps<T>>;
  }

  const loadApp = () =>
    loadLazyModuleWithRetry(async () => {
      const [appModule] = await Promise.all([
        importFn(),
        ensureCurrentLanguageResources(),
      ]);
      return appModule;
    });

  getAppChunkLoaders().set(cacheKey, loadApp);

  // A new lazy() per mount. React.lazy caches a rejected import forever, so a
  // failed HMR fetch would make every relaunch throw the same error.
  const WrappedComponent = (props: AppProps<T>) => {
    const [LazyComponent] = useState(() => lazy(loadApp));
    return (
      <Suspense fallback={null}>
        <LazyComponent {...props} />
        <LazyLoadSignal instanceId={props.instanceId} />
      </Suspense>
    );
  };

  // Cache the component
  getLazyComponentCache().set(
    cacheKey,
    WrappedComponent as ComponentType<AppProps<unknown>>
  );

  return WrappedComponent;
}
