import { useEffect, useState, useRef, useCallback } from "react";
import { LyricLine } from "@/types/lyrics";
import { parseLRC } from "@/utils/lrcParser";
import { parseKRC, isKRCFormat } from "@/utils/krcParser";
import { useIpodStore } from "@/stores/useIpodStore";
import { isOffline } from "@/utils/offline";
import { getApiUrl } from "@/utils/platform";
import { processSSEStream, isSSEResponse, SSEChunkEvent } from "@/utils/sse";
import { abortableFetch } from "@/utils/abortableFetch";

// Types for SSE streaming events from translation API
interface TranslationChunkEvent {
  type: "chunk";
  chunkIndex: number;
  totalChunks: number;
  startIndex: number;
  lines: string[];
}

interface TranslationCompleteEvent {
  type: "complete";
  totalLines: number;
}

interface TranslationErrorEvent {
  type: "error";
  message: string;
}

type TranslationSSEEvent = TranslationChunkEvent | TranslationCompleteEvent | TranslationErrorEvent;

interface UseLyricsParams {
  /** Song title */
  title?: string;
  /** Song artist */
  artist?: string;
  /** Song album */
  album?: string;
  /** Current playback time in seconds */
  currentTime: number;
  /** Target language for translation (e.g., "en", "es", "ja"). If null or undefined, no translation. */
  translateTo?: string | null;
  /** Override search query for lyrics lookup */
  searchQueryOverride?: string;
  /** Override selected match for lyrics fetching */
  selectedMatch?: {
    hash: string;
    albumId: string | number;
    title?: string;
    artist?: string;
    album?: string;
  };
}

interface LyricsState {
  lines: LyricLine[];
  /** Original untranslated lyrics (for furigana) */
  originalLines: LyricLine[];
  currentLine: number;
  isLoading: boolean; // True when fetching original LRC
  isTranslating: boolean; // True when translating lyrics
  error?: string;
  updateCurrentTimeManually: (newTimeInSeconds: number) => void;
}

/**
 * Extract text from an LRC line (removes timestamp)
 */
function extractLrcText(lrcLine: string): string {
  const match = lrcLine.match(/^\[[\d:.]+\](.*)$/);
  return match ? match[1] : lrcLine;
}

/**
 * Fetch timed lyrics (LRC) for a given song, optionally translate them,
 * and keep track of which line is currently active based on playback time.
 * Returns the parsed lyric lines and the index of the current line.
 */
export function useLyrics({
  title = "",
  artist = "",
  album = "",
  currentTime,
  translateTo,
  searchQueryOverride,
  selectedMatch,
}: UseLyricsParams): LyricsState {
  const [originalLines, setOriginalLines] = useState<LyricLine[]>([]);
  const [translatedLines, setTranslatedLines] = useState<LyricLine[] | null>(null);
  const [currentLine, setCurrentLine] = useState(-1);
  const [isFetchingOriginal, setIsFetchingOriginal] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const cachedKeyRef = useRef<string | null>(null);
  const lastTimeRef = useRef<number>(currentTime);
  // Track refresh trigger from the iPod store to force re-fetching
  const refetchTrigger = useIpodStore((s) => s.lyricsRefetchTrigger);
  const lastRefetchTriggerRef = useRef<number>(0);
  // Track cache bust trigger for forcing cache bypass (including translation)
  const lyricsCacheBustTrigger = useIpodStore((s) => s.lyricsCacheBustTrigger);
  const lastCacheBustTriggerRef = useRef<number>(0);

  // Effect for fetching original lyrics
  useEffect(() => {
    // Early return checks - don't clear state for these
    if (!title && !artist && !album) {
      // Clear state only when there's no track info
      setOriginalLines([]);
      setTranslatedLines(null);
      setCurrentLine(-1);
      setIsFetchingOriginal(false);
      setError(undefined);
      cachedKeyRef.current = null;
      return;
    }

    // Check if offline before fetching
    if (isOffline()) {
      setError("iPod requires an internet connection");
      return;
    }

    // Include selectedMatch hash in cache key to ensure different versions are cached separately
    const selectedMatchKey = selectedMatch?.hash || "";
    const cacheKey = `${title}__${artist}__${album}__${selectedMatchKey}`;
    
    // Force refresh only when user explicitly triggers via refreshLyrics()
    const isForced = lastRefetchTriggerRef.current !== refetchTrigger;
    
    // Skip fetch if we have cached data and no force refresh requested
    if (!isForced && cacheKey === cachedKeyRef.current) {
      // If original lyrics are cached, we might still need to translate if translateTo changed.
      // The translation effect will handle this.
      lastRefetchTriggerRef.current = refetchTrigger;
      return;
    }

    // We're going to fetch - now clear the state
    setOriginalLines([]);
    setTranslatedLines(null);
    setCurrentLine(-1);
    setIsFetchingOriginal(true);
    setIsTranslating(false);
    setError(undefined);

    const controller = new AbortController();

    // Build request body
    const requestBody: {
      title?: string;
      artist?: string;
      album?: string;
      force: boolean;
      action?: "auto" | "fetch";
      query?: string;
      selectedHash?: string;
      selectedAlbumId?: string | number;
      selectedTitle?: string;
      selectedArtist?: string;
      selectedAlbum?: string;
    } = {
      title,
      artist,
      album,
      force: isForced,
    };

    if (selectedMatch) {
      requestBody.action = "fetch";
      requestBody.selectedHash = selectedMatch.hash;
      requestBody.selectedAlbumId = selectedMatch.albumId;
      if (selectedMatch.title) requestBody.selectedTitle = selectedMatch.title;
      if (selectedMatch.artist) requestBody.selectedArtist = selectedMatch.artist;
      if (selectedMatch.album) requestBody.selectedAlbum = selectedMatch.album;
    } else if (searchQueryOverride) {
      requestBody.query = searchQueryOverride;
    }

    abortableFetch(getApiUrl("/api/lyrics"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
      timeout: 15000,
    })
      .then(async (res) => {
        if (controller.signal.aborted) return null;
        if (!res.ok) {
          if (res.status === 404) return null;
          throw new Error(`Failed to fetch lyrics (status ${res.status})`);
        }
        return res.json();
      })
      .then((json) => {
        if (controller.signal.aborted) return;
        if (!json) throw new Error("No lyrics found or fetch timed out");

        const lrc: string | undefined = json?.lyrics;
        const krc: string | undefined = json?.krcLyrics;
        if (!lrc && !krc) throw new Error("No lyrics found");

        const songTitle = json?.title ?? title;
        const songArtist = json?.artist ?? artist;

        console.log("[useLyrics] Received lyrics response:", {
          hasLrc: !!lrc,
          hasKrc: !!krc,
          lrcLength: lrc?.length,
          krcLength: krc?.length,
          songTitle,
          songArtist,
        });

        let parsed: LyricLine[];

        // Prefer KRC format if available (has word-level timing)
        if (krc && isKRCFormat(krc)) {
          console.log("[useLyrics] KRC format detected, parsing with parseKRC");
          const cleanedKrc = krc.replace(/\u200b/g, "");
          parsed = parseKRC(cleanedKrc, songTitle, songArtist);
          console.log("[useLyrics] Parsed KRC lyrics:", parsed.length, "lines");
          if (parsed.length === 0 && lrc) {
            console.log("[useLyrics] KRC parsing returned 0 lines, falling back to LRC");
            const cleanedLrc = lrc.replace(/\u200b/g, "");
            parsed = parseLRC(cleanedLrc, songTitle, songArtist);
            console.log("[useLyrics] Fallback LRC parsing:", parsed.length, "lines");
          }
        } else if (lrc) {
          console.log("[useLyrics] Using LRC format (no KRC or not KRC format)");
          const cleanedLrc = lrc.replace(/\u200b/g, "");
          parsed = parseLRC(cleanedLrc, songTitle, songArtist);
          console.log("[useLyrics] Parsed LRC lyrics:", parsed.length, "lines");
        } else {
          throw new Error("No valid lyrics format found");
        }
        
        if (parsed.length === 0) {
          console.warn("[useLyrics] Parsing resulted in 0 lines! This will show 'No lyrics available'");
        }

        setOriginalLines(parsed);
        cachedKeyRef.current = cacheKey;

        // Update iPod store with current lyrics
        useIpodStore.setState({ currentLyrics: { lines: parsed } });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.error("[useLyrics] Error during lyrics fetch/parse:", err);
        if (err instanceof DOMException && err.name === "AbortError") {
          setError("Lyrics search timed out.");
        } else {
          const errorMessage = err instanceof Error ? err.message : "Unknown error fetching lyrics";
          console.error("[useLyrics] Setting error state:", errorMessage);
          setError(errorMessage);
        }
        setOriginalLines([]);
        setCurrentLine(-1);
        // Clear lyrics in iPod store on error
        useIpodStore.setState({ currentLyrics: null });
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsFetchingOriginal(false);
          lastRefetchTriggerRef.current = refetchTrigger;
        }
      });

    return () => {
      controller.abort();
    };
  }, [title, artist, album, refetchTrigger, searchQueryOverride, selectedMatch]);

  // Effect for translating lyrics - now handles both streaming and non-streaming responses
  useEffect(() => {
    if (!translateTo || originalLines.length === 0) {
      setTranslatedLines(null);
      setIsTranslating(false);
      return;
    }

    // If original fetch is still in progress, wait for it.
    if (isFetchingOriginal) {
      setIsTranslating(false);
      return;
    }

    // Check if offline before translating
    if (isOffline()) {
      setIsTranslating(false);
      setError("iPod requires an internet connection");
      return;
    }

    // Check if this is a force cache clear request
    const isForceRequest = lastCacheBustTriggerRef.current !== lyricsCacheBustTrigger;

    setIsTranslating(true);
    setError(undefined);

    const controller = new AbortController();

    abortableFetch(getApiUrl("/api/translate-lyrics"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: originalLines,
        targetLanguage: translateTo,
        force: isForceRequest,
      }),
      signal: controller.signal,
      timeout: 180000, // Increased timeout for streaming
    })
      .then(async (res) => {
        if (controller.signal.aborted) return;

        // Check if this is a streaming response
        if (isSSEResponse(res)) {
          // Handle streaming response
          const lrcLinesCollected: string[] = new Array(originalLines.length).fill("");

          await processSSEStream<TranslationSSEEvent>({
            response: res,
            signal: controller.signal,
            onChunk: (event: SSEChunkEvent<TranslationSSEEvent>) => {
              if (controller.signal.aborted) return;

              // Server sends chunk data at top level, not nested in 'data'
              const chunkEvent = event as unknown as TranslationChunkEvent;

              // Update the collected LRC lines with this chunk's data
              chunkEvent.lines.forEach((lrcLine, index) => {
                const globalIndex = chunkEvent.startIndex + index;
                if (globalIndex < lrcLinesCollected.length) {
                  lrcLinesCollected[globalIndex] = lrcLine;
                }
              });

              // Build progressive lines: use translated where available, original elsewhere
              if (!controller.signal.aborted) {
                const progressiveLines: LyricLine[] = originalLines.map((origLine, idx) => {
                  if (lrcLinesCollected[idx]) {
                    const translatedText = extractLrcText(lrcLinesCollected[idx]);
                    return {
                      ...origLine,
                      words: translatedText,
                    };
                  }
                  return origLine;
                });
                setTranslatedLines([...progressiveLines]);
              }
            },
            onComplete: () => {
              // Final state - all lines should be translated
              if (!controller.signal.aborted) {
                const finalLines: LyricLine[] = originalLines.map((origLine, idx) => {
                  if (lrcLinesCollected[idx]) {
                    const translatedText = extractLrcText(lrcLinesCollected[idx]);
                    return {
                      ...origLine,
                      words: translatedText,
                    };
                  }
                  return origLine;
                });
                setTranslatedLines(finalLines);
                lastCacheBustTriggerRef.current = lyricsCacheBustTrigger;
              }
            },
            onError: (err) => {
              if (!controller.signal.aborted) {
                setError(err.message);
                setIsTranslating(false);
              }
            },
          });
        } else {
          // Handle non-streaming response (small requests or cached)
          const responseText = await res.text();
          if (controller.signal.aborted) return;
          
          if (!res.ok) {
            const errorMessage = responseText.startsWith("Error: ")
              ? responseText.substring(7)
              : responseText;
            throw new Error(
              errorMessage || `Translation request failed with status ${res.status}`
            );
          }
          
          if (responseText) {
            const parsedTranslatedLines = parseLRC(responseText, title, artist);
            setTranslatedLines(parsedTranslatedLines);
            lastCacheBustTriggerRef.current = lyricsCacheBustTrigger;
          } else {
            setTranslatedLines([]);
          }
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.error("useLyrics translation error", err);
        if (err instanceof DOMException && err.name === "AbortError") {
          setError("Lyrics translation timed out.");
        } else {
          setError(
            err instanceof Error
              ? err.message
              : "Unknown error during translation"
          );
        }
        setTranslatedLines(null);
        // Keep original lyrics in iPod store on translation error
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsTranslating(false);
          lastCacheBustTriggerRef.current = lyricsCacheBustTrigger;
        }
      });

    return () => {
      controller.abort();
    };
  }, [originalLines, translateTo, isFetchingOriginal, title, artist, lyricsCacheBustTrigger]);

  const displayLines = translatedLines || originalLines;

  // Function to calculate the current line based on a given time
  const calculateCurrentLine = useCallback(
    (timeInSeconds: number) => {
      if (!displayLines.length) return -1;

      const timeMs = timeInSeconds * 1000;
      let idx = displayLines.findIndex((line, i) => {
        const nextLineStart =
          i + 1 < displayLines.length
            ? parseInt(displayLines[i + 1].startTimeMs)
            : Infinity;
        return timeMs >= parseInt(line.startTimeMs) && timeMs < nextLineStart;
      });

      if (
        idx === -1 &&
        displayLines.length > 0 &&
        timeMs >= parseInt(displayLines[displayLines.length - 1].startTimeMs)
      ) {
        idx = displayLines.length - 1;
      }

      return idx;
    },
    [displayLines]
  );

  // Update current line based on displayed lines and current time
  useEffect(() => {
    lastTimeRef.current = currentTime;
    setCurrentLine(calculateCurrentLine(currentTime));
  }, [currentTime, calculateCurrentLine]);

  // Function to manually update the current time
  const updateCurrentTimeManually = useCallback(
    (newTimeInSeconds: number) => {
      lastTimeRef.current = newTimeInSeconds;
      setCurrentLine(calculateCurrentLine(newTimeInSeconds));
    },
    [calculateCurrentLine]
  );

  return {
    lines: displayLines,
    originalLines,
    currentLine,
    isLoading: isFetchingOriginal,
    isTranslating,
    error,
    updateCurrentTimeManually,
  };
}
