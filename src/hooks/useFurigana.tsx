import { useReducer, useRef, useEffect, useCallback, useMemo } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";
import type { LyricLine, RomanizationSettings } from "@/types/lyrics";
import { useCacheBustTrigger } from "@/hooks/useCacheBustTrigger";
import { isOffline } from "@/utils/offline";
import i18n from "@/lib/i18n";
import { isJapaneseText } from "@/utils/romanization";
import { lyricsHaveJapanese } from "@/utils/languageDetection";
import type { FuriganaSegment } from "@/utils/romanization";
import { normalizeFuriganaSegments } from "@/utils/furigana";
import {
  processFuriganaSSE, 
  processSoramimiSSE, 
  type FuriganaStreamInfo, 
  type SoramimiStreamInfo,
  type FuriganaResult,
  type SoramimiResult,
} from "@/utils/chunkedStream";
import {
  isFuriganaReadyForSoramimi,
  SORAMIMI_FETCH_TIMEOUT_MS,
} from "@/utils/soramimiFetch";
import { renderLyricsWithAnnotations } from "@/utils/renderLyricsWithAnnotations";

// Re-export FuriganaSegment for consumers
export type { FuriganaSegment };

interface UseFuriganaParams {
  /** Song ID (YouTube video ID) - required for unified endpoint */
  songId: string;
  /** Lyric lines to fetch furigana for */
  lines: LyricLine[];
  /** Whether we're showing original lyrics (not translations) */
  isShowingOriginal: boolean;
  /** Romanization settings object */
  romanization: RomanizationSettings;
  /** Callback when loading state changes */
  onLoadingChange?: (isLoading: boolean) => void;
  /** Pre-fetched furigana info from initial lyrics request (skips extra API call) */
  prefetchedInfo?: FuriganaStreamInfo;
  /** Pre-fetched soramimi info from initial lyrics request (skips extra API call) */
  prefetchedSoramimiInfo?: SoramimiStreamInfo;
  /** Auth credentials (required for force refresh) */
  auth?: { username: string; isAuthenticated: boolean };
}

interface UseFuriganaReturn {
  /** Map of startTimeMs -> FuriganaSegment[] */
  furiganaMap: Map<string, FuriganaSegment[]>;
  /** Map of startTimeMs -> SoramimiSegment[] (Chinese misheard lyrics) */
  soramimiMap: Map<string, FuriganaSegment[]>;
  /** Whether currently fetching (furigana OR soramimi) */
  isFetching: boolean;
  /** Whether currently fetching furigana specifically */
  isFetchingFurigana: boolean;
  /** Whether currently fetching soramimi specifically */
  isFetchingSoramimi: boolean;
  /** Progress percentage (0-100) when streaming (combined/legacy) */
  progress?: number;
  /** Furigana progress percentage (0-100) */
  furiganaProgress?: number;
  /** Soramimi progress percentage (0-100) */
  soramimiProgress?: number;
  /** Error message if furigana fetch failed */
  error?: string;
  /** Non-blocking soramimi (misheard lyrics) fetch error */
  soramimiError?: string;
  /** Render helper that wraps text with ruby elements (including all romanization types) */
  renderWithFurigana: (line: LyricLine, processedText: string) => React.ReactNode;
}

function normalizeClientFuriganaSegments(segments: FuriganaSegment[]): FuriganaSegment[] {
  return normalizeFuriganaSegments(segments);
}

/**
 * Hook for fetching and managing Japanese furigana annotations and other romanization
 * 
 * Handles:
 * - Fetching furigana from unified /api/songs/{id} endpoint
 * - Rendering with furigana (hiragana over kanji)
 * - Converting furigana to romaji when enabled
 * - Korean romanization for mixed content
 * - Chinese pinyin for mixed content
 * - Standalone kana to romaji conversion
 */
export function useFurigana({
  songId,
  lines,
  isShowingOriginal,
  romanization,
  onLoadingChange,
  prefetchedInfo,
  prefetchedSoramimiInfo,
  auth,
}: UseFuriganaParams): UseFuriganaReturn {
  interface FuriganaState {
    furiganaMap: Map<string, FuriganaSegment[]>;
    soramimiMap: Map<string, FuriganaSegment[]>;
    isFetchingFurigana: boolean;
    isFetchingSoramimi: boolean;
    progress: number | undefined;
    furiganaProgress: number | undefined;
    soramimiProgress: number | undefined;
    error: string | undefined;
    soramimiError: string | undefined;
  }

  const initialState: FuriganaState = {
    furiganaMap: new Map(),
    soramimiMap: new Map(),
    isFetchingFurigana: false,
    isFetchingSoramimi: false,
    progress: undefined,
    furiganaProgress: undefined,
    soramimiProgress: undefined,
    error: undefined,
    soramimiError: undefined,
  };

  type FuriganaAction = { type: "patch"; payload: Partial<FuriganaState> };

  const reducer = (state: FuriganaState, action: FuriganaAction): FuriganaState => {
    switch (action.type) {
      case "patch": {
        // Bail out when nothing actually changed so we don't trigger a
        // useless re-render. Many of the dispatches in this hook reset
        // state to its current value (e.g. `setIsFetchingFurigana(false)`
        // on an already-idle hook); without this bailout each such call
        // produces a new state object, fanning out unnecessary re-renders
        // to consumers (and historically contributing to lyrics-reload
        // render loops in `useLyrics`).
        let changed = false;
        for (const key in action.payload) {
          if (
            action.payload[key as keyof FuriganaState] !==
            state[key as keyof FuriganaState]
          ) {
            changed = true;
            break;
          }
        }
        if (!changed) return state;
        return { ...state, ...action.payload };
      }
      default:
        return state;
    }
  };

  const [state, dispatch] = useReducer(reducer, initialState);
  const {
    furiganaMap,
    soramimiMap,
    isFetchingFurigana,
    isFetchingSoramimi,
    progress,
    furiganaProgress,
    soramimiProgress,
    error,
    soramimiError,
  } = state;

  const setFuriganaMap = useCallback((value: Map<string, FuriganaSegment[]>) => {
    dispatch({ type: "patch", payload: { furiganaMap: value } });
  }, []);
  const setSoramimiMap = useCallback((value: Map<string, FuriganaSegment[]>) => {
    dispatch({ type: "patch", payload: { soramimiMap: value } });
  }, []);
  const setIsFetchingFurigana = useCallback((value: boolean) => {
    dispatch({ type: "patch", payload: { isFetchingFurigana: value } });
  }, []);
  const setIsFetchingSoramimi = useCallback((value: boolean) => {
    dispatch({ type: "patch", payload: { isFetchingSoramimi: value } });
  }, []);
  const setProgress = useCallback((value: number | undefined) => {
    dispatch({ type: "patch", payload: { progress: value } });
  }, []);
  const setFuriganaProgress = useCallback((value: number | undefined) => {
    dispatch({ type: "patch", payload: { furiganaProgress: value } });
  }, []);
  const setSoramimiProgress = useCallback((value: number | undefined) => {
    dispatch({ type: "patch", payload: { soramimiProgress: value } });
  }, []);
  const setError = useCallback((value: string | undefined) => {
    dispatch({ type: "patch", payload: { error: value } });
  }, []);
  const setSoramimiError = useCallback((value: string | undefined) => {
    dispatch({ type: "patch", payload: { soramimiError: value } });
  }, []);
  
  // Combined fetching state for backwards compatibility
  const isFetching = isFetchingFurigana || isFetchingSoramimi;
  const furiganaCacheKeyRef = useRef<string>("");
  const soramimiCacheKeyRef = useRef<string>("");
  // Track current songId for race condition prevention
  const currentSongIdRef = useLatestRef(songId);
  
  // Track current lines for callback access
  const linesRef = useLatestRef(lines);
  
  // Separate cache bust triggers for furigana and soramimi
  // This prevents one completing first from skipping the other's force-refresh
  const { currentTrigger: lyricsCacheBustTrigger, isForceRequest: isFuriganaForceRequest, markHandled: markFuriganaHandled } = useCacheBustTrigger();
  const { isForceRequest: isSoramimiForceRequest, markHandled: markSoramimiHandled } = useCacheBustTrigger();
  
  // Track in-flight force requests to prevent premature abort on effect re-runs
  // Store both the controller and a unique requestId to distinguish new vs duplicate requests
  const furiganaForceRequestRef = useRef<{ controller: AbortController; requestId: string } | null>(null);
  const soramimiForceRequestRef = useRef<{
    controller: AbortController;
    requestId: string;
  } | null>(null);

  const prefetchedSoramimiInfoRef = useLatestRef(prefetchedSoramimiInfo);
  const prefetchedFuriganaInfoRef = useLatestRef(prefetchedInfo);

  const abortActiveFuriganaRequest = useCallback(() => {
    const active = furiganaForceRequestRef.current;
    if (active && !active.controller.signal.aborted) {
      active.controller.abort();
    }
    furiganaForceRequestRef.current = null;
  }, []);

  const abortActiveSoramimiRequest = useCallback(() => {
    const active = soramimiForceRequestRef.current;
    if (active && !active.controller.signal.aborted) {
      active.controller.abort();
    }
    soramimiForceRequestRef.current = null;
  }, []);
  
  // Stable refs for callbacks to avoid effect re-runs
  const onLoadingChangeRef = useLatestRef(onLoadingChange);

  // Notify parent when loading state changes (use ref to avoid effect dependency)
  // Depends on both individual states since isFetching is derived
  useEffect(() => {
    onLoadingChangeRef.current?.(isFetchingFurigana || isFetchingSoramimi);
  }, [isFetchingFurigana, isFetchingSoramimi, onLoadingChangeRef]);

  // Content signature (not array reference) so effects don't restart on parent re-renders
  const linesSignature =
    lines.length === 0
      ? ""
      : lines.map((l) => `${l.startTimeMs}:${l.words.slice(0, 20)}`).join("|");

  const cacheKey = useMemo(() => {
    if (!songId || !linesSignature) return "";
    return `song:${songId}:${linesSignature}`;
  }, [songId, linesSignature]);

  const soramimiTargetLanguage = romanization.soramamiTargetLanguage;
  const soramimiCacheKey = useMemo(() => {
    if (!cacheKey) return "";
    return `${cacheKey}:soramimi:${soramimiTargetLanguage}`;
  }, [cacheKey, soramimiTargetLanguage]);

  // Clear force request refs when songId changes to prevent cross-song pollution
  useEffect(() => {
    furiganaForceRequestRef.current = null;
    soramimiForceRequestRef.current = null;
  }, [songId]);
  
  // Effect to immediately clear furigana and soramimi when cache bust trigger changes
  // Only clear when BOTH are force requests (i.e., fresh cache bust)
  // This prevents re-clearing when one completes and marks handled while the other is still pending
  useEffect(() => {
    if (isFuriganaForceRequest && isSoramimiForceRequest) {
      setFuriganaMap(new Map());
      setSoramimiMap(new Map());
      furiganaCacheKeyRef.current = "";
      soramimiCacheKeyRef.current = "";
      setError(undefined);
      setSoramimiError(undefined);
      // Clear force request refs to prevent stale state blocking new requests
      furiganaForceRequestRef.current = null;
      soramimiForceRequestRef.current = null;
    }
  }, [isFuriganaForceRequest, isSoramimiForceRequest]);

  // Check conditions outside effect to avoid running effect body when not needed
  // Fetch furigana if:
  // 1. User has furigana display enabled, OR
  // 2. Soramimi is enabled (furigana helps AI know kanji pronunciation for Japanese songs)
  const shouldFetchFurigana = romanization.enabled && (romanization.japaneseFurigana || romanization.soramimi);
  const hasLines = lines.length > 0;
  
  // Track the last songId we had data for - only clear cache when song actually changes
  const lastFuriganaSongIdRef = useRef<string>("");

  // Fetch furigana for original lines when enabled using line-by-line streaming
  // biome-ignore lint/correctness/useExhaustiveDependencies: cacheKey captures lines content, shouldFetchFurigana captures romanization settings
  useEffect(() => {
    // Capture songId at effect start for stale request detection
    const effectSongId = songId;

    // If completely disabled, no songId, or no lines, handle cleanup
    if (!effectSongId || !shouldFetchFurigana || !hasLines) {
      abortActiveFuriganaRequest();
      const songChanged = effectSongId !== lastFuriganaSongIdRef.current;
      if (songChanged && furiganaCacheKeyRef.current !== "") {
        setFuriganaMap(new Map());
        furiganaCacheKeyRef.current = "";
        lastFuriganaSongIdRef.current = effectSongId || "";
        markFuriganaHandled();
      }
      finishFuriganaFetch();
      setError(undefined);
      return;
    }
    
    lastFuriganaSongIdRef.current = effectSongId;

    if (!isShowingOriginal) {
      abortActiveFuriganaRequest();
      finishFuriganaFetch();
      return;
    }

    const hasJapanese = lines.some((line) => isJapaneseText(line.words));
    if (!hasJapanese) {
      abortActiveFuriganaRequest();
      setFuriganaMap(new Map());
      furiganaCacheKeyRef.current = "";
      finishFuriganaFetch();
      setError(undefined);
      markFuriganaHandled();
      return;
    }

    if (isOffline()) {
      abortActiveFuriganaRequest();
      finishFuriganaFetch();
      setError("iPod requires an internet connection");
      return;
    }

    if (!isFuriganaForceRequest && cacheKey === furiganaCacheKeyRef.current) {
      finishFuriganaFetch();
      return;
    }

    const prefetchedFurigana = prefetchedFuriganaInfoRef.current;
    if (prefetchedFurigana?.cached && prefetchedFurigana.data && !isFuriganaForceRequest) {
      abortActiveFuriganaRequest();
      const finalMap = new Map<string, FuriganaSegment[]>();
      prefetchedFurigana.data.forEach((segments, index) => {
        if (index < lines.length && segments) {
          finalMap.set(lines[index].startTimeMs, normalizeClientFuriganaSegments(segments));
        }
      });
      setFuriganaMap(finalMap);
      furiganaCacheKeyRef.current = cacheKey;
      finishFuriganaFetch();
      return;
    }

    abortActiveFuriganaRequest();

    const requestId = `${effectSongId}-${lyricsCacheBustTrigger}-${Date.now()}`;
    let timedOut = false;

    setIsFetchingFurigana(true);
    setProgress(0);
    setFuriganaProgress(0);
    setError(undefined);
    
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, SORAMIMI_FETCH_TIMEOUT_MS);

    furiganaForceRequestRef.current = { controller, requestId };

    const progressiveMap = new Map<string, FuriganaSegment[]>();
    
    if (import.meta.env.DEV) {
      console.log("[Furigana] Starting SSE", { songId: effectSongId, lines: lines.length });
    }

    processFuriganaSSE(effectSongId, {
      force: isFuriganaForceRequest,
      signal: controller.signal,
      prefetchedInfo: !isFuriganaForceRequest ? prefetchedFurigana : undefined,
      auth,
      onProgress: (progress) => {
        if (!controller.signal.aborted) {
          if (effectSongId !== currentSongIdRef.current) return;
          setProgress(progress.percentage);
          setFuriganaProgress(progress.percentage);
        }
      },
      onLine: (lineIndex, segments) => {
        if (controller.signal.aborted) return;
        if (effectSongId !== currentSongIdRef.current) return;
        
        const currentLines = linesRef.current;
        if (lineIndex < currentLines.length && segments) {
          console.log(`[Furigana] Line ${lineIndex} received:`, segments.length, 'segments');
          progressiveMap.set(
            currentLines[lineIndex].startTimeMs,
            normalizeClientFuriganaSegments(segments)
          );
          setFuriganaMap(new Map(progressiveMap));
        }
      },
    })
      .then((result: FuriganaResult) => {
        if (controller.signal.aborted) return;
        // Check for stale request
        if (effectSongId !== currentSongIdRef.current) return;

        // Final update to ensure we have everything
        const currentLines = linesRef.current;
        const finalMap = new Map<string, FuriganaSegment[]>();
        result.data.forEach((segments, index) => {
          if (index < currentLines.length && segments) {
            finalMap.set(
              currentLines[index].startTimeMs,
              normalizeClientFuriganaSegments(segments)
            );
          }
        });

        setFuriganaMap(finalMap);
        furiganaCacheKeyRef.current = cacheKey;
        markFuriganaHandled();
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        // Check for stale request
        if (effectSongId !== currentSongIdRef.current) return;
        
        if (err instanceof Error && err.name === "AbortError") {
          if (timedOut) {
            setError(i18n.t("common.errors.failedToFetchFurigana"));
          }
          return;
        }

        console.error("Failed to fetch furigana:", err);
        setError(err instanceof Error ? err.message : i18n.t("common.errors.failedToFetchFurigana"));
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (furiganaForceRequestRef.current?.requestId === requestId) {
          furiganaForceRequestRef.current = null;
        }

        if (effectSongId === currentSongIdRef.current) {
          finishFuriganaFetch();
        }
      });

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
      const isThisRequest = furiganaForceRequestRef.current?.requestId === requestId;
      if (isThisRequest) {
        furiganaForceRequestRef.current = null;
      }
      if (effectSongId === currentSongIdRef.current) {
        finishFuriganaFetch();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cacheKey uses linesSignature; prefetched furigana read via ref
  }, [songId, cacheKey, shouldFetchFurigana, hasLines, isShowingOriginal, lyricsCacheBustTrigger, finishFuriganaFetch, abortActiveFuriganaRequest]);

  // Check conditions for soramimi fetching
  const shouldFetchSoramimi = romanization.enabled && romanization.soramimi;
  
  // Track the last songId we had data for - only clear cache when song actually changes
  const lastSoramimiSongIdRef = useRef<string>("");
  
  // Determine if lyrics are Japanese (have both kanji and kana)
  // For Japanese songs, we need to wait for furigana to complete before fetching soramimi
  // so we can pass the furigana readings to help the AI know how to pronounce kanji
  const isJapanese = useMemo(
    () => (linesSignature ? lyricsHaveJapanese(lines) : false),
    [lines, linesSignature]
  );
  
  // For Japanese songs, check if furigana is ready (needed for accurate soramimi)
  // For non-Japanese songs (Korean, etc.), we can start soramimi immediately
  // Memoized to avoid recalculating on every render
  const furiganaReadyForSoramimi = useMemo(
    () => isFuriganaReadyForSoramimi(isJapanese, isFetchingFurigana),
    [isJapanese, isFetchingFurigana]
  );
  
  // Keep a ref to furiganaMap so we can access it in the effect without adding it as a dependency
  // This prevents the soramimi effect from re-running during furigana streaming
  const furiganaMapRef = useLatestRef(furiganaMap);

  const finishFuriganaFetch = useCallback(
    (clearProgress = true) => {
      setIsFetchingFurigana(false);
      if (clearProgress) {
        setProgress(undefined);
        setFuriganaProgress(undefined);
      }
    },
    [setIsFetchingFurigana, setProgress, setFuriganaProgress]
  );

  const finishSoramimiFetch = useCallback(
    (clearProgress = true) => {
      setIsFetchingSoramimi(false);
      if (clearProgress) {
        setProgress(undefined);
        setSoramimiProgress(undefined);
      }
    },
    [setIsFetchingSoramimi, setProgress, setSoramimiProgress]
  );

  // Fetch soramimi for lyrics when enabled using line-by-line streaming
  // For Japanese songs, waits for furigana to complete first so we can pass readings to the AI
  // biome-ignore lint/correctness/useExhaustiveDependencies: cacheKey captures lines content, shouldFetchSoramimi captures romanization settings
  useEffect(() => {
    // Capture songId at effect start for stale request detection
    const effectSongId = songId;

    // If completely disabled, no songId, or no lines, handle cleanup
    if (!effectSongId || !shouldFetchSoramimi || !hasLines) {
      abortActiveSoramimiRequest();
      // Only clear cache if songId actually changed (not just temporarily empty lines during re-fetch)
      const songChanged = effectSongId !== lastSoramimiSongIdRef.current;
      if (songChanged && soramimiCacheKeyRef.current !== "") {
        setSoramimiMap(new Map());
        soramimiCacheKeyRef.current = "";
        lastSoramimiSongIdRef.current = effectSongId || "";
        markSoramimiHandled();
      }
      finishSoramimiFetch();
      setSoramimiError(undefined);
      return;
    }
    
    // Update last songId when we have data
    lastSoramimiSongIdRef.current = effectSongId;

    // If not showing original, don't fetch new data but keep existing soramimi cached
    if (!isShowingOriginal) {
      abortActiveSoramimiRequest();
      finishSoramimiFetch();
      return;
    }

    // Check if offline
    if (isOffline()) {
      abortActiveSoramimiRequest();
      finishSoramimiFetch();
      setSoramimiError("iPod requires an internet connection");
      return;
    }
    
    // For Japanese songs, wait for furigana to complete before fetching soramimi
    if (!furiganaReadyForSoramimi) {
      finishSoramimiFetch();
      return;
    }

    // Skip if we already have this data and it's not a force request
    if (!isSoramimiForceRequest && soramimiCacheKey === soramimiCacheKeyRef.current) {
      finishSoramimiFetch();
      return;
    }

    const prefetchedSoramimi = prefetchedSoramimiInfoRef.current;

    if (prefetchedSoramimi?.skipped && !isSoramimiForceRequest) {
      abortActiveSoramimiRequest();
      setSoramimiMap(new Map());
      soramimiCacheKeyRef.current = soramimiCacheKey;
      finishSoramimiFetch();
      setSoramimiError(undefined);
      markSoramimiHandled();
      return;
    }

    // If we have cached soramimi from initial fetch, use it immediately
    // Only use if the cached data is for the same language we're requesting
    const prefetchedIsCorrectLanguage =
      prefetchedSoramimi?.targetLanguage === soramimiTargetLanguage;
    if (
      prefetchedSoramimi?.cached &&
      prefetchedSoramimi.data &&
      !isSoramimiForceRequest &&
      prefetchedIsCorrectLanguage
    ) {
      abortActiveSoramimiRequest();
      const finalMap = new Map<string, FuriganaSegment[]>();
      prefetchedSoramimi.data.forEach((segments, index) => {
        if (index < lines.length && segments) {
          finalMap.set(lines[index].startTimeMs, segments);
        }
      });
      setSoramimiMap(finalMap);
      soramimiCacheKeyRef.current = soramimiCacheKey;
      finishSoramimiFetch();
      setSoramimiError(undefined);
      return;
    }

    // Abort any prior stream before starting a new one (effect re-runs must not orphan requests)
    abortActiveSoramimiRequest();

    // Generate a unique requestId for this effect run
    const requestId = `${effectSongId}-${lyricsCacheBustTrigger}-${Date.now()}`;
    let timedOut = false;

    // Start loading - clear old soramimi map to avoid showing stale data while fetching
    setIsFetchingSoramimi(true);
    setProgress(0);
    setSoramimiProgress(0);
    setSoramimiError(undefined);
    setSoramimiMap(new Map());

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, SORAMIMI_FETCH_TIMEOUT_MS);

    soramimiForceRequestRef.current = { controller, requestId };

    if (import.meta.env.DEV) {
      console.log("[Soramimi] Starting SSE", {
        songId: effectSongId,
        targetLanguage: soramimiTargetLanguage,
        isJapanese,
        hasFurigana: furiganaMapRef.current.size > 0,
      });
    }

    const progressiveMap = new Map<string, FuriganaSegment[]>();
    
    // For Japanese songs, convert furigana map to array format for the API
    // Computed here (not in useMemo) to avoid re-running this effect during furigana streaming
    let furiganaForApi: Array<Array<{ text: string; reading?: string }>> | undefined;
    if (isJapanese && furiganaMapRef.current.size > 0) {
      const currentLines = linesRef.current;
      furiganaForApi = [];
      for (let i = 0; i < currentLines.length; i++) {
        const segments = furiganaMapRef.current.get(currentLines[i].startTimeMs);
        furiganaForApi.push(segments || [{ text: currentLines[i].words }]);
      }
      // Only include if there's actual reading data
      const hasReadings = furiganaForApi.some(line => line.some(seg => seg.reading));
      if (!hasReadings) {
        furiganaForApi = undefined;
      } else {
        console.log('[Soramimi] Starting with furigana data for Japanese song');
      }
    }
    
    processSoramimiSSE(effectSongId, {
      force: isSoramimiForceRequest,
      signal: controller.signal,
      prefetchedInfo: !isSoramimiForceRequest ? prefetchedSoramimi : undefined,
      // Pass furigana data for Japanese songs so AI knows kanji pronunciation
      furigana: furiganaForApi,
      targetLanguage: soramimiTargetLanguage,
      auth,
      onProgress: (progress) => {
        if (!controller.signal.aborted) {
          if (effectSongId !== currentSongIdRef.current) return;
          setProgress(progress.percentage);
          setSoramimiProgress(progress.percentage);
        }
      },
      onLine: (lineIndex, segments) => {
        if (controller.signal.aborted) return;
        if (effectSongId !== currentSongIdRef.current) return;
        
        const currentLines = linesRef.current;
        if (lineIndex < currentLines.length && segments) {
          console.log(`[Soramimi] Line ${lineIndex} received:`, segments.length, 'segments');
          progressiveMap.set(currentLines[lineIndex].startTimeMs, segments);
          setSoramimiMap(new Map(progressiveMap));
        }
      },
    })
      .then((result: SoramimiResult) => {
        if (controller.signal.aborted) return;
        // Check for stale request
        if (effectSongId !== currentSongIdRef.current) return;

        // Final update to ensure we have everything
        const currentLines = linesRef.current;
        const finalMap = new Map<string, FuriganaSegment[]>();
        result.data.forEach((segments, index) => {
          if (index < currentLines.length && segments) {
            finalMap.set(currentLines[index].startTimeMs, segments);
          }
        });

        setSoramimiMap(finalMap);
        soramimiCacheKeyRef.current = soramimiCacheKey;
        markSoramimiHandled();
        if (import.meta.env.DEV) {
          console.log("[Soramimi] SSE complete", { lines: finalMap.size });
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (effectSongId !== currentSongIdRef.current) return;

        if (err instanceof Error && err.name === "AbortError") {
          if (timedOut) {
            setSoramimiError(i18n.t("common.errors.failedToFetchSoramimi"));
          }
          return;
        }

        console.error("[Soramimi] Failed to fetch soramimi:", err);
        setSoramimiError(
          err instanceof Error
            ? err.message
            : i18n.t("common.errors.failedToFetchSoramimi")
        );
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (soramimiForceRequestRef.current?.requestId === requestId) {
          soramimiForceRequestRef.current = null;
        }

        if (effectSongId === currentSongIdRef.current) {
          finishSoramimiFetch();
        }
      });

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
      const isThisRequest = soramimiForceRequestRef.current?.requestId === requestId;
      if (isThisRequest) {
        soramimiForceRequestRef.current = null;
      }
      if (effectSongId === currentSongIdRef.current) {
        finishSoramimiFetch();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- soramimiCacheKey captures lines content + target language; prefetched soramimi read via ref to avoid abort/restart loops when useLyrics metadata updates
  }, [songId, soramimiCacheKey, shouldFetchSoramimi, hasLines, isShowingOriginal, lyricsCacheBustTrigger, isJapanese, furiganaReadyForSoramimi, soramimiTargetLanguage, finishSoramimiFetch, abortActiveSoramimiRequest]);

  // Unified render function that handles all romanization types
  // Delegates to extracted utility for better separation of concerns
  const renderWithFurigana = useCallback(
    (line: LyricLine, processedText: string): React.ReactNode => {
      return renderLyricsWithAnnotations(line, processedText, {
        romanization,
        isShowingOriginal,
        furiganaMap,
        soramimiMap,
      });
    },
    [romanization, isShowingOriginal, furiganaMap, soramimiMap]
  );

  return {
    furiganaMap,
    soramimiMap,
    isFetching,
    isFetchingFurigana,
    isFetchingSoramimi,
    progress,
    furiganaProgress,
    soramimiProgress,
    error,
    soramimiError,
    renderWithFurigana,
  };
}
