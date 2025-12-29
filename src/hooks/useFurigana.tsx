import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { LyricLine, RomanizationSettings } from "@/types/lyrics";
import { useIpodStore } from "@/stores/useIpodStore";
import { isOffline } from "@/utils/offline";
import i18n from "@/lib/i18n";
import { isJapaneseText } from "@/utils/romanization";
import { lyricsHaveJapanese } from "@/utils/languageDetection";
import type { FuriganaSegment } from "@/utils/romanization";
import {
  processFuriganaSSE, 
  processSoramimiSSE, 
  type FuriganaStreamInfo, 
  type SoramimiStreamInfo,
  type FuriganaResult,
  type SoramimiResult,
} from "@/utils/chunkedStream";
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
  auth?: { username: string; authToken: string };
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
  /** Error message if any */
  error?: string;
  /** Render helper that wraps text with ruby elements (including all romanization types) */
  renderWithFurigana: (line: LyricLine, processedText: string) => React.ReactNode;
}

/**
 * Hook for fetching and managing Japanese furigana annotations and other romanization
 * 
 * Handles:
 * - Fetching furigana from unified /api/song/{id} endpoint
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
  const [furiganaMap, setFuriganaMap] = useState<Map<string, FuriganaSegment[]>>(new Map());
  const [soramimiMap, setSoramimiMap] = useState<Map<string, FuriganaSegment[]>>(new Map());
  const [isFetchingFurigana, setIsFetchingFurigana] = useState(false);
  const [isFetchingSoramimi, setIsFetchingSoramimi] = useState(false);
  const [progress, setProgress] = useState<number | undefined>();
  const [furiganaProgress, setFuriganaProgress] = useState<number | undefined>();
  const [soramimiProgress, setSoramimiProgress] = useState<number | undefined>();
  const [error, setError] = useState<string>();
  
  // Combined fetching state for backwards compatibility
  const isFetching = isFetchingFurigana || isFetchingSoramimi;
  const furiganaCacheKeyRef = useRef<string>("");
  const soramimiCacheKeyRef = useRef<string>("");
  // Track current songId for race condition prevention
  const currentSongIdRef = useRef(songId);
  currentSongIdRef.current = songId;
  
  // Track current lines for callback access
  const linesRef = useRef(lines);
  linesRef.current = lines;
  
  // Track cache bust trigger for clearing caches
  const lyricsCacheBustTrigger = useIpodStore((s) => s.lyricsCacheBustTrigger);
  // Separate refs for furigana and soramimi to prevent one completing first from skipping the other's force-refresh
  const lastFuriganaCacheBustTriggerRef = useRef<number>(lyricsCacheBustTrigger);
  const lastSoramimiCacheBustTriggerRef = useRef<number>(lyricsCacheBustTrigger);
  
  // Track in-flight force requests to prevent premature abort on effect re-runs
  // Store both the controller and a unique requestId to distinguish new vs duplicate requests
  const furiganaForceRequestRef = useRef<{ controller: AbortController; requestId: string } | null>(null);
  const soramimiForceRequestRef = useRef<{ controller: AbortController; requestId: string } | null>(null);
  
  // Stable refs for callbacks to avoid effect re-runs
  const onLoadingChangeRef = useRef(onLoadingChange);
  onLoadingChangeRef.current = onLoadingChange;

  // Notify parent when loading state changes (use ref to avoid effect dependency)
  // Depends on both individual states since isFetching is derived
  useEffect(() => {
    onLoadingChangeRef.current?.(isFetchingFurigana || isFetchingSoramimi);
  }, [isFetchingFurigana, isFetchingSoramimi]);

  // Compute cache key outside effect - only when lines actually change
  const cacheKey = useMemo(() => {
    if (!songId || lines.length === 0) return "";
    return `song:${songId}:` + lines.map((l) => `${l.startTimeMs}:${l.words.slice(0, 20)}`).join("|");
  }, [songId, lines]);
  
  // Compute soramimi-specific cache key that includes target language
  // This ensures switching between Chinese and English soramimi triggers a refetch
  const soramimiTargetLanguage = romanization.soramamiTargetLanguage;
  const soramimiCacheKey = useMemo(() => {
    if (!songId || lines.length === 0) return "";
    return `${cacheKey}:soramimi:${soramimiTargetLanguage}`;
  }, [cacheKey, songId, lines.length, soramimiTargetLanguage]);

  // Clear force request refs when songId changes to prevent cross-song pollution
  useEffect(() => {
    furiganaForceRequestRef.current = null;
    soramimiForceRequestRef.current = null;
  }, [songId]);
  
  // Effect to immediately clear furigana and soramimi when cache bust trigger changes
  useEffect(() => {
    if (lastFuriganaCacheBustTriggerRef.current !== lyricsCacheBustTrigger || 
        lastSoramimiCacheBustTriggerRef.current !== lyricsCacheBustTrigger) {
      setFuriganaMap(new Map());
      setSoramimiMap(new Map());
      furiganaCacheKeyRef.current = "";
      soramimiCacheKeyRef.current = "";
      setError(undefined);
      // Clear force request refs to prevent stale state blocking new requests
      furiganaForceRequestRef.current = null;
      soramimiForceRequestRef.current = null;
      // Note: Don't update the cache bust refs here - let each effect update its own ref on completion
    }
  }, [lyricsCacheBustTrigger]);

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
      // Only clear cache if songId actually changed (not just temporarily empty lines during re-fetch)
      const songChanged = effectSongId !== lastFuriganaSongIdRef.current;
      if (songChanged && furiganaCacheKeyRef.current !== "") {
        setFuriganaMap(new Map());
        furiganaCacheKeyRef.current = "";
        lastFuriganaSongIdRef.current = effectSongId || "";
        setIsFetchingFurigana(false);
        setProgress(undefined);
        setError(undefined);
      }
      return;
    }
    
    // Update last songId when we have data
    lastFuriganaSongIdRef.current = effectSongId;

    // If not showing original, don't fetch new data but keep existing furigana cached
    if (!isShowingOriginal) {
      setIsFetchingFurigana(false);
      return;
    }

    // Check if any lines are Japanese text (has both kanji and kana)
    const hasJapanese = lines.some((line) => isJapaneseText(line.words));
    if (!hasJapanese) {
      setFuriganaMap(new Map());
      furiganaCacheKeyRef.current = "";  // Clear cache key to prevent stale cache detection
      setIsFetchingFurigana(false);
      setProgress(undefined);
      setError(undefined);
      return;
    }

    // Check if offline
    if (isOffline()) {
      setError("iPod requires an internet connection");
      setIsFetchingFurigana(false);
      return;
    }

    // Check if this is a force cache clear request
    const isForceRequest = lastFuriganaCacheBustTriggerRef.current !== lyricsCacheBustTrigger;
    
    // Skip if we already have this data and it's not a force request
    if (!isForceRequest && cacheKey === furiganaCacheKeyRef.current) {
      return;
    }

    // If we have cached furigana from initial fetch, use it immediately
    if (prefetchedInfo?.cached && prefetchedInfo.data && !isForceRequest) {
      const finalMap = new Map<string, FuriganaSegment[]>();
      prefetchedInfo.data.forEach((segments, index) => {
        if (index < lines.length && segments) {
          finalMap.set(lines[index].startTimeMs, segments);
        }
      });
      setFuriganaMap(finalMap);
      furiganaCacheKeyRef.current = cacheKey;
      setIsFetchingFurigana(false);
      return;
    }

    // If there's already a request in flight for this song, skip this effect run
    // This prevents duplicate requests when React re-runs the effect
    const existingReq = furiganaForceRequestRef.current;
    if (existingReq && !existingReq.controller.signal.aborted) {
      return;
    }
    // Clear stale aborted ref so we can start fresh
    if (existingReq?.controller.signal.aborted) {
      furiganaForceRequestRef.current = null;
    }

    // Generate a unique requestId for this effect run
    const requestId = `${effectSongId}-${lyricsCacheBustTrigger}-${Date.now()}`;

    // Start loading
    setIsFetchingFurigana(true);
    setProgress(0);
    setFuriganaProgress(0);
    setError(undefined);
    
    const controller = new AbortController();

    // Track this request so we can detect duplicates
    furiganaForceRequestRef.current = { controller, requestId };

    // Use line-by-line streaming for furigana
    const progressiveMap = new Map<string, FuriganaSegment[]>();
    
    processFuriganaSSE(effectSongId, {
      force: isForceRequest,
      signal: controller.signal,
      prefetchedInfo: !isForceRequest ? prefetchedInfo : undefined,
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
          progressiveMap.set(currentLines[lineIndex].startTimeMs, segments);
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
            finalMap.set(currentLines[index].startTimeMs, segments);
          }
        });

        setFuriganaMap(finalMap);
        furiganaCacheKeyRef.current = cacheKey;
        lastFuriganaCacheBustTriggerRef.current = lyricsCacheBustTrigger;
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        // Check for stale request
        if (effectSongId !== currentSongIdRef.current) return;
        
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        console.error("Failed to fetch furigana:", err);
        setError(err instanceof Error ? err.message : i18n.t("common.errors.failedToFetchFurigana"));
      })
      .finally(() => {
        // Clear force request ref when this request completes
        if (furiganaForceRequestRef.current?.requestId === requestId) {
          furiganaForceRequestRef.current = null;
        }

        if (!controller.signal.aborted && effectSongId === currentSongIdRef.current) {
          setIsFetchingFurigana(false);
          setProgress(undefined);
          setFuriganaProgress(undefined);
        }
      });

    return () => {
      // Always abort this request on cleanup - this controller is scoped to this effect run
      controller.abort();
      // Only clear the ref if this is still the current request
      const isThisRequest = furiganaForceRequestRef.current?.requestId === requestId;
      if (isThisRequest) {
        furiganaForceRequestRef.current = null;
      }
      setIsFetchingFurigana(false);
      setFuriganaProgress(undefined);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cacheKey captures lines content, shouldFetchFurigana captures romanization settings
  }, [songId, cacheKey, shouldFetchFurigana, hasLines, isShowingOriginal, lyricsCacheBustTrigger, prefetchedInfo]);

  // Check conditions for soramimi fetching
  const shouldFetchSoramimi = romanization.enabled && romanization.soramimi;
  
  // Track the last songId we had data for - only clear cache when song actually changes
  const lastSoramimiSongIdRef = useRef<string>("");
  
  // Determine if lyrics are Japanese (have both kanji and kana)
  // For Japanese songs, we need to wait for furigana to complete before fetching soramimi
  // so we can pass the furigana readings to help the AI know how to pronounce kanji
  const isJapanese = useMemo(() => lyricsHaveJapanese(lines), [lines]);
  
  // For Japanese songs, check if furigana is ready (needed for accurate soramimi)
  // For non-Japanese songs (Korean, etc.), we can start soramimi immediately
  // Memoized to avoid recalculating on every render
  const furiganaReadyForSoramimi = useMemo(
    () => !isJapanese || (!isFetchingFurigana && furiganaMap.size > 0),
    [isJapanese, isFetchingFurigana, furiganaMap]
  );
  
  // Keep a ref to furiganaMap so we can access it in the effect without adding it as a dependency
  // This prevents the soramimi effect from re-running during furigana streaming
  const furiganaMapRef = useRef(furiganaMap);
  furiganaMapRef.current = furiganaMap;

  // Fetch soramimi for lyrics when enabled using line-by-line streaming
  // For Japanese songs, waits for furigana to complete first so we can pass readings to the AI
  // biome-ignore lint/correctness/useExhaustiveDependencies: cacheKey captures lines content, shouldFetchSoramimi captures romanization settings
  useEffect(() => {
    // Capture songId at effect start for stale request detection
    const effectSongId = songId;

    // If completely disabled, no songId, or no lines, handle cleanup
    if (!effectSongId || !shouldFetchSoramimi || !hasLines) {
      // Only clear cache if songId actually changed (not just temporarily empty lines during re-fetch)
      const songChanged = effectSongId !== lastSoramimiSongIdRef.current;
      if (songChanged && soramimiCacheKeyRef.current !== "") {
        setSoramimiMap(new Map());
        soramimiCacheKeyRef.current = "";
        lastSoramimiSongIdRef.current = effectSongId || "";
      }
      return;
    }
    
    // Update last songId when we have data
    lastSoramimiSongIdRef.current = effectSongId;

    // If not showing original, don't fetch new data but keep existing soramimi cached
    if (!isShowingOriginal) {
      return;
    }

    // Check if offline
    if (isOffline()) {
      return;
    }
    
    // For Japanese songs, wait for furigana to be ready before fetching soramimi
    // This allows us to pass furigana readings to the AI for accurate kanji pronunciation
    if (isJapanese && !furiganaReadyForSoramimi) {
      console.log('[Soramimi] Waiting for furigana to complete for Japanese song...');
      return;
    }

    // Check if this is a force cache clear request
    const isForceRequest = lastSoramimiCacheBustTriggerRef.current !== lyricsCacheBustTrigger;
    
    // Skip if we already have this data and it's not a force request
    if (!isForceRequest && soramimiCacheKey === soramimiCacheKeyRef.current) {
      return;
    }

    // If we have cached soramimi from initial fetch, use it immediately
    // Only use if the cached data is for the same language we're requesting
    const prefetchedIsCorrectLanguage = prefetchedSoramimiInfo?.targetLanguage === soramimiTargetLanguage;
    if (prefetchedSoramimiInfo?.cached && prefetchedSoramimiInfo.data && !isForceRequest && prefetchedIsCorrectLanguage) {
      const finalMap = new Map<string, FuriganaSegment[]>();
      prefetchedSoramimiInfo.data.forEach((segments, index) => {
        if (index < lines.length && segments) {
          finalMap.set(lines[index].startTimeMs, segments);
        }
      });
      setSoramimiMap(finalMap);
      soramimiCacheKeyRef.current = soramimiCacheKey;
      return;
    }

    // If there's already a request in flight for this song, skip this effect run
    // This prevents duplicate requests when React re-runs the effect
    const existingReq = soramimiForceRequestRef.current;
    if (existingReq && !existingReq.controller.signal.aborted) {
      return;
    }
    // Clear stale aborted ref so we can start fresh
    if (existingReq?.controller.signal.aborted) {
      soramimiForceRequestRef.current = null;
    }
    
    // Generate a unique requestId for this effect run
    const requestId = `${effectSongId}-${lyricsCacheBustTrigger}-${Date.now()}`;
    
    // Start loading - clear old soramimi map to avoid showing stale data while fetching
    setIsFetchingSoramimi(true);
    setProgress(0);
    setSoramimiProgress(0);
    setError(undefined);
    setSoramimiMap(new Map());
    
    const controller = new AbortController();
    
    // Track this request so we can detect duplicates
    soramimiForceRequestRef.current = { controller, requestId };

    // Use line-by-line streaming for soramimi
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
      force: isForceRequest,
      signal: controller.signal,
      prefetchedInfo: !isForceRequest ? prefetchedSoramimiInfo : undefined,
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
        lastSoramimiCacheBustTriggerRef.current = lyricsCacheBustTrigger;
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        // Check for stale request
        if (effectSongId !== currentSongIdRef.current) return;
        
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        console.error("Failed to fetch soramimi:", err);
        setError(err instanceof Error ? err.message : i18n.t("common.errors.failedToFetchSoramimi"));
      })
      .finally(() => {
        // Clear force request ref when this request completes
        if (soramimiForceRequestRef.current?.requestId === requestId) {
          soramimiForceRequestRef.current = null;
        }
        
        if (!controller.signal.aborted && effectSongId === currentSongIdRef.current) {
          setIsFetchingSoramimi(false);
          setProgress(undefined);
          setSoramimiProgress(undefined);
        }
      });

    return () => {
      // Always abort this request on cleanup - this controller is scoped to this effect run
      controller.abort();
      // Only clear the ref if this is still the current request
      const isThisRequest = soramimiForceRequestRef.current?.requestId === requestId;
      if (isThisRequest) {
        soramimiForceRequestRef.current = null;
      }
      setIsFetchingSoramimi(false);
      setSoramimiProgress(undefined);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- soramimiCacheKey captures lines content + target language, shouldFetchSoramimi captures romanization settings, furiganaReadyForSoramimi handles furigana sequencing, furiganaMapRef accessed via ref to avoid re-runs during streaming
  }, [songId, soramimiCacheKey, shouldFetchSoramimi, hasLines, isShowingOriginal, lyricsCacheBustTrigger, prefetchedSoramimiInfo, isJapanese, furiganaReadyForSoramimi, soramimiTargetLanguage]);

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
    renderWithFurigana,
  };
}
