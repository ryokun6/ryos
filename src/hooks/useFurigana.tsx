import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { LyricLine, RomanizationSettings } from "@/types/lyrics";
import { useIpodStore } from "@/stores/useIpodStore";
import { isOffline } from "@/utils/offline";
import { toRomaji } from "wanakana";
import i18n from "@/lib/i18n";
import {
  hasKoreanText,
  isChineseText,
  isJapaneseText,
  hasKanaTextLocal,
  renderKoreanWithRomanization,
  renderChineseWithPinyin,
  renderKanaWithRomaji,
  getKoreanPronunciationOnly,
  getChinesePronunciationOnly,
  getKanaPronunciationOnly,
  getFuriganaSegmentsPronunciationOnly,
} from "@/utils/romanization";
import type { FuriganaSegment } from "@/utils/romanization";
import { 
  processFuriganaSSE, 
  resumeFuriganaSSE,
  processSoramimiSSE, 
  resumeSoramimiSSE,
  type FuriganaChunkInfo, 
  type SoramimiChunkInfo,
  type FuriganaResult,
  type SoramimiResult,
} from "@/utils/chunkedStream";

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
  prefetchedInfo?: FuriganaChunkInfo;
  /** Pre-fetched soramimi info from initial lyrics request (skips extra API call) */
  prefetchedSoramimiInfo?: SoramimiChunkInfo;
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
  /** Whether currently resuming failed furigana lines */
  isResumingFurigana: boolean;
  /** Whether currently resuming failed soramimi lines */
  isResumingSoramimi: boolean;
  /** Progress percentage (0-100) when streaming */
  progress?: number;
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
}: UseFuriganaParams): UseFuriganaReturn {
  const [furiganaMap, setFuriganaMap] = useState<Map<string, FuriganaSegment[]>>(new Map());
  const [soramimiMap, setSoramimiMap] = useState<Map<string, FuriganaSegment[]>>(new Map());
  const [isFetchingFurigana, setIsFetchingFurigana] = useState(false);
  const [isFetchingSoramimi, setIsFetchingSoramimi] = useState(false);
  const [isResumingFurigana, setIsResumingFurigana] = useState(false);
  const [isResumingSoramimi, setIsResumingSoramimi] = useState(false);
  const [progress, setProgress] = useState<number | undefined>();
  const [error, setError] = useState<string>();
  
  // Track failed lines for resume
  const [failedFuriganaLines, setFailedFuriganaLines] = useState<number[]>([]);
  const [failedSoramimiLines, setFailedSoramimiLines] = useState<number[]>([]);
  
  // Combined fetching state for backwards compatibility
  const isFetching = isFetchingFurigana || isFetchingSoramimi;
  const furiganaCacheKeyRef = useRef<string>("");
  const soramimiCacheKeyRef = useRef<string>("");
  // Track current songId for race condition prevention
  const currentSongIdRef = useRef(songId);
  currentSongIdRef.current = songId;
  
  // Track cache bust trigger for clearing caches
  const lyricsCacheBustTrigger = useIpodStore((s) => s.lyricsCacheBustTrigger);
  const lastCacheBustTriggerRef = useRef<number>(lyricsCacheBustTrigger);
  
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

  // Clear force request refs when songId changes to prevent cross-song pollution
  useEffect(() => {
    furiganaForceRequestRef.current = null;
    soramimiForceRequestRef.current = null;
  }, [songId]);
  
  // Effect to immediately clear furigana and soramimi when cache bust trigger changes
  useEffect(() => {
    if (lastCacheBustTriggerRef.current !== lyricsCacheBustTrigger) {
      setFuriganaMap(new Map());
      setSoramimiMap(new Map());
      furiganaCacheKeyRef.current = "";
      soramimiCacheKeyRef.current = "";
      setError(undefined);
      // Clear force request refs to prevent stale state blocking new requests
      furiganaForceRequestRef.current = null;
      soramimiForceRequestRef.current = null;
    }
  }, [lyricsCacheBustTrigger]);

  // Check conditions outside effect to avoid running effect body when not needed
  const shouldFetchFurigana = romanization.enabled && romanization.japaneseFurigana;
  const hasLines = lines.length > 0;
  
  // Track the last songId we had data for - only clear cache when song actually changes
  const lastFuriganaSongIdRef = useRef<string>("");

  // Fetch furigana for original lines when enabled using chunked streaming
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
    const isForceRequest = lastCacheBustTriggerRef.current !== lyricsCacheBustTrigger;
    
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
      
      // Check if there are failed lines that need resume
      if (prefetchedInfo.isPartial && prefetchedInfo.failedLines && prefetchedInfo.failedLines.length > 0) {
        setFailedFuriganaLines(prefetchedInfo.failedLines);
      } else {
        setFailedFuriganaLines([]);
      }
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
    setError(undefined);
    
    const controller = new AbortController();

    // Track this request so we can detect duplicates
    furiganaForceRequestRef.current = { controller, requestId };

    // Use chunked streaming for furigana to avoid edge function timeouts
    const progressiveMap = new Map<string, FuriganaSegment[]>();
    
    processFuriganaSSE(effectSongId, {
      force: isForceRequest,
      signal: controller.signal,
      // Pass pre-fetched info to skip get-chunk-info call
      prefetchedInfo: !isForceRequest ? prefetchedInfo : undefined,
      onProgress: (chunkProgress) => {
        if (!controller.signal.aborted) {
          if (effectSongId !== currentSongIdRef.current) return;
          setProgress(chunkProgress.percentage);
        }
      },
      onChunk: (_chunkIndex, startIndex, furigana) => {
        if (controller.signal.aborted) return;
        if (effectSongId !== currentSongIdRef.current) return;
        
        furigana.forEach((segments, i) => {
          const lineIndex = startIndex + i;
          if (lineIndex < lines.length && segments) {
            progressiveMap.set(lines[lineIndex].startTimeMs, segments);
          }
        });
        
        setFuriganaMap(new Map(progressiveMap));
      },
    })
      .then((result: FuriganaResult) => {
        if (controller.signal.aborted) return;
        // Check for stale request
        if (effectSongId !== currentSongIdRef.current) return;

        // Final update to ensure we have everything
        const finalMap = new Map<string, FuriganaSegment[]>();
        result.data.forEach((segments, index) => {
          if (index < lines.length && segments) {
            finalMap.set(lines[index].startTimeMs, segments);
          }
        });

        setFuriganaMap(finalMap);
        furiganaCacheKeyRef.current = cacheKey;
        lastCacheBustTriggerRef.current = lyricsCacheBustTrigger;
        
        // Track failed lines for resume
        if (result.isPartial && result.failedLines.length > 0) {
          setFailedFuriganaLines(result.failedLines);
        } else {
          setFailedFuriganaLines([]);
        }
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
        }
      });

    return () => {
      // Always abort this request on cleanup
      const isThisRequest = furiganaForceRequestRef.current?.requestId === requestId;
      if (isThisRequest) {
        controller.abort();
        furiganaForceRequestRef.current = null;
        setIsFetchingFurigana(false);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cacheKey captures lines content, shouldFetchFurigana captures romanization settings
  }, [songId, cacheKey, shouldFetchFurigana, hasLines, isShowingOriginal, lyricsCacheBustTrigger, prefetchedInfo]);

  // Auto-resume failed furigana lines
  // biome-ignore lint/correctness/useExhaustiveDependencies: only trigger when failedFuriganaLines changes
  useEffect(() => {
    // Skip if no failed lines, not enabled, or already fetching/resuming
    if (
      failedFuriganaLines.length === 0 ||
      !shouldFetchFurigana ||
      !songId ||
      !isShowingOriginal ||
      isFetchingFurigana ||
      isResumingFurigana ||
      isOffline()
    ) {
      return;
    }

    // Capture current values for async operations
    const effectSongId = songId;
    const linesToResume = [...failedFuriganaLines];
    
    setIsResumingFurigana(true);
    setProgress(0);
    
    const controller = new AbortController();
    
    resumeFuriganaSSE(effectSongId, linesToResume, {
      signal: controller.signal,
      onProgress: (chunkProgress) => {
        if (!controller.signal.aborted && effectSongId === currentSongIdRef.current) {
          setProgress(chunkProgress.percentage);
        }
      },
      onLineUpdate: (lineIndex, segments) => {
        if (controller.signal.aborted || effectSongId !== currentSongIdRef.current) return;
        
        // Update the furigana map progressively
        if (lineIndex < lines.length) {
          setFuriganaMap(prev => {
            const newMap = new Map(prev);
            newMap.set(lines[lineIndex].startTimeMs, segments);
            return newMap;
          });
        }
      },
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (effectSongId !== currentSongIdRef.current) return;
        
        // Update failed lines with remaining failures
        if (result.stillFailedLines.length > 0) {
          console.warn(`Furigana resume: ${result.stillFailedLines.length} lines still failed after resume`);
        }
        
        // Clear failed lines since we've attempted resume
        setFailedFuriganaLines([]);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (effectSongId !== currentSongIdRef.current) return;
        
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        
        console.error("Failed to resume furigana:", err);
      })
      .finally(() => {
        if (!controller.signal.aborted && effectSongId === currentSongIdRef.current) {
          setIsResumingFurigana(false);
          setProgress(undefined);
        }
      });

    return () => {
      controller.abort();
    };
  }, [failedFuriganaLines, shouldFetchFurigana, songId, isShowingOriginal, isFetchingFurigana, isResumingFurigana, lines]);

  // Check conditions for soramimi fetching
  const shouldFetchSoramimi = romanization.enabled && romanization.chineseSoramimi;
  
  // Track the last songId we had data for - only clear cache when song actually changes
  const lastSoramimiSongIdRef = useRef<string>("");

  // Fetch soramimi for lyrics when enabled using chunked streaming
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

    // Check if this is a force cache clear request
    const isForceRequest = lastCacheBustTriggerRef.current !== lyricsCacheBustTrigger;
    
    // Skip if we already have this data and it's not a force request
    if (!isForceRequest && cacheKey === soramimiCacheKeyRef.current) {
      return;
    }

    // If we have cached soramimi from initial fetch, use it immediately
    if (prefetchedSoramimiInfo?.cached && prefetchedSoramimiInfo.data && !isForceRequest) {
      const finalMap = new Map<string, FuriganaSegment[]>();
      prefetchedSoramimiInfo.data.forEach((segments, index) => {
        if (index < lines.length && segments) {
          finalMap.set(lines[index].startTimeMs, segments);
        }
      });
      setSoramimiMap(finalMap);
      soramimiCacheKeyRef.current = cacheKey;
      
      // Check if there are failed lines that need resume
      if (prefetchedSoramimiInfo.isPartial && prefetchedSoramimiInfo.failedLines && prefetchedSoramimiInfo.failedLines.length > 0) {
        setFailedSoramimiLines(prefetchedSoramimiInfo.failedLines);
      } else {
        setFailedSoramimiLines([]);
      }
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
    
    // Start loading
    setIsFetchingSoramimi(true);
    setProgress(0);
    setError(undefined);
    
    const controller = new AbortController();
    
    // Track this request so we can detect duplicates
    soramimiForceRequestRef.current = { controller, requestId };

    // Use SSE streaming for soramimi - server processes all chunks and caches result
    const progressiveMap = new Map<string, FuriganaSegment[]>();
    
    processSoramimiSSE(effectSongId, {
      force: isForceRequest,
      signal: controller.signal,
      // Pass pre-fetched info to skip get-chunk-info call
      prefetchedInfo: !isForceRequest ? prefetchedSoramimiInfo : undefined,
      onProgress: (chunkProgress) => {
        if (!controller.signal.aborted) {
          if (effectSongId !== currentSongIdRef.current) return;
          setProgress(chunkProgress.percentage);
        }
      },
      onChunk: (_chunkIndex, startIndex, soramimi) => {
        if (controller.signal.aborted) return;
        if (effectSongId !== currentSongIdRef.current) return;
        
        soramimi.forEach((segments, i) => {
          const lineIndex = startIndex + i;
          if (lineIndex < lines.length && segments) {
            progressiveMap.set(lines[lineIndex].startTimeMs, segments);
          }
        });
        
        setSoramimiMap(new Map(progressiveMap));
      },
    })
      .then((result: SoramimiResult) => {
        if (controller.signal.aborted) return;
        // Check for stale request
        if (effectSongId !== currentSongIdRef.current) return;

        // Final update to ensure we have everything
        const finalMap = new Map<string, FuriganaSegment[]>();
        result.data.forEach((segments, index) => {
          if (index < lines.length && segments) {
            finalMap.set(lines[index].startTimeMs, segments);
          }
        });

        setSoramimiMap(finalMap);
        soramimiCacheKeyRef.current = cacheKey;
        lastCacheBustTriggerRef.current = lyricsCacheBustTrigger;
        
        // Track failed lines for resume
        if (result.isPartial && result.failedLines.length > 0) {
          setFailedSoramimiLines(result.failedLines);
        } else {
          setFailedSoramimiLines([]);
        }
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
        }
      });

    return () => {
      // Always abort this request on cleanup
      // This prevents stale requests with wrong totalChunks from continuing
      const isThisRequest = soramimiForceRequestRef.current?.requestId === requestId;
      if (isThisRequest) {
        controller.abort();
        soramimiForceRequestRef.current = null;
        setIsFetchingSoramimi(false);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cacheKey captures lines content, shouldFetchSoramimi captures romanization settings
  }, [songId, cacheKey, shouldFetchSoramimi, hasLines, isShowingOriginal, lyricsCacheBustTrigger, prefetchedSoramimiInfo]);

  // Auto-resume failed soramimi lines
  // biome-ignore lint/correctness/useExhaustiveDependencies: only trigger when failedSoramimiLines changes
  useEffect(() => {
    // Skip if no failed lines, not enabled, or already fetching/resuming
    if (
      failedSoramimiLines.length === 0 ||
      !shouldFetchSoramimi ||
      !songId ||
      !isShowingOriginal ||
      isFetchingSoramimi ||
      isResumingSoramimi ||
      isOffline()
    ) {
      return;
    }

    // Capture current values for async operations
    const effectSongId = songId;
    const linesToResume = [...failedSoramimiLines];
    
    setIsResumingSoramimi(true);
    setProgress(0);
    
    const controller = new AbortController();
    
    resumeSoramimiSSE(effectSongId, linesToResume, {
      signal: controller.signal,
      onProgress: (chunkProgress) => {
        if (!controller.signal.aborted && effectSongId === currentSongIdRef.current) {
          setProgress(chunkProgress.percentage);
        }
      },
      onLineUpdate: (lineIndex, segments) => {
        if (controller.signal.aborted || effectSongId !== currentSongIdRef.current) return;
        
        // Update the soramimi map progressively
        if (lineIndex < lines.length) {
          setSoramimiMap(prev => {
            const newMap = new Map(prev);
            newMap.set(lines[lineIndex].startTimeMs, segments);
            return newMap;
          });
        }
      },
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (effectSongId !== currentSongIdRef.current) return;
        
        // Update failed lines with remaining failures
        if (result.stillFailedLines.length > 0) {
          // Some lines still failed - could retry again later
          // For now, just log it - we don't want infinite retries
          console.warn(`Soramimi resume: ${result.stillFailedLines.length} lines still failed after resume`);
        }
        
        // Clear failed lines since we've attempted resume
        setFailedSoramimiLines([]);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (effectSongId !== currentSongIdRef.current) return;
        
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        
        console.error("Failed to resume soramimi:", err);
        // Don't show error to user for resume failures - the partial data is still usable
      })
      .finally(() => {
        if (!controller.signal.aborted && effectSongId === currentSongIdRef.current) {
          setIsResumingSoramimi(false);
          setProgress(undefined);
        }
      });

    return () => {
      controller.abort();
    };
  // Only trigger when failed lines list changes
  }, [failedSoramimiLines, shouldFetchSoramimi, songId, isShowingOriginal, isFetchingSoramimi, isResumingSoramimi, lines]);

  // Unified render function that handles all romanization types
  const renderWithFurigana = useCallback(
    (line: LyricLine, processedText: string): React.ReactNode => {
      // Master toggle - if romanization is disabled, return plain text
      if (!romanization.enabled || !isShowingOriginal) {
        return processedText;
      }
      
      const keyPrefix = `line-${line.startTimeMs}`;
      const pronunciationOnly = romanization.pronunciationOnly ?? false;
      
      // Chinese soramimi (misheard lyrics) - renders phonetic Chinese over ALL original text
      // This takes priority over all other pronunciation options when enabled
      if (romanization.chineseSoramimi) {
        const soramimiSegments = soramimiMap.get(line.startTimeMs);
        if (soramimiSegments && soramimiSegments.length > 0) {
          // Pronunciation-only mode: show only the Chinese soramimi readings
          if (pronunciationOnly) {
            const pronunciationText = soramimiSegments.map(seg => seg.reading || seg.text).join("");
            return <span key={keyPrefix}>{pronunciationText}</span>;
          }
          return (
            <>
              {soramimiSegments.map((segment, index) => {
                // If there's a reading (the Chinese soramimi), display as ruby
                if (segment.reading) {
                  return (
                    // biome-ignore lint/suspicious/noArrayIndexKey: segments are stable and don't reorder
                    <ruby key={index} className="lyrics-furigana lyrics-soramimi">
                      {segment.text}
                      <rp>(</rp>
                      <rt className="lyrics-furigana-rt lyrics-soramimi-rt">{segment.reading}</rt>
                      <rp>)</rp>
                    </ruby>
                  );
                }
                // biome-ignore lint/suspicious/noArrayIndexKey: segments are stable and don't reorder
                return <span key={index}>{segment.text}</span>;
              })}
            </>
          );
        }
        // If soramimi is enabled but no data yet, show plain text (don't fall through to other methods)
        // This ensures soramimi is the exclusive annotation when enabled
        return processedText;
      }
      
      // If furigana is disabled, try other romanization types
      if (!romanization.japaneseFurigana) {
        // Chinese pinyin
        if (romanization.chinese && isChineseText(processedText)) {
          if (pronunciationOnly) {
            return <span key={keyPrefix}>{getChinesePronunciationOnly(processedText)}</span>;
          }
          return renderChineseWithPinyin(processedText, keyPrefix);
        }
        // Korean romanization
        if (romanization.korean && hasKoreanText(processedText)) {
          if (pronunciationOnly) {
            return <span key={keyPrefix}>{getKoreanPronunciationOnly(processedText)}</span>;
          }
          return renderKoreanWithRomanization(processedText, keyPrefix);
        }
        // Japanese kana to romaji
        if (romanization.japaneseRomaji && hasKanaTextLocal(processedText)) {
          if (pronunciationOnly) {
            return <span key={keyPrefix}>{getKanaPronunciationOnly(processedText)}</span>;
          }
          return renderKanaWithRomaji(processedText, keyPrefix);
        }
        return processedText;
      }

      // Get furigana segments for this line
      const segments = furiganaMap.get(line.startTimeMs);
      if (!segments || segments.length === 0) {
        // No furigana available - try other romanization types
        if (romanization.chinese && isChineseText(processedText)) {
          if (pronunciationOnly) {
            return <span key={keyPrefix}>{getChinesePronunciationOnly(processedText)}</span>;
          }
          return renderChineseWithPinyin(processedText, keyPrefix);
        }
        if (romanization.korean && hasKoreanText(processedText)) {
          if (pronunciationOnly) {
            return <span key={keyPrefix}>{getKoreanPronunciationOnly(processedText)}</span>;
          }
          return renderKoreanWithRomanization(processedText, keyPrefix);
        }
        if (romanization.japaneseRomaji && hasKanaTextLocal(processedText)) {
          if (pronunciationOnly) {
            return <span key={keyPrefix}>{getKanaPronunciationOnly(processedText)}</span>;
          }
          return renderKanaWithRomaji(processedText, keyPrefix);
        }
        return processedText;
      }

      // Pronunciation-only mode: show only the phonetic readings
      if (pronunciationOnly) {
        const options = {
          koreanRomanization: romanization.korean,
          japaneseRomaji: romanization.japaneseRomaji,
          chinesePinyin: romanization.chinese,
        };
        return <span key={keyPrefix}>{getFuriganaSegmentsPronunciationOnly(segments, options)}</span>;
      }

      // Render furigana segments with all romanization options (ruby annotations)
      return (
        <>
          {segments.map((segment, index) => {
            // Handle Japanese furigana (hiragana reading over kanji)
            if (segment.reading) {
              const displayReading = romanization.japaneseRomaji 
                ? toRomaji(segment.reading)
                : segment.reading;
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: segments are stable and don't reorder
                <ruby key={index} className="lyrics-furigana">
                  {segment.text}
                  <rp>(</rp>
                  <rt className="lyrics-furigana-rt">{displayReading}</rt>
                  <rp>)</rp>
                </ruby>
              );
            }
            
            // Korean romanization for mixed content
            if (romanization.korean && hasKoreanText(segment.text)) {
              return renderKoreanWithRomanization(segment.text, `seg-${index}`);
            }
            
            // Chinese pinyin for mixed content
            if (romanization.chinese && isChineseText(segment.text)) {
              return renderChineseWithPinyin(segment.text, `seg-${index}`);
            }
            
            // Standalone kana to romaji
            if (romanization.japaneseRomaji && hasKanaTextLocal(segment.text)) {
              return renderKanaWithRomaji(segment.text, `seg-${index}`);
            }
            
            // biome-ignore lint/suspicious/noArrayIndexKey: segments are stable and don't reorder
            return <span key={index}>{segment.text}</span>;
          })}
        </>
      );
    },
    [romanization, isShowingOriginal, furiganaMap, soramimiMap]
  );

  return {
    furiganaMap,
    soramimiMap,
    isFetching,
    isFetchingFurigana,
    isFetchingSoramimi,
    isResumingFurigana,
    isResumingSoramimi,
    progress,
    error,
    renderWithFurigana,
  };
}
