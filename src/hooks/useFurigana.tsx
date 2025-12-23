import { useState, useRef, useEffect, useCallback } from "react";
import { LyricLine, RomanizationSettings } from "@/types/lyrics";
import { useIpodStore } from "@/stores/useIpodStore";
import { getApiUrl } from "@/utils/platform";
import { isOffline } from "@/utils/offline";
import { processSSEStream, isSSEResponse, SSEChunkEvent } from "@/utils/sse";
import { abortableFetch } from "@/utils/abortableFetch";
import { toRomaji } from "wanakana";
import {
  FuriganaSegment,
  hasKoreanText,
  isChineseText,
  isJapaneseText,
  hasKanaTextLocal,
  renderKoreanWithRomanization,
  renderChineseWithPinyin,
  renderKanaWithRomaji,
} from "@/utils/romanization";

// Re-export FuriganaSegment for consumers
export type { FuriganaSegment };

// Types for SSE streaming events from furigana API
interface FuriganaChunkEvent {
  type: "chunk";
  chunkIndex: number;
  totalChunks: number;
  startIndex: number;
  annotatedLines: FuriganaSegment[][];
}

interface FuriganaCompleteEvent {
  type: "complete";
  totalLines: number;
}

interface FuriganaErrorEvent {
  type: "error";
  message: string;
}

type FuriganaSSEEvent = FuriganaChunkEvent | FuriganaCompleteEvent | FuriganaErrorEvent;

interface UseFuriganaParams {
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
  /** Error message if any */
  error?: string;
  /** Render helper that wraps text with ruby elements (including all romanization types) */
  renderWithFurigana: (line: LyricLine, processedText: string) => React.ReactNode;
}

const FURIGANA_TIMEOUT = 30000; // 30 seconds

/**
 * Hook for fetching and managing Japanese furigana annotations and other romanization
 * 
 * Handles:
 * - Fetching furigana from API for Japanese text
 * - Rendering with furigana (hiragana over kanji)
 * - Converting furigana to romaji when enabled
 * - Korean romanization for mixed content
 * - Chinese pinyin for mixed content
 * - Standalone kana to romaji conversion
 */
export function useFurigana({
  lines,
  isShowingOriginal,
  romanization,
  onLoadingChange,
}: UseFuriganaParams): UseFuriganaReturn {
  const [furiganaMap, setFuriganaMap] = useState<Map<string, FuriganaSegment[]>>(new Map());
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string>();
  const furiganaCacheKeyRef = useRef<string>("");
  
  // Track cache bust trigger for clearing caches
  const lyricsCacheBustTrigger = useIpodStore((s) => s.lyricsCacheBustTrigger);
  const lastCacheBustTriggerRef = useRef<number>(lyricsCacheBustTrigger);

  // Notify parent when loading state changes
  useEffect(() => {
    onLoadingChange?.(isFetching);
  }, [isFetching, onLoadingChange]);

  // Effect to immediately clear furigana when cache bust trigger changes
  useEffect(() => {
    if (lastCacheBustTriggerRef.current !== lyricsCacheBustTrigger) {
      setFuriganaMap(new Map());
      furiganaCacheKeyRef.current = "";
      setError(undefined);
    }
  }, [lyricsCacheBustTrigger]);

  // Fetch furigana for original lines when enabled
  useEffect(() => {
    // Check if furigana fetching is needed
    const shouldFetchFurigana = romanization.enabled && romanization.japaneseFurigana;
    
    // If completely disabled or no lines, clear everything
    if (!shouldFetchFurigana || lines.length === 0) {
      setFuriganaMap(new Map());
      furiganaCacheKeyRef.current = "";
      setIsFetching(false);
      setError(undefined);
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

    // Create cache key from lines
    const cacheKey = JSON.stringify(lines.map((l) => l.startTimeMs + l.words));
    
    // Skip if we already have this data and it's not a force request
    if (!isForceRequest && cacheKey === furiganaCacheKeyRef.current) {
      return;
    }

    // Start loading
    setIsFetching(true);
    setError(undefined);
    
    const controller = new AbortController();

    const fetchFurigana = async () => {
      try {
        const res = await abortableFetch(getApiUrl("/api/furigana"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines, force: isForceRequest }),
          signal: controller.signal,
          timeout: FURIGANA_TIMEOUT,
          retry: {
            maxAttempts: 3,
            initialDelayMs: 1000,
            onRetry: (attempt, delayMs) => {
              console.warn(`Furigana fetch attempt ${attempt} failed, retrying in ${delayMs}ms...`);
            },
          },
        });

        if (controller.signal.aborted) return;

        // Check if this is a streaming response
        if (isSSEResponse(res)) {
          const collectedFurigana = new Map<string, FuriganaSegment[]>();

          await processSSEStream<FuriganaSSEEvent>({
            response: res,
            signal: controller.signal,
            onChunk: (event: SSEChunkEvent<FuriganaSSEEvent>) => {
              if (controller.signal.aborted) return;
              
              const chunkEvent = event as unknown as FuriganaChunkEvent;
              chunkEvent.annotatedLines.forEach((segments, index) => {
                const globalIndex = chunkEvent.startIndex + index;
                if (globalIndex < lines.length) {
                  const lineKey = lines[globalIndex].startTimeMs;
                  collectedFurigana.set(lineKey, segments);
                }
              });

              if (!controller.signal.aborted) {
                setFuriganaMap(new Map(collectedFurigana));
              }
            },
            onComplete: () => {
              if (!controller.signal.aborted) {
                setFuriganaMap(new Map(collectedFurigana));
                furiganaCacheKeyRef.current = cacheKey;
                lastCacheBustTriggerRef.current = lyricsCacheBustTrigger;
              }
            },
            onError: (err) => {
              if (!controller.signal.aborted) {
                setError(err.message);
              }
            },
          });

          if (!controller.signal.aborted) {
            setIsFetching(false);
          }
        } else {
          // Handle non-streaming response
          const data: { annotatedLines: FuriganaSegment[][] } = await res.json();
          const newMap = new Map<string, FuriganaSegment[]>();
          lines.forEach((line, index) => {
            if (data.annotatedLines[index]) {
              newMap.set(line.startTimeMs, data.annotatedLines[index]);
            }
          });
          
          if (!controller.signal.aborted) {
            setFuriganaMap(newMap);
            furiganaCacheKeyRef.current = cacheKey;
            lastCacheBustTriggerRef.current = lyricsCacheBustTrigger;
            setIsFetching(false);
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        
        if (err instanceof Error && err.name === "AbortError") {
          setIsFetching(false);
          return;
        }

        console.error("Failed to fetch furigana:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch furigana");
        setIsFetching(false);
      }
    };

    fetchFurigana();

    return () => {
      controller.abort();
      setIsFetching(false);
    };
  }, [lines, romanization.enabled, romanization.japaneseFurigana, isShowingOriginal, lyricsCacheBustTrigger]);

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
    error,
    renderWithFurigana,
  };
}
