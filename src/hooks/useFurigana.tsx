import { useState, useRef, useEffect, useCallback } from "react";
import { LyricLine } from "@/types/lyrics";
import { useIpodStore } from "@/stores/useIpodStore";
import { getApiUrl } from "@/utils/platform";
import { isOffline } from "@/utils/offline";
import { processSSEStream, isSSEResponse, SSEChunkEvent } from "@/utils/sse";
import { abortableFetch } from "@/utils/abortableFetch";

// Type for furigana segments from API
export interface FuriganaSegment {
  text: string;
  reading?: string;
}

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
  /** Whether furigana is enabled */
  enabled: boolean;
  /** Whether we're showing original lyrics (not translations) */
  isShowingOriginal: boolean;
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
  /** Render helper that wraps text with ruby elements */
  renderWithFurigana: (line: LyricLine, processedText: string) => React.ReactNode;
  /** Check if text is Japanese (has both kanji and kana) */
  isJapaneseText: (text: string) => boolean;
}

const FURIGANA_TIMEOUT = 30000; // 30 seconds

/**
 * Hook for fetching and managing Japanese furigana annotations
 */
export function useFurigana({
  lines,
  enabled,
  isShowingOriginal,
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

  // Check if text is Japanese (contains kanji AND hiragana/katakana)
  // This distinguishes Japanese from Chinese (which only has hanzi, no kana)
  const isJapaneseText = useCallback((text: string): boolean => {
    const hasKanji = /[\u4E00-\u9FFF]/.test(text);
    const hasKana = /[\u3040-\u309F\u30A0-\u30FF]/.test(text); // Hiragana or Katakana
    return hasKanji && hasKana;
  }, []);

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
    // If completely disabled or no lines, clear everything
    if (!enabled || lines.length === 0) {
      setFuriganaMap(new Map());
      furiganaCacheKeyRef.current = "";
      setIsFetching(false);
      setError(undefined);
      return;
    }

    // If not showing original, don't fetch new data but keep existing furigana cached
    // The render function handles not displaying furigana when showing translations
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
      return; // Already fetched for these lines
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

        if (controller.signal.aborted) {
          return;
        }

        // Check if this is a streaming response
        if (isSSEResponse(res)) {
          // Handle streaming response
          const collectedFurigana = new Map<string, FuriganaSegment[]>();

          await processSSEStream<FuriganaSSEEvent>({
            response: res,
            signal: controller.signal,
            onChunk: (event: SSEChunkEvent<FuriganaSSEEvent>) => {
              if (controller.signal.aborted) return;
              
              // Server sends chunk data at top level, not nested in 'data'
              const chunkEvent = event as unknown as FuriganaChunkEvent;
              // Update the collected map with this chunk's data
              chunkEvent.annotatedLines.forEach((segments, index) => {
                const globalIndex = chunkEvent.startIndex + index;
                if (globalIndex < lines.length) {
                  const lineKey = lines[globalIndex].startTimeMs;
                  collectedFurigana.set(lineKey, segments);
                }
              });

              // Immediately update state with new data for progressive loading
              if (!controller.signal.aborted) {
                setFuriganaMap(new Map(collectedFurigana));
              }
            },
            onComplete: () => {
              // Final state - all furigana should be loaded
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

          // Set fetching to false after stream completes (similar to translate pattern)
          if (!controller.signal.aborted) {
            setIsFetching(false);
          }
        } else {
          // Handle non-streaming response (small requests or cached)
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
        if (controller.signal.aborted) {
          return;
        }
        
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
  }, [lines, enabled, isShowingOriginal, isJapaneseText, lyricsCacheBustTrigger]);

  // Render text with furigana using ruby elements
  // Only applies furigana when showing original lyrics (not translations)
  const renderWithFurigana = useCallback(
    (line: LyricLine, processedText: string): React.ReactNode => {
      // Don't apply furigana if disabled or if we're showing translations
      if (!enabled || !isShowingOriginal) {
        return processedText;
      }

      const segments = furiganaMap.get(line.startTimeMs);
      if (!segments || segments.length === 0) {
        return processedText;
      }

      return (
        <>
          {segments.map((segment, index) => {
            if (segment.reading) {
              return (
                <ruby key={index} className="lyrics-furigana">
                  {segment.text}
                  <rp>(</rp>
                  <rt className="lyrics-furigana-rt">{segment.reading}</rt>
                  <rp>)</rp>
                </ruby>
              );
            }
            return <span key={index}>{segment.text}</span>;
          })}
        </>
      );
    },
    [enabled, isShowingOriginal, furiganaMap]
  );

  return {
    furiganaMap,
    isFetching,
    error,
    renderWithFurigana,
    isJapaneseText,
  };
}
