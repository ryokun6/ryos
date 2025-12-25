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
} from "@/utils/romanization";
import type { FuriganaSegment } from "@/utils/romanization";
import { processFuriganaChunks } from "@/utils/chunkedStream";

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
}

interface UseFuriganaReturn {
  /** Map of startTimeMs -> FuriganaSegment[] */
  furiganaMap: Map<string, FuriganaSegment[]>;
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
}: UseFuriganaParams): UseFuriganaReturn {
  const [furiganaMap, setFuriganaMap] = useState<Map<string, FuriganaSegment[]>>(new Map());
  const [isFetching, setIsFetching] = useState(false);
  const [progress, setProgress] = useState<number | undefined>();
  const [error, setError] = useState<string>();
  const furiganaCacheKeyRef = useRef<string>("");
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

  // Effect to immediately clear furigana when cache bust trigger changes
  useEffect(() => {
    if (lastCacheBustTriggerRef.current !== lyricsCacheBustTrigger) {
      setFuriganaMap(new Map());
      furiganaCacheKeyRef.current = "";
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

    // Start loading
    setIsFetching(true);
    setProgress(0);
    setError(undefined);
    
    const controller = new AbortController();

    // Use chunked streaming for furigana to avoid edge function timeouts
    // NOTE: We don't use onChunk for progressive updates to avoid creating
    // intermediate Map objects (O(n) work per chunk with GC pressure).
    // Instead, we do a single batched update when all chunks complete.
    processFuriganaChunks(effectSongId, {
      force: isForceRequest,
      signal: controller.signal,
      onProgress: (chunkProgress) => {
        if (!controller.signal.aborted) {
          // Check for stale request
          if (effectSongId !== currentSongIdRef.current) return;
          setProgress(chunkProgress.percentage);
        }
      },
      // No onChunk callback - we batch all updates at the end
    })
      .then((allFurigana) => {
        if (controller.signal.aborted) return;
        // Check for stale request
        if (effectSongId !== currentSongIdRef.current) return;

        // Final update with all furigana
        const newMap = new Map<string, FuriganaSegment[]>();
        allFurigana.forEach((segments, index) => {
          if (index < lines.length && segments) {
            newMap.set(lines[index].startTimeMs, segments);
          }
        });

        setFuriganaMap(newMap);
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
  }, [songId, cacheKey, shouldFetchFurigana, hasLines, isShowingOriginal, lyricsCacheBustTrigger]);

  // Unified render function that handles all romanization types
  const renderWithFurigana = useCallback(
    (line: LyricLine, processedText: string): React.ReactNode => {
      // Master toggle - if romanization is disabled, return plain text
      if (!romanization.enabled || !isShowingOriginal) {
        return processedText;
      }
      
      const keyPrefix = `line-${line.startTimeMs}`;
      
      // If furigana is disabled, try other romanization types
      if (!romanization.japaneseFurigana) {
        // Chinese pinyin
        if (romanization.chinese && isChineseText(processedText)) {
          return renderChineseWithPinyin(processedText, keyPrefix);
        }
        // Korean romanization
        if (romanization.korean && hasKoreanText(processedText)) {
          return renderKoreanWithRomanization(processedText, keyPrefix);
        }
        // Japanese kana to romaji
        if (romanization.japaneseRomaji && hasKanaTextLocal(processedText)) {
          return renderKanaWithRomaji(processedText, keyPrefix);
        }
        return processedText;
      }

      // Get furigana segments for this line
      const segments = furiganaMap.get(line.startTimeMs);
      if (!segments || segments.length === 0) {
        // No furigana available - try other romanization types
        if (romanization.chinese && isChineseText(processedText)) {
          return renderChineseWithPinyin(processedText, keyPrefix);
        }
        if (romanization.korean && hasKoreanText(processedText)) {
          return renderKoreanWithRomanization(processedText, keyPrefix);
        }
        if (romanization.japaneseRomaji && hasKanaTextLocal(processedText)) {
          return renderKanaWithRomaji(processedText, keyPrefix);
        }
        return processedText;
      }

      // Render furigana segments with all romanization options
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
    [romanization, isShowingOriginal, furiganaMap]
  );

  return {
    furiganaMap,
    isFetching,
    progress,
    error,
    renderWithFurigana,
  };
}
