import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import type { LyricLine } from "@/types/lyrics";
import { useIpodStore } from "@/stores/useIpodStore";
import { useCacheBustTrigger, useRefetchTrigger } from "@/hooks/useCacheBustTrigger";
import { isOffline } from "@/utils/offline";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import {
  processTranslationSSE,
  parseLrcToTranslations,
  type TranslationStreamInfo,
  type FuriganaStreamInfo,
  type SoramimiStreamInfo,
  type TranslationResult,
} from "@/utils/chunkedStream";
import { parseLyricTimestamps, findCurrentLineIndex } from "@/utils/lyricsSearch";

// =============================================================================
// Types
// =============================================================================

interface UseLyricsParams {
  songId: string;
  title?: string;
  artist?: string;
  currentTime: number;
  translateTo?: string | null;
  /** Include furigana info in initial fetch (for Japanese romanization) */
  includeFurigana?: boolean;
  /** Include soramimi info in initial fetch (for misheard lyrics) */
  includeSoramimi?: boolean;
  /** Target language for soramimi: "zh-TW" for Chinese, "en" for English */
  soramimiTargetLanguage?: "zh-TW" | "en";
  selectedMatch?: {
    hash: string;
    albumId: string | number;
    title?: string;
    artist?: string;
    album?: string;
  };
  /** Auth credentials (required for force refresh / changing lyrics source) */
  auth?: {
    username: string;
    authToken: string;
  };
}

interface LyricsState {
  lines: LyricLine[];
  originalLines: LyricLine[];
  currentLine: number;
  isLoading: boolean;
  isTranslating: boolean;
  translationProgress?: number;
  error?: string;
  updateCurrentTimeManually: (newTimeInSeconds: number) => void;
  /** Pre-fetched furigana info (pass to useFurigana to skip extra API call) */
  furiganaInfo?: FuriganaStreamInfo;
  /** Pre-fetched soramimi info (pass to useFurigana to skip extra API call) */
  soramimiInfo?: SoramimiStreamInfo;
}

interface ParsedLine {
  startTimeMs: string;
  words: string;
  wordTimings?: Array<{
    text: string;
    startTimeMs: number;
    durationMs: number;
  }>;
}

interface UnifiedLyricsResponse {
  lyrics?: {
    parsedLines: ParsedLine[];
  };
  cached?: boolean;
  translation?: TranslationStreamInfo;
  furigana?: FuriganaStreamInfo;
  soramimi?: SoramimiStreamInfo;
}

// =============================================================================
// Hook
// =============================================================================

export function useLyrics({
  songId,
  title = "",
  artist = "",
  currentTime,
  translateTo,
  includeFurigana,
  includeSoramimi,
  soramimiTargetLanguage = "zh-TW",
  selectedMatch,
  auth,
}: UseLyricsParams): LyricsState {
  const authCredentials = useMemo(
    () =>
      auth?.username && auth?.authToken
        ? { username: auth.username, authToken: auth.authToken }
        : undefined,
    [auth?.username, auth?.authToken]
  );

  // State
  const [originalLines, setOriginalLines] = useState<LyricLine[]>([]);
  const [translatedLines, setTranslatedLines] = useState<LyricLine[] | null>(null);
  const [currentLine, setCurrentLine] = useState(-1);
  const [isFetchingOriginal, setIsFetchingOriginal] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState<number | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [furiganaInfo, setFuriganaInfo] = useState<FuriganaStreamInfo | undefined>();
  const [soramimiInfo, setSoramimiInfo] = useState<SoramimiStreamInfo | undefined>();

  // Refs for tracking state across renders
  const cachedKeyRef = useRef<string | null>(null);
  const lastTimeRef = useRef<number>(currentTime);
  const currentSongIdRef = useRef(songId);
  currentSongIdRef.current = songId;

  // Cache bust and refetch triggers
  const { isForceRequest: isCacheBustRequest, markHandled: markCacheBustHandled } = useCacheBustTrigger();
  const { isForceRequest: isRefetchRequest, markHandled: markRefetchHandled } = useRefetchTrigger();

  // Ref to store translation info from initial fetch (with language to ensure we only use matching translations)
  const translationInfoRef = useRef<{ info: TranslationStreamInfo; language: string } | undefined>(undefined);

  // Clear cached translation/furigana/soramimi info when cache bust trigger changes (force refresh)
  useEffect(() => {
    if (isCacheBustRequest) {
      translationInfoRef.current = undefined;
      setTranslatedLines(null);
      // Also clear furigana and soramimi info so useFurigana refetches
      setFuriganaInfo(undefined);
      setSoramimiInfo(undefined);
    }
  }, [isCacheBustRequest]);

  // Track soramimi target language to clear prefetched info when it changes
  const lastSoramimiTargetLanguageRef = useRef(soramimiTargetLanguage);
  useEffect(() => {
    // Clear soramimi info when target language changes so useFurigana fetches fresh data
    if (lastSoramimiTargetLanguageRef.current !== soramimiTargetLanguage) {
      setSoramimiInfo(undefined);
      lastSoramimiTargetLanguageRef.current = soramimiTargetLanguage;
    }
  }, [soramimiTargetLanguage]);

  // ==========================================================================
  // Effect: Fetch lyrics (and optionally translation/furigana info)
  // ==========================================================================
  useEffect(() => {
    const effectSongId = songId;

    if (!effectSongId) {
      setOriginalLines([]);
      setTranslatedLines(null);
      setCurrentLine(-1);
      setIsFetchingOriginal(false);
      setError(undefined);
      setFuriganaInfo(undefined);
      setSoramimiInfo(undefined);
      cachedKeyRef.current = null;
      translationInfoRef.current = undefined;
      return;
    }

    if (isOffline()) {
      setError("iPod requires an internet connection");
      return;
    }

    const selectedMatchKey = selectedMatch?.hash || "";
    const cacheKey = `song:${effectSongId}:${selectedMatchKey}`;

    if (!isRefetchRequest && cacheKey === cachedKeyRef.current) {
      markRefetchHandled();
      return;
    }

    // Clear ALL state before fetching to prevent stale data from previous song
    setOriginalLines([]);
    setTranslatedLines(null);
    setCurrentLine(-1);
    setIsFetchingOriginal(true);
    setIsTranslating(false);
    setError(undefined);
    setFuriganaInfo(undefined);
    setSoramimiInfo(undefined);
    translationInfoRef.current = undefined;

    const controller = new AbortController();

    // Build request - include translateTo, includeFurigana, includeSoramimi to reduce round-trips
    const requestBody: Record<string, unknown> = {
      action: "fetch-lyrics",
      force: isRefetchRequest,
      title: title || undefined,
      artist: artist || undefined,
      translateTo: translateTo || undefined,
      includeFurigana: includeFurigana || undefined,
      includeSoramimi: includeSoramimi || undefined,
      soramimiTargetLanguage: includeSoramimi ? soramimiTargetLanguage : undefined,
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

    // Build headers with optional auth
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authCredentials) {
      headers["Authorization"] = `Bearer ${authCredentials.authToken}`;
      headers["X-Username"] = authCredentials.username;
    }

    abortableFetch(getApiUrl(`/api/songs/${effectSongId}`), {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
      timeout: 15000,
      retry: { maxAttempts: 3, initialDelayMs: 1000, backoffMultiplier: 2 },
    })
      .then(async (res) => {
        if (controller.signal.aborted) return null;
        if (effectSongId !== currentSongIdRef.current) return null;
        if (!res.ok) {
          if (res.status === 404) return null;
          throw new Error(`Failed to fetch lyrics (status ${res.status})`);
        }
        return res.json() as Promise<UnifiedLyricsResponse>;
      })
      .then((json) => {
        if (controller.signal.aborted) return;
        if (effectSongId !== currentSongIdRef.current) return;
        if (!json?.lyrics?.parsedLines?.length) throw new Error("No lyrics found");

        const parsed: LyricLine[] = json.lyrics.parsedLines.map((line) => ({
          startTimeMs: line.startTimeMs,
          words: line.words,
          wordTimings: line.wordTimings,
        }));

        setOriginalLines(parsed);
        cachedKeyRef.current = cacheKey;
        useIpodStore.setState({ currentLyrics: { lines: parsed } });

        // Store translation info for the translation effect to use (with language to ensure correct matching)
        if (json.translation && translateTo) {
          translationInfoRef.current = { info: json.translation, language: translateTo };
        } else {
          translationInfoRef.current = undefined;
        }

        // Store furigana info for useFurigana to use (or clear if not included)
        // This ensures we don't show stale furigana from a previous song
        setFuriganaInfo(json.furigana ?? undefined);
        
        // Store soramimi info for useFurigana to use (or clear if not included)
        // This ensures we don't show stale soramimi from a previous song
        setSoramimiInfo(json.soramimi ?? undefined);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (effectSongId !== currentSongIdRef.current) return;
        handleLyricsError(err, setError, setOriginalLines, setCurrentLine);
        // Clear furigana/soramimi info on error to avoid showing stale data
        setFuriganaInfo(undefined);
        setSoramimiInfo(undefined);
      })
      .finally(() => {
        if (!controller.signal.aborted && effectSongId === currentSongIdRef.current) {
          setIsFetchingOriginal(false);
          markRefetchHandled();
        }
      });

    return () => {
      controller.abort();
      // Reset loading state on cleanup to prevent stuck indicators
      setIsFetchingOriginal(false);
    };
  }, [songId, title, artist, isRefetchRequest, markRefetchHandled, selectedMatch, translateTo, includeFurigana, includeSoramimi, soramimiTargetLanguage, authCredentials]);

  // ==========================================================================
  // Effect: Translate lyrics
  // ==========================================================================
  useEffect(() => {
    const effectSongId = songId;

    if (!effectSongId || !translateTo || originalLines.length === 0) {
      setTranslatedLines(null);
      setIsTranslating(false);
      setTranslationProgress(undefined);
      return;
    }

    if (isFetchingOriginal) {
      setIsTranslating(false);
      return;
    }

    if (isOffline()) {
      setIsTranslating(false);
      setError("iPod requires an internet connection");
      return;
    }

    const prefetchedData = translationInfoRef.current;
    // Only use prefetched info if it's for the same language we're requesting
    const prefetchedInfo = prefetchedData?.language === translateTo ? prefetchedData.info : undefined;

    // If we have cached translation from initial fetch for the same language, use it immediately
    if (prefetchedInfo?.cached && prefetchedInfo.lrc && !isCacheBustRequest) {
      const translations = parseLrcToTranslations(prefetchedInfo.lrc);
      const translatedLines: LyricLine[] = originalLines.map((line, index) => ({
        ...line,
        words: translations[index] || line.words,
      }));
      setTranslatedLines(translatedLines);
      setIsTranslating(false);
      return;
    }

    setIsTranslating(true);
    setTranslationProgress(0);
    setError(undefined);

    const controller = new AbortController();

    processTranslationSSE(effectSongId, translateTo, {
      force: isCacheBustRequest,
      signal: controller.signal,
      prefetchedInfo: !isCacheBustRequest ? prefetchedInfo : undefined,
      auth: authCredentials,
      onProgress: (progress) => {
        if (!controller.signal.aborted && effectSongId === currentSongIdRef.current) {
          setTranslationProgress(progress.percentage);
        }
      },
      onLine: (lineIndex, translation) => {
        if (!controller.signal.aborted && effectSongId === currentSongIdRef.current) {
          setTranslatedLines((prev) => {
            const base = prev || originalLines.map((line) => ({ ...line }));
            const updated = [...base];
            if (lineIndex < updated.length) {
              updated[lineIndex] = { ...updated[lineIndex], words: translation };
            }
            return updated;
          });
        }
      },
    })
      .then((result: TranslationResult) => {
        if (controller.signal.aborted) return;
        if (effectSongId !== currentSongIdRef.current) return;

        const finalLines: LyricLine[] = originalLines.map((line, index) => ({
          ...line,
          words: result.data[index] || line.words,
        }));
        setTranslatedLines(finalLines);
        markCacheBustHandled();
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (effectSongId !== currentSongIdRef.current) return;
        handleTranslationError(err, setError, setTranslatedLines);
      })
      .finally(() => {
        if (!controller.signal.aborted && effectSongId === currentSongIdRef.current) {
          setIsTranslating(false);
          setTranslationProgress(undefined);
          markCacheBustHandled();
        }
      });

    return () => {
      controller.abort();
      // Reset loading state on cleanup to prevent stuck indicators
      setIsTranslating(false);
      setTranslationProgress(undefined);
    };
  }, [songId, originalLines, translateTo, isFetchingOriginal, isCacheBustRequest, markCacheBustHandled, authCredentials]);

  // ==========================================================================
  // Current line tracking
  // ==========================================================================
  const displayLines = translatedLines || originalLines;

  const parsedTimestamps = useMemo(
    () => parseLyricTimestamps(displayLines),
    [displayLines]
  );

  const calculateCurrentLine = useCallback(
    (timeInSeconds: number) => findCurrentLineIndex(parsedTimestamps, timeInSeconds * 1000),
    [parsedTimestamps]
  );

  useEffect(() => {
    lastTimeRef.current = currentTime;
    setCurrentLine(calculateCurrentLine(currentTime));
  }, [currentTime, calculateCurrentLine]);

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
    translationProgress,
    error,
    updateCurrentTimeManually,
    furiganaInfo,
    soramimiInfo,
  };
}

// =============================================================================
// Helpers
// =============================================================================

function handleLyricsError(
  err: unknown,
  setError: (e: string | undefined) => void,
  setOriginalLines: (lines: LyricLine[]) => void,
  setCurrentLine: (line: number) => void
) {
  console.error("[useLyrics] Error:", err);
  if (err instanceof DOMException && err.name === "AbortError") {
    setError("Lyrics search timed out.");
  } else {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const isNoLyricsError =
      msg.includes("500") ||
      msg.includes("404") ||
      msg.includes("No lyrics") ||
      msg.includes("not found");
    setError(isNoLyricsError ? "No lyrics available" : msg);
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
  console.error("[useLyrics] Translation error:", err);
  if (err instanceof DOMException && err.name === "AbortError") {
    setError("Translation timed out.");
  } else {
    setError(err instanceof Error ? err.message : "Unknown translation error");
  }
  setTranslatedLines(null);
}
