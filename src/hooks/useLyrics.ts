import { useEffect, useState, useRef, useCallback } from "react";
import type { LyricLine } from "@/types/lyrics";
import { parseLRC } from "@/utils/lrcParser";
import { useIpodStore } from "@/stores/useIpodStore";
import { isOffline } from "@/utils/offline";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";

interface UseLyricsParams {
  /** Song ID (YouTube video ID) - required for unified endpoint */
  songId: string;
  /** Song title (used for parsing) */
  title?: string;
  /** Song artist (used for parsing) */
  artist?: string;
  /** Current playback time in seconds */
  currentTime: number;
  /** Target language for translation (e.g., "en", "es", "ja"). If null or undefined, no translation. */
  translateTo?: string | null;
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
 * Response from unified song endpoint for lyrics
 */
interface UnifiedLyricsResponse {
  lyrics?: {
    /** Raw LRC (kept for backwards compat, not used by client) */
    lrc?: string;
    /** Raw KRC (kept for backwards compat, not used by client) */
    krc?: string;
    /** Cover image URL */
    cover?: string;
    /** Pre-parsed lines from server - primary source for client */
    parsedLines: Array<{
      startTimeMs: string;
      words: string;
      wordTimings?: Array<{
        text: string;
        startTimeMs: number;
        durationMs: number;
      }>;
    }>;
  };
  cached?: boolean;
}

/**
 * Response from unified song endpoint for translation
 */
interface UnifiedTranslationResponse {
  translation: string;
  cached?: boolean;
}

/**
 * Fetch timed lyrics (LRC) for a given song, optionally translate them,
 * and keep track of which line is currently active based on playback time.
 * Returns the parsed lyric lines and the index of the current line.
 * 
 * Uses the unified /api/song/{id} endpoint for all operations.
 */
export function useLyrics({
  songId,
  title = "",
  artist = "",
  currentTime,
  translateTo,
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
    // Early return if no songId
    if (!songId) {
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
    const cacheKey = `song:${songId}:${selectedMatchKey}`;
    
    // Force refresh only when user explicitly triggers via refreshLyrics()
    const isForced = lastRefetchTriggerRef.current !== refetchTrigger;
    
    // Skip fetch if we have cached data and no force refresh requested
    if (!isForced && cacheKey === cachedKeyRef.current) {
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

    // Build request body for unified endpoint
    const requestBody: {
      action: "fetch-lyrics";
      lyricsSource?: {
        hash: string;
        albumId: string | number;
        title: string;
        artist: string;
        album?: string;
      };
      force?: boolean;
    } = {
      action: "fetch-lyrics",
      force: isForced,
    };

    if (selectedMatch) {
      requestBody.lyricsSource = {
        hash: selectedMatch.hash,
        albumId: selectedMatch.albumId,
        title: selectedMatch.title || title,
        artist: selectedMatch.artist || artist,
        album: selectedMatch.album,
      };
    }

    abortableFetch(getApiUrl(`/api/song/${songId}`), {
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
        return res.json() as Promise<UnifiedLyricsResponse>;
      })
      .then((json) => {
        if (controller.signal.aborted) return;
        if (!json || !json.lyrics) throw new Error("No lyrics found");

        const parsedLines = json.lyrics.parsedLines;
        
        if (!parsedLines || parsedLines.length === 0) {
          throw new Error("No lyrics found");
        }

        console.log("[useLyrics] Received lyrics response:", {
          parsedLinesCount: parsedLines.length,
          cached: json.cached,
        });

        // Use server-provided pre-parsed lines
        const parsed: LyricLine[] = parsedLines.map((line: { startTimeMs: string; words: string; wordTimings?: { text: string; startTimeMs: number; durationMs: number }[] }) => ({
          startTimeMs: line.startTimeMs,
          words: line.words,
          wordTimings: line.wordTimings,
        }));

        setOriginalLines(parsed);
        cachedKeyRef.current = cacheKey;
        useIpodStore.setState({ currentLyrics: { lines: parsed } });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        handleLyricsError(err, setError, setOriginalLines, setCurrentLine);
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
  }, [songId, title, artist, refetchTrigger, selectedMatch]);

  // Effect for translating lyrics
  useEffect(() => {
    if (!songId || !translateTo || originalLines.length === 0) {
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

    abortableFetch(getApiUrl(`/api/song/${songId}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "translate",
        language: translateTo,
        force: isForceRequest,
      }),
      signal: controller.signal,
      timeout: 180000,
    })
      .then(async (res) => {
        if (controller.signal.aborted) return;
        
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(errorText || `Translation failed (status ${res.status})`);
        }

        const json = await res.json() as UnifiedTranslationResponse;
        if (!json.translation) {
          throw new Error("No translation returned");
        }

        const parsedTranslatedLines = parseLRC(json.translation, title, artist);
        setTranslatedLines(parsedTranslatedLines);
        lastCacheBustTriggerRef.current = lyricsCacheBustTrigger;
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        handleTranslationError(err, setError, setTranslatedLines);
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
  }, [songId, originalLines, translateTo, isFetchingOriginal, title, artist, lyricsCacheBustTrigger]);

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

// Helper functions for error handling
function handleLyricsError(
  err: unknown,
  setError: (e: string | undefined) => void,
  setOriginalLines: (lines: LyricLine[]) => void,
  setCurrentLine: (line: number) => void
) {
  console.error("[useLyrics] Error during lyrics fetch/parse:", err);
  if (err instanceof DOMException && err.name === "AbortError") {
    setError("Lyrics search timed out.");
  } else {
    const errorMessage = err instanceof Error ? err.message : "Unknown error fetching lyrics";
    const isNoLyricsError = 
      errorMessage.includes("500") || 
      errorMessage.includes("404") ||
      errorMessage.includes("Internal Server Error") ||
      errorMessage.includes("No lyrics") || 
      errorMessage.includes("not found") ||
      errorMessage.includes("No valid lyrics");
    if (isNoLyricsError) {
      setError("No lyrics available");
    } else {
      setError(errorMessage);
    }
  }
  setOriginalLines([]);
  setCurrentLine(-1);
  useIpodStore.setState({ currentLyrics: null });
}

function handleTranslationError(
  err: unknown,
  setError: (e: string | undefined) => void,
  setTranslatedLines: (lines: LyricLine[] | null) => void
) {
  console.error("useLyrics translation error", err);
  if (err instanceof DOMException && err.name === "AbortError") {
    setError("Lyrics translation timed out.");
  } else {
    setError(err instanceof Error ? err.message : "Unknown error during translation");
  }
  setTranslatedLines(null);
}
