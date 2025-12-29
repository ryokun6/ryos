import { useState, useRef, useEffect, useCallback } from "react";
import { useIpodStore } from "@/stores/useIpodStore";
import { isOffline } from "@/utils/offline";

// =============================================================================
// Types
// =============================================================================

export interface LineProgress {
  completedLines: number;
  totalLines: number;
  percentage: number;
}

export interface PrefetchedData<T> {
  cached: boolean;
  data?: T;
  totalLines?: number;
}

export interface StreamingFetchOptions<TResult, TLineData> {
  /** Unique identifier for the resource (e.g., songId) */
  resourceId: string;
  /** Whether fetching should be enabled */
  enabled: boolean;
  /** Cache key to detect if data needs refetching */
  cacheKey: string;
  /** Pre-fetched data from initial request */
  prefetchedData?: PrefetchedData<TResult>;
  /** The streaming fetch function */
  fetchFn: (
    resourceId: string,
    options: {
      force: boolean;
      signal: AbortSignal;
      prefetchedInfo?: PrefetchedData<TResult>;
      auth?: { username: string; authToken: string };
      onProgress?: (progress: LineProgress) => void;
      onLine?: (lineIndex: number, data: TLineData) => void;
    }
  ) => Promise<{ data: TResult; success: boolean }>;
  /** Callback for each line of data received */
  onLine?: (lineIndex: number, data: TLineData) => void;
  /** Callback when fetch completes successfully */
  onComplete?: (data: TResult) => void;
  /** Callback when fetch errors */
  onError?: (error: Error) => void;
  /** Auth credentials for force refresh */
  auth?: { username: string; authToken: string };
  /** Debug label for logging */
  debugLabel?: string;
}

export interface StreamingFetchResult<TResult> {
  /** Current data */
  data: TResult | null;
  /** Whether currently fetching */
  isLoading: boolean;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Error message if any */
  error?: string;
  /** Manually trigger a refetch */
  refetch: () => void;
  /** Clear the cached data */
  clear: () => void;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Generic hook for streaming SSE fetches with:
 * - AbortController lifecycle management
 * - Cache bust trigger detection
 * - Stale request prevention
 * - Progress tracking
 * - In-flight request deduplication
 * - Offline checks
 */
export function useStreamingFetch<TResult, TLineData = unknown>({
  resourceId,
  enabled,
  cacheKey,
  prefetchedData,
  fetchFn,
  onLine,
  onComplete,
  onError,
  auth,
  debugLabel = "StreamingFetch",
}: StreamingFetchOptions<TResult, TLineData>): StreamingFetchResult<TResult> {
  // State
  const [data, setData] = useState<TResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<number | undefined>();
  const [error, setError] = useState<string | undefined>();

  // Refs for tracking state
  const cacheKeyRef = useRef<string>("");
  const currentResourceIdRef = useRef(resourceId);
  currentResourceIdRef.current = resourceId;
  const lastResourceIdRef = useRef<string>("");

  // Cache bust trigger from store
  const lyricsCacheBustTrigger = useIpodStore((s) => s.lyricsCacheBustTrigger);
  const lastCacheBustTriggerRef = useRef<number>(lyricsCacheBustTrigger);

  // Track in-flight requests to prevent duplicates
  const requestRef = useRef<{ controller: AbortController; requestId: string } | null>(null);

  // Stable refs for callbacks
  const onLineRef = useRef(onLine);
  onLineRef.current = onLine;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Manual refetch trigger
  const [refetchCounter, setRefetchCounter] = useState(0);
  const refetch = useCallback(() => {
    setRefetchCounter((c) => c + 1);
  }, []);

  // Clear data
  const clear = useCallback(() => {
    setData(null);
    cacheKeyRef.current = "";
    setError(undefined);
  }, []);

  // Clear request ref when resourceId changes
  useEffect(() => {
    requestRef.current = null;
  }, [resourceId]);

  // Clear data when cache bust trigger changes
  useEffect(() => {
    if (lastCacheBustTriggerRef.current !== lyricsCacheBustTrigger) {
      setData(null);
      cacheKeyRef.current = "";
      setError(undefined);
      requestRef.current = null;
    }
  }, [lyricsCacheBustTrigger]);

  // Main fetch effect
  // biome-ignore lint/correctness/useExhaustiveDependencies: cacheKey captures content
  useEffect(() => {
    const effectResourceId = resourceId;

    // If disabled, no resourceId, or empty cache key, handle cleanup
    if (!effectResourceId || !enabled || !cacheKey) {
      const resourceChanged = effectResourceId !== lastResourceIdRef.current;
      if (resourceChanged && cacheKeyRef.current !== "") {
        setData(null);
        cacheKeyRef.current = "";
        lastResourceIdRef.current = effectResourceId || "";
        setIsLoading(false);
        setProgress(undefined);
        setError(undefined);
      }
      return;
    }

    lastResourceIdRef.current = effectResourceId;

    // Check if offline
    if (isOffline()) {
      setError("Requires an internet connection");
      setIsLoading(false);
      return;
    }

    // Check if this is a force request
    const isForceRequest = lastCacheBustTriggerRef.current !== lyricsCacheBustTrigger;

    // Skip if we already have this data and it's not a force request
    if (!isForceRequest && cacheKey === cacheKeyRef.current) {
      return;
    }

    // Use prefetched data if available and not forcing
    if (prefetchedData?.cached && prefetchedData.data && !isForceRequest) {
      setData(prefetchedData.data);
      cacheKeyRef.current = cacheKey;
      setIsLoading(false);
      onCompleteRef.current?.(prefetchedData.data);
      return;
    }

    // Check for in-flight request
    const existingReq = requestRef.current;
    if (existingReq && !existingReq.controller.signal.aborted) {
      return;
    }
    if (existingReq?.controller.signal.aborted) {
      requestRef.current = null;
    }

    // Generate unique request ID
    const requestId = `${effectResourceId}-${lyricsCacheBustTrigger}-${Date.now()}`;

    // Start loading
    setIsLoading(true);
    setProgress(0);
    setError(undefined);

    const controller = new AbortController();
    requestRef.current = { controller, requestId };

    console.log(`[${debugLabel}] Starting fetch for ${effectResourceId}`);

    fetchFn(effectResourceId, {
      force: isForceRequest,
      signal: controller.signal,
      prefetchedInfo: !isForceRequest ? prefetchedData : undefined,
      auth,
      onProgress: (prog) => {
        if (controller.signal.aborted) return;
        if (effectResourceId !== currentResourceIdRef.current) return;
        setProgress(prog.percentage);
      },
      onLine: (lineIndex, lineData) => {
        if (controller.signal.aborted) return;
        if (effectResourceId !== currentResourceIdRef.current) return;
        onLineRef.current?.(lineIndex, lineData);
      },
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (effectResourceId !== currentResourceIdRef.current) return;

        setData(result.data);
        cacheKeyRef.current = cacheKey;
        lastCacheBustTriggerRef.current = lyricsCacheBustTrigger;
        onCompleteRef.current?.(result.data);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (effectResourceId !== currentResourceIdRef.current) return;

        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        console.error(`[${debugLabel}] Fetch error:`, err);
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        setError(errorMsg);
        onErrorRef.current?.(err instanceof Error ? err : new Error(errorMsg));
      })
      .finally(() => {
        if (requestRef.current?.requestId === requestId) {
          requestRef.current = null;
        }

        if (!controller.signal.aborted && effectResourceId === currentResourceIdRef.current) {
          setIsLoading(false);
          setProgress(undefined);
        }
      });

    return () => {
      controller.abort();
      if (requestRef.current?.requestId === requestId) {
        requestRef.current = null;
      }
      setIsLoading(false);
      setProgress(undefined);
    };
  }, [resourceId, enabled, cacheKey, lyricsCacheBustTrigger, prefetchedData, fetchFn, auth, debugLabel, refetchCounter]);

  return {
    data,
    isLoading,
    progress,
    error,
    refetch,
    clear,
  };
}
