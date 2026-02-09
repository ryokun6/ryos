import { lazy, Suspense, type ComponentType } from "react";
import type { AppProps } from "@/apps/base/types";
import { LazyLoadSignal } from "./LazyLoadSignal";

// Cache for lazy components to maintain stable references across HMR
const lazyComponentCache = new Map<string, ComponentType<AppProps<unknown>>>();

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

  const LazyComponent = lazy(importFn);

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
