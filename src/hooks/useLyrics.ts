import { useEffect, useState, useRef, useCallback } from "react";
import { LyricLine } from "@/types/lyrics";
import { parseLRC } from "@/utils/lrcParser";
import { useIpodStore } from "@/stores/useIpodStore";
import { isOffline } from "@/utils/offline";
import { getApiUrl } from "@/utils/platform";

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
  updateCurrentTimeManually: (newTimeInSeconds: number) => void; // Added function to manually update time
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
  const [translatedLines, setTranslatedLines] = useState<LyricLine[] | null>(
    null
  );
  const [currentLine, setCurrentLine] = useState(-1);
  const [isFetchingOriginal, setIsFetchingOriginal] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const cachedKeyRef = useRef<string | null>(null);
  // Add a ref to store the last computed time for manual updates
  const lastTimeRef = useRef<number>(currentTime);
  // Track refresh nonce from the iPod store to force re-fetching
  const refreshNonce = useIpodStore((s) => s.lyricsRefreshNonce);
  const lastRefreshNonceRef = useRef<number>(0);

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
      // Clear cache key so next valid track will fetch lyrics even if it has the same metadata
      cachedKeyRef.current = null;
      return;
    }

    // Check if offline before fetching
    if (isOffline()) {
      setError("iPod requires an internet connection");
      // Don't show toast here - let the component handle it to avoid duplicates
      return;
    }

    // Include selectedMatch hash in cache key to ensure different versions are cached separately
    const selectedMatchKey = selectedMatch?.hash || "";
    const cacheKey = `${title}__${artist}__${album}__${selectedMatchKey}`;
    
    // Force refresh only when user explicitly triggers via refreshLyrics() (e.g., selecting from search dialog)
    const isForced = lastRefreshNonceRef.current !== refreshNonce;
    
    // Skip fetch if we have cached data and no force refresh requested
    // Cache is keyed by hash, so same hash = same cached lyrics
    if (!isForced && cacheKey === cachedKeyRef.current) {
      // If original lyrics are cached, we might still need to translate if translateTo changed.
      // The translation effect will handle this.
      lastRefreshNonceRef.current = refreshNonce;
      return;
    }

    // We're going to fetch - now clear the state
    setOriginalLines([]);
    setTranslatedLines(null);
    setCurrentLine(-1);
    setIsFetchingOriginal(true);
    setIsTranslating(false); // Reset translation state
    setError(undefined);

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      console.warn("Lyrics fetch timed out");
    }, 15000);

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
      // Use fetch action with selected match
      // force flag is already set based on isForced (nonce change from refreshLyrics())
      requestBody.action = "fetch";
      requestBody.selectedHash = selectedMatch.hash;
      requestBody.selectedAlbumId = selectedMatch.albumId;
      if (selectedMatch.title) requestBody.selectedTitle = selectedMatch.title;
      if (selectedMatch.artist)
        requestBody.selectedArtist = selectedMatch.artist;
      if (selectedMatch.album) requestBody.selectedAlbum = selectedMatch.album;
    } else if (searchQueryOverride) {
      // Use query override but still auto-fetch (action defaults to "auto")
      requestBody.query = searchQueryOverride;
    }

    fetch(getApiUrl("/api/lyrics"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })
      .then(async (res) => {
        clearTimeout(timeoutId);
        if (!res.ok) {
          if (res.status === 404 || controller.signal.aborted) return null;
          throw new Error(`Failed to fetch lyrics (status ${res.status})`);
        }
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        if (!json) throw new Error("No lyrics found or fetch timed out");

        const lrc: string | undefined = json?.lyrics;
        if (!lrc) throw new Error("No lyrics found");

        const cleanedLrc = lrc.replace(/\u200b/g, "");
        const parsed = parseLRC(
          cleanedLrc,
          json?.title ?? title,
          json?.artist ?? artist
        );
        setOriginalLines(parsed);
        cachedKeyRef.current = cacheKey;

        // Update iPod store with current lyrics
        useIpodStore.setState({ currentLyrics: { lines: parsed } });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("useLyrics original fetch error", err);
        if (err instanceof DOMException && err.name === "AbortError") {
          setError("Lyrics search timed out.");
        } else {
          setError(
            err instanceof Error ? err.message : "Unknown error fetching lyrics"
          );
        }
        setOriginalLines([]);
        setCurrentLine(-1);
        // Clear lyrics in iPod store on error
        useIpodStore.setState({ currentLyrics: null });
      })
      .finally(() => {
        clearTimeout(timeoutId);
        if (!cancelled) {
          setIsFetchingOriginal(false);
          lastRefreshNonceRef.current = refreshNonce;
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [title, artist, album, refreshNonce, searchQueryOverride, selectedMatch]);

  // Effect for translating lyrics - now handles both streaming and non-streaming responses
  useEffect(() => {
    if (!translateTo || originalLines.length === 0) {
      setTranslatedLines(null);
      setIsTranslating(false);
      if (translateTo && originalLines.length > 0) {
        // This case should be handled by originalLines fetch completing first.
        // If originalLines is empty and translateTo is set, it means we are waiting for original fetch or original fetch failed.
      }
      return;
    }

    // If original fetch is still in progress, wait for it.
    if (isFetchingOriginal) {
      setIsTranslating(false); // Not yet translating
      return;
    }

    // Check if offline before translating
    if (isOffline()) {
      setIsTranslating(false);
      setError("iPod requires an internet connection");
      // Don't show toast here - let the component handle it to avoid duplicates
      return;
    }

    let cancelled = false;
    setIsTranslating(true);
    setError(undefined); // Clear previous errors

    const controller = new AbortController();
    const translationTimeoutId = setTimeout(() => {
      controller.abort();
      console.warn("Lyrics translation timed out");
    }, 180000); // Increased timeout for streaming

    const handleStreamingResponse = async (res: Response) => {
      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      // Initialize with original lines as placeholders for progressive display
      const progressiveLines: LyricLine[] = originalLines.map((line) => ({
        ...line,
      }));
      const lrcLinesCollected: string[] = new Array(originalLines.length).fill("");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (cancelled) {
          reader.cancel();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const eventData = JSON.parse(line.slice(6)) as TranslationSSEEvent;
              
              if (eventData.type === "chunk") {
                // Update the collected LRC lines with this chunk's data
                eventData.lines.forEach((lrcLine, index) => {
                  const globalIndex = eventData.startIndex + index;
                  if (globalIndex < lrcLinesCollected.length) {
                    lrcLinesCollected[globalIndex] = lrcLine;
                  }
                });

                // Parse the collected LRC and update progressive lines
                const partialLrc = lrcLinesCollected.filter((l) => l).join("\n");
                if (partialLrc && !cancelled) {
                  const parsedPartial = parseLRC(partialLrc, title, artist);
                  // Merge parsed lines with progressive display
                  parsedPartial.forEach((parsed) => {
                    const idx = progressiveLines.findIndex(
                      (p) => p.startTimeMs === parsed.startTimeMs
                    );
                    if (idx !== -1) {
                      progressiveLines[idx] = parsed;
                    }
                  });
                  setTranslatedLines([...progressiveLines]);
                }
              } else if (eventData.type === "complete") {
                // Final parse with all collected lines
                const fullLrc = lrcLinesCollected.join("\n");
                if (!cancelled) {
                  const parsedFinal = parseLRC(fullLrc, title, artist);
                  setTranslatedLines(parsedFinal);
                }
              } else if (eventData.type === "error") {
                throw new Error(eventData.message);
              }
            } catch (parseError) {
              console.warn("Failed to parse SSE event:", parseError);
            }
          }
        }
      }
    };

    const handleNonStreamingResponse = async (res: Response) => {
      const responseText = await res.text();
      if (!res.ok) {
        const errorMessage = responseText.startsWith("Error: ")
          ? responseText.substring(7)
          : responseText;
        throw new Error(
          errorMessage ||
            `Translation request failed with status ${res.status}`
        );
      }
      return responseText;
    };

    fetch(getApiUrl("/api/translate-lyrics"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: originalLines,
        targetLanguage: translateTo,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        clearTimeout(translationTimeoutId);
        
        // Check if this is a streaming response (text/event-stream)
        const contentType = res.headers.get("content-type") || "";
        
        if (contentType.includes("text/event-stream")) {
          // Handle streaming response
          await handleStreamingResponse(res);
        } else {
          // Handle non-streaming response (small requests or cached)
          const lrcText = await handleNonStreamingResponse(res);
          if (cancelled) return;
          if (lrcText) {
            const parsedTranslatedLines = parseLRC(lrcText, title, artist);
            setTranslatedLines(parsedTranslatedLines);
          } else {
            setTranslatedLines([]);
          }
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
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
        if (!cancelled) setIsTranslating(false);
        clearTimeout(translationTimeoutId);
      });

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(translationTimeoutId);
    };
  }, [originalLines, translateTo, isFetchingOriginal, title, artist]);

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
