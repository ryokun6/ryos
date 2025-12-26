import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { LyricLine, RomanizationSettings } from "@/types/lyrics";
import { useIpodStore } from "@/stores/useIpodStore";
import { isOffline } from "@/utils/offline";
import { toRomaji } from "wanakana";
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
import { processFuriganaChunks, processSoramimiChunks, type FuriganaChunkInfo, type SoramimiChunkInfo } from "@/utils/chunkedStream";

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
  /** Whether currently fetching */
  isFetching: boolean;
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
  const [isFetching, setIsFetching] = useState(false);
  const [progress, setProgress] = useState<number | undefined>();
  const [error, setError] = useState<string>();
  const furiganaCacheKeyRef = useRef<string>("");
  const soramimiCacheKeyRef = useRef<string>("");
  // Track current songId for race condition prevention
  const currentSongIdRef = useRef(songId);
  currentSongIdRef.current = songId;
  
  // Track cache bust trigger for clearing caches
  const lyricsCacheBustTrigger = useIpodStore((s) => s.lyricsCacheBustTrigger);
  const lastCacheBustTriggerRef = useRef<number>(lyricsCacheBustTrigger);
  
  // Stable refs for callbacks to avoid effect re-runs
  const onLoadingChangeRef = useRef(onLoadingChange);
  onLoadingChangeRef.current = onLoadingChange;

  // Notify parent when loading state changes (use ref to avoid effect dependency)
  useEffect(() => {
    onLoadingChangeRef.current?.(isFetching);
  }, [isFetching]);

  // Compute cache key outside effect - only when lines actually change
  const cacheKey = useMemo(() => {
    if (!songId || lines.length === 0) return "";
    return `song:${songId}:` + lines.map((l) => `${l.startTimeMs}:${l.words.slice(0, 20)}`).join("|");
  }, [songId, lines]);

  // Effect to immediately clear furigana and soramimi when cache bust trigger changes
  useEffect(() => {
    if (lastCacheBustTriggerRef.current !== lyricsCacheBustTrigger) {
      setFuriganaMap(new Map());
      setSoramimiMap(new Map());
      furiganaCacheKeyRef.current = "";
      soramimiCacheKeyRef.current = "";
      setError(undefined);
    }
  }, [lyricsCacheBustTrigger]);

  // Check conditions outside effect to avoid running effect body when not needed
  const shouldFetchFurigana = romanization.enabled && romanization.japaneseFurigana;
  const hasLines = lines.length > 0;

  // Fetch furigana for original lines when enabled using chunked streaming
  // biome-ignore lint/correctness/useExhaustiveDependencies: cacheKey captures lines content, shouldFetchFurigana captures romanization settings
  useEffect(() => {
    // Capture songId at effect start for stale request detection
    const effectSongId = songId;

    // If completely disabled, no songId, or no lines, clear everything
    if (!effectSongId || !shouldFetchFurigana || !hasLines) {
      if (furiganaCacheKeyRef.current !== "") {
        setFuriganaMap(new Map());
        furiganaCacheKeyRef.current = "";
        setIsFetching(false);
        setProgress(undefined);
        setError(undefined);
      }
      return;
    }

    // If not showing original, don't fetch new data but keep existing furigana cached
    if (!isShowingOriginal) {
      setIsFetching(false);
      return;
    }

    // Check if any lines are Japanese text (has both kanji and kana)
    const hasJapanese = lines.some((line) => isJapaneseText(line.words));
    if (!hasJapanese) {
      setFuriganaMap(new Map());
      setIsFetching(false);
      setProgress(undefined);
      setError(undefined);
      return;
    }

    // Check if offline
    if (isOffline()) {
      setError("iPod requires an internet connection");
      setIsFetching(false);
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
      setIsFetching(false);
      return;
    }

    // Start loading
    setIsFetching(true);
    setProgress(0);
    setError(undefined);
    
    const controller = new AbortController();

    // Use chunked streaming for furigana to avoid edge function timeouts
    const progressiveMap = new Map<string, FuriganaSegment[]>();
    
    processFuriganaChunks(effectSongId, {
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
      .then((allFurigana) => {
        if (controller.signal.aborted) return;
        // Check for stale request
        if (effectSongId !== currentSongIdRef.current) return;

        // Final update to ensure we have everything
        const finalMap = new Map<string, FuriganaSegment[]>();
        allFurigana.forEach((segments, index) => {
          if (index < lines.length && segments) {
            finalMap.set(lines[index].startTimeMs, segments);
          }
        });

        setFuriganaMap(finalMap);
        furiganaCacheKeyRef.current = cacheKey;
        lastCacheBustTriggerRef.current = lyricsCacheBustTrigger;
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        // Check for stale request
        if (effectSongId !== currentSongIdRef.current) return;
        
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        console.error("Failed to fetch furigana:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch furigana");
      })
      .finally(() => {
        if (!controller.signal.aborted && effectSongId === currentSongIdRef.current) {
          setIsFetching(false);
          setProgress(undefined);
        }
      });

    return () => {
      controller.abort();
      setIsFetching(false);
      setProgress(undefined);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cacheKey captures lines content, shouldFetchFurigana captures romanization settings
  }, [songId, cacheKey, shouldFetchFurigana, hasLines, isShowingOriginal, lyricsCacheBustTrigger, prefetchedInfo]);

  // Check conditions for soramimi fetching
  const shouldFetchSoramimi = romanization.enabled && romanization.chineseSoramimi;

  // Fetch soramimi for lyrics when enabled using chunked streaming
  // biome-ignore lint/correctness/useExhaustiveDependencies: cacheKey captures lines content, shouldFetchSoramimi captures romanization settings
  useEffect(() => {
    // Capture songId at effect start for stale request detection
    const effectSongId = songId;

    // If completely disabled, no songId, or no lines, clear everything
    if (!effectSongId || !shouldFetchSoramimi || !hasLines) {
      if (soramimiCacheKeyRef.current !== "") {
        setSoramimiMap(new Map());
        soramimiCacheKeyRef.current = "";
      }
      return;
    }

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
      return;
    }

    // Start loading
    setIsFetching(true);
    setProgress(0);
    setError(undefined);
    
    const controller = new AbortController();

    // Use chunked streaming for soramimi to avoid edge function timeouts
    const progressiveMap = new Map<string, FuriganaSegment[]>();
    
    processSoramimiChunks(effectSongId, {
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
      .then((allSoramimi) => {
        if (controller.signal.aborted) return;
        // Check for stale request
        if (effectSongId !== currentSongIdRef.current) return;

        // Final update to ensure we have everything
        const finalMap = new Map<string, FuriganaSegment[]>();
        allSoramimi.forEach((segments, index) => {
          if (index < lines.length && segments) {
            finalMap.set(lines[index].startTimeMs, segments);
          }
        });

        setSoramimiMap(finalMap);
        soramimiCacheKeyRef.current = cacheKey;
        lastCacheBustTriggerRef.current = lyricsCacheBustTrigger;
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        // Check for stale request
        if (effectSongId !== currentSongIdRef.current) return;
        
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        console.error("Failed to fetch soramimi:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch soramimi");
      })
      .finally(() => {
        if (!controller.signal.aborted && effectSongId === currentSongIdRef.current) {
          setIsFetching(false);
          setProgress(undefined);
        }
      });

    return () => {
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cacheKey captures lines content, shouldFetchSoramimi captures romanization settings
  }, [songId, cacheKey, shouldFetchSoramimi, hasLines, isShowingOriginal, lyricsCacheBustTrigger, prefetchedSoramimiInfo]);

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
    progress,
    error,
    renderWithFurigana,
  };
}
