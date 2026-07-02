import {
  Suspense,
  type ComponentType,
  useCallback,
  useEffect,
  useState,
} from "react";
import type { AppProps } from "@/apps/base/types";
import { AppChunkUnavailableView } from "@/components/errors/AppChunkUnavailableView";
import type { AppId } from "@/config/appRegistryData";
import { getSnapshot as getOfflineSnapshot, useOffline } from "@/hooks/useOffline";
import { ensureCurrentLanguageResources } from "@/lib/i18n";
import { isRecoverableChunkLoadError } from "@/utils/chunkLoadErrors";
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
    void loader().catch(() => undefined);
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

type AppModule<T> = {
  default: ComponentType<AppProps<T>>;
};

type AppLoadState<T> =
  | { status: "loading" }
  | { status: "ready"; module: AppModule<T> }
  | {
      status: "unavailable";
      error: unknown;
      failedWhileOffline: boolean;
      isRetrying: boolean;
    }
  | { status: "failed"; error: unknown };

// Helper to create a retryable, lazy-loaded component.
// Uses a cache to maintain stable component references across HMR.
export function createLazyComponent<T = unknown>(
  importFn: () => Promise<AppModule<T>>,
  cacheKey: AppId
): ComponentType<AppProps<T>> {
  // Return cached component if it exists (prevents HMR issues)
  const cached = lazyComponentCache.get(cacheKey);
  if (cached) {
    return cached as ComponentType<AppProps<T>>;
  }

  const loadApp = async () => {
    const languageResources = ensureCurrentLanguageResources().catch(
      (error: unknown) => {
        if (!getOfflineSnapshot()) {
          throw error;
        }
      }
    );
    const [appModule] = await Promise.all([
      importFn(),
      languageResources,
    ]);
    return appModule;
  };

  appChunkLoaders.set(cacheKey, loadApp);

  const WrappedComponent = (props: AppProps<T>) => {
    const isOffline = useOffline();
    const [attempt, setAttempt] = useState(0);
    const [loadState, setLoadState] = useState<AppLoadState<T>>({
      status: "loading",
    });
    const retry = useCallback(() => {
      setAttempt((currentAttempt) => currentAttempt + 1);
    }, []);

    useEffect(() => {
      let isCurrentAttempt = true;
      setLoadState((currentState) =>
        currentState.status === "unavailable"
          ? { ...currentState, isRetrying: true }
          : { status: "loading" }
      );

      void loadApp()
        .then((module) => {
          if (isCurrentAttempt) {
            setLoadState({ status: "ready", module });
          }
        })
        .catch((error: unknown) => {
          if (!isCurrentAttempt) return;

          const failedWhileOffline = getOfflineSnapshot();
          if (
            isRecoverableChunkLoadError({
              error,
              offline: failedWhileOffline,
            })
          ) {
            setLoadState({
              status: "unavailable",
              error,
              failedWhileOffline,
              isRetrying: false,
            });
            return;
          }

          setLoadState({ status: "failed", error });
        });

      return () => {
        isCurrentAttempt = false;
      };
    }, [attempt]);

    useEffect(() => {
      if (
        loadState.status === "unavailable" &&
        loadState.failedWhileOffline &&
        !isOffline &&
        !loadState.isRetrying
      ) {
        retry();
      }
    }, [isOffline, loadState, retry]);

    if (loadState.status === "failed") {
      throw loadState.error;
    }

    if (loadState.status === "unavailable") {
      return (
        <>
          <AppChunkUnavailableView
            {...props}
            appId={cacheKey}
            isOffline={isOffline}
            isRetrying={loadState.isRetrying}
            onRetry={retry}
          />
          <LazyLoadSignal instanceId={props.instanceId} />
        </>
      );
    }

    if (loadState.status === "loading") {
      return null;
    }

    const LoadedComponent = loadState.module.default;
    return (
      <Suspense fallback={null}>
        <LoadedComponent {...props} />
        <LazyLoadSignal instanceId={props.instanceId} />
      </Suspense>
    );
  };
  WrappedComponent.displayName = `LazyApp(${cacheKey})`;

  // Cache the component
  lazyComponentCache.set(
    cacheKey,
    WrappedComponent as ComponentType<AppProps<unknown>>
  );

  return WrappedComponent;
}
