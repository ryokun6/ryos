import { lazy, Suspense, type ComponentType } from "react";
import type { AppProps } from "@/apps/base/types";
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

function LazyAppFallback({ title }: { title?: string }) {
  return (
    <div
      className="pointer-events-auto flex min-h-[180px] w-[320px] max-w-[calc(100vw-2rem)] items-center justify-center rounded-md border border-black/20 bg-white/90 p-4 text-sm text-neutral-700 shadow-xl backdrop-blur"
      role="status"
      aria-live="polite"
    >
      Loading {title || "app"}...
    </div>
  );
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

  appChunkLoaders.set(cacheKey, importFn);

  const LazyComponent = lazy(importFn);

  // Wrap with Suspense to handle loading state
  const WrappedComponent = (props: AppProps<T>) => (
    <Suspense fallback={<LazyAppFallback title={props.title} />}>
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
