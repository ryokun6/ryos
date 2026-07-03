import { lazy, Suspense, type ComponentType } from "react";
import type { AppProps } from "@/apps/base/types";
import { ensureCurrentLanguageResources } from "@/lib/i18n";
import { LazyLoadSignal } from "./LazyLoadSignal";

// Cache for lazy components to maintain stable references across HMR
const lazyComponentCache = new Map<string, ComponentType<AppProps<unknown>>>();

/** Dynamic import functions registered per app id for intent-based prefetch. */
const appChunkLoaders = new Map<string, () => Promise<unknown>>();

/**
 * Start loading an app chunk before the window mounts (dock/desktop intent).
 */
export function prefetchAppChunk(appId: string): void {
  const loader = appChunkLoaders.get(appId);
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
  const cached = lazyComponentCache.get(cacheKey);
  if (cached) {
    return cached as ComponentType<AppProps<T>>;
  }

  const loadApp = async () => {
    const [appModule] = await Promise.all([
      importFn(),
      ensureCurrentLanguageResources(),
    ]);
    return appModule;
  };

  appChunkLoaders.set(cacheKey, loadApp);

  const LazyComponent = lazy(loadApp);

  // Wrap with Suspense to handle loading state
  const WrappedComponent = (props: AppProps<T>) => (
    <Suspense fallback={null}>
      <LazyComponent {...props} />
      <LazyLoadSignal instanceId={props.instanceId} />
    </Suspense>
  );

  // Cache the component
  lazyComponentCache.set(
    cacheKey,
    WrappedComponent as ComponentType<AppProps<unknown>>
  );

  return WrappedComponent;
}
