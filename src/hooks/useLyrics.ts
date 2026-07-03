import { useEffect, useReducer, useRef, useCallback, useMemo } from "react";
import type { LyricLine } from "@/types/lyrics";
import { useIpodStore } from "@/stores/useIpodStore";
import { useCacheBustTrigger, useRefetchTrigger } from "@/hooks/useCacheBustTrigger";
import { isOffline } from "@/utils/offline";
import { fetchSongLyrics } from "@/api/songs";
import { createClientLogger } from "@/utils/logger";
import {
  getLyricsErrorMessage,
  isExpectedLyricsMissError,
  normalizeLyricsFetchError,
} from "@/utils/lyricsError";
import {
  processTranslationSSE,
  parseLrcToTranslations,
  type TranslationStreamInfo,
  type FuriganaStreamInfo,
  type SoramimiStreamInfo,
  type TranslationResult,
} from "@/utils/chunkedStream";
import { parseLyricTimestamps, findCurrentLineIndex } from "@/utils/lyricsSearch";
import { shouldForceLyricsFetch } from "@/shared/media/lyricsFetchPolicy";
import { canStartLyricsTranslation } from "@/shared/media/lyricsLifecycle";
import type { ChineseLyricsLanguage } from "@/shared/media/chineseLyrics";

const lyricsLog = createClientLogger("Lyrics");

// Stable empty-lines sentinel used while no lyrics are loaded for the current
// song. Reusing the same reference across renders is critical: it keeps the
// memoised `parsedTimestamps` / `calculateCurrentLine` / current-line effect
// stable during the reload window (after `loadedSongId` is cleared but
// before the new fetch completes). Without it a fresh `[]` literal every
// render churns those deps and re-fires `setCurrentLine`, which combined
// with the no-bailout reducer below would create a render loop.
const EMPTY_LYRIC_LINES: ReadonlyArray<LyricLine> = Object.freeze([]);

// =============================================================================
// Types
// =============================================================================

interface UseLyricsParams {
  songId: string;
  title?: string;
  artist?: string;
  currentTime: number;
  translateTo?: string | null;
  /** Script used for the primary KuGou lyric lines. */
  lyricsLanguage?: ChineseLyricsLanguage;
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
    isAuthenticated: boolean;
  };
}

interface UseLyricsDependencies {
  fetchSongLyrics: typeof fetchSongLyrics;
  processTranslationSSE: typeof processTranslationSSE;
}

const DEFAULT_LYRICS_DEPENDENCIES: UseLyricsDependencies = {
  fetchSongLyrics,
  processTranslationSSE,
};

interface LyricsState {
  lines: LyricLine[];
  originalLines: LyricLine[];
  loadedSongId: string | null;
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

interface LyricsLogContext {
  songId: string;
  title?: string;
  artist?: string;
  translateTo?: string | null;
  lyricsLanguage?: ChineseLyricsLanguage;
  includeFurigana?: boolean;
  includeSoramimi?: boolean;
  soramimiTargetLanguage?: "zh-TW" | "en";
  selectedMatch?: {
    hasHash: boolean;
    albumId?: string | number;
    title?: string;
    artist?: string;
    album?: string;
  };
}

// =============================================================================
// Hook
// =============================================================================

export function useLyrics(
  {
    songId,
    title = "",
    artist = "",
    currentTime,
    translateTo,
    lyricsLanguage = "zh-TW",
    includeFurigana,
    includeSoramimi,
    soramimiTargetLanguage = "zh-TW",
    selectedMatch,
    auth,
  }: UseLyricsParams,
  dependencies: UseLyricsDependencies = DEFAULT_LYRICS_DEPENDENCIES
): LyricsState {
  const fetchLyrics = dependencies.fetchSongLyrics;
  const translateLyrics = dependencies.processTranslationSSE;
  interface LyricsLocalState {
    originalLines: LyricLine[];
    translatedLines: LyricLine[] | null;
    currentLine: number;
    isFetchingOriginal: boolean;
    isTranslating: boolean;
    translationProgress: number | undefined;
    error: string | undefined;
    errorSongId: string | null;
    loadedSongId: string | null;
    furiganaInfo: FuriganaStreamInfo | undefined;
    soramimiInfo: SoramimiStreamInfo | undefined;
  }

  const initialState: LyricsLocalState = {
    originalLines: [],
    translatedLines: null,
    currentLine: -1,
    isFetchingOriginal: false,
    isTranslating: false,
    translationProgress: undefined,
    error: undefined,
    errorSongId: null,
    loadedSongId: null,
    furiganaInfo: undefined,
    soramimiInfo: undefined,
  };

  type LyricsAction =
    | { type: "patch"; payload: Partial<LyricsLocalState> }
    | {
        type: "setTranslatedLines";
        updater:
          | LyricLine[]
          | null
          | ((prev: LyricLine[] | null) => LyricLine[] | null);
      }
    | { type: "setCurrentLine"; updater: number | ((prev: number) => number) };

  const reducer = (state: LyricsLocalState, action: LyricsAction): LyricsLocalState => {
    switch (action.type) {
      case "patch": {
        // Bail out if the patch doesn't actually change any field. Without
        // this, every dispatch creates a new state object (even when values
        // are unchanged) and triggers a re-render. Combined with effects
        // that re-dispatch on every render (e.g. the current-line tick),
        // that's enough to produce "Maximum update depth exceeded".
        let changed = false;
        for (const key in action.payload) {
          if (
            action.payload[key as keyof LyricsLocalState] !==
            state[key as keyof LyricsLocalState]
          ) {
            changed = true;
            break;
          }
        }
        if (!changed) return state;
        return { ...state, ...action.payload };
      }
      case "setTranslatedLines": {
        const next =
          typeof action.updater === "function"
            ? (
                action.updater as (prev: LyricLine[] | null) => LyricLine[] | null
              )(state.translatedLines)
            : action.updater;
        if (next === state.translatedLines) return state;
        return { ...state, translatedLines: next };
      }
      case "setCurrentLine": {
        const next =
          typeof action.updater === "function"
            ? (action.updater as (prev: number) => number)(state.currentLine)
            : action.updater;
        if (next === state.currentLine) return state;
        return { ...state, currentLine: next };
      }
      default:
        return state;
    }
  };

  const [state, dispatch] = useReducer(reducer, initialState);
  const {
    originalLines,
    translatedLines,
    currentLine,
    isFetchingOriginal,
    isTranslating,
    translationProgress,
    error,
    errorSongId,
    loadedSongId,
    furiganaInfo,
    soramimiInfo,
  } = state;

  const setOriginalLines = useCallback((value: LyricLine[]) => {
    dispatch({ type: "patch", payload: { originalLines: value } });
  }, []);
  const setTranslatedLines = useCallback(
    (
      value:
        | LyricLine[]
        | null
        | ((prev: LyricLine[] | null) => LyricLine[] | null)
    ) => {
      dispatch({ type: "setTranslatedLines", updater: value });
    },
    []
  );
  const setCurrentLine = useCallback((value: number | ((prev: number) => number)) => {
    dispatch({ type: "setCurrentLine", updater: value });
  }, []);
  const setIsFetchingOriginal = useCallback((value: boolean) => {
    dispatch({ type: "patch", payload: { isFetchingOriginal: value } });
  }, []);
  const setTranslationProgress = useCallback((value: number | undefined) => {
    dispatch({ type: "patch", payload: { translationProgress: value } });
  }, []);
  const setError = useCallback((value: string | undefined) => {
    dispatch({ type: "patch", payload: { error: value } });
  }, []);
  const setFuriganaInfo = useCallback((value: FuriganaStreamInfo | undefined) => {
    dispatch({ type: "patch", payload: { furiganaInfo: value } });
  }, []);
  const setSoramimiInfo = useCallback((value: SoramimiStreamInfo | undefined) => {
    dispatch({ type: "patch", payload: { soramimiInfo: value } });
  }, []);

  // Refs for tracking state across renders.
  //
  // `currentSongIdRef` is read inside async callbacks fired by the fetch
  // pipeline below to bail out when the user has navigated to a different
  // song while a request was in flight. Mutating a ref during render is
  // unsafe under concurrent React (a render can be discarded and re-run);
  // instead we sync the ref in a layout effect so the value is committed
  // before any other effects observe it.
  const cachedKeyRef = useRef<string | null>(null);
  const lastTimeRef = useRef<number>(currentTime);
  const currentSongIdRef = useRef(songId);
  useEffect(() => {
    currentSongIdRef.current = songId;
  }, [songId]);

  // Cache bust and refetch triggers
  const { isForceRequest: isCacheBustRequest, markHandled: markCacheBustHandled } = useCacheBustTrigger();
  const { isForceRequest: isRefetchRequest, markHandled: markRefetchHandled } = useRefetchTrigger();

  // Ref to store translation info from initial fetch (with language to ensure we only use matching translations)
  const translationInfoRef = useRef<{ info: TranslationStreamInfo; language: string } | undefined>(undefined);
  const authCredentials = useMemo(
    () =>
      auth?.username && auth?.isAuthenticated
        ? { username: auth.username, isAuthenticated: auth.isAuthenticated }
        : undefined,
    [auth?.username, auth?.isAuthenticated]
  );
  const logContext = useMemo<LyricsLogContext>(
    () => ({
      songId,
      title: title || undefined,
      artist: artist || undefined,
      translateTo,
      lyricsLanguage,
      includeFurigana: Boolean(includeFurigana),
      includeSoramimi: Boolean(includeSoramimi),
      soramimiTargetLanguage,
      selectedMatch: selectedMatch
        ? {
            hasHash: Boolean(selectedMatch.hash),
            albumId: selectedMatch.albumId,
            title: selectedMatch.title,
            artist: selectedMatch.artist,
            album: selectedMatch.album,
          }
        : undefined,
    }),
    [
      songId,
      title,
      artist,
      translateTo,
      lyricsLanguage,
      includeFurigana,
      includeSoramimi,
      soramimiTargetLanguage,
      selectedMatch,
    ]
  );

  // Clear cached translation/furigana/soramimi info when cache bust trigger changes (force refresh)
  useEffect(() => {
    if (isCacheBustRequest) {
      lyricsLog.debug("Clearing prefetched lyrics annotations for refresh", {
        songId,
      });
      translationInfoRef.current = undefined;
      dispatch({
        type: "patch",
        payload: {
          translatedLines: null,
          furiganaInfo: undefined,
          soramimiInfo: undefined,
        },
      });
    }
  }, [isCacheBustRequest, songId]);

  // Track soramimi target language to clear prefetched info when it changes
  const lastSoramimiTargetLanguageRef = useRef(soramimiTargetLanguage);
  useEffect(() => {
    // Clear soramimi info when target language changes so useFurigana fetches fresh data
    if (lastSoramimiTargetLanguageRef.current !== soramimiTargetLanguage) {
      lyricsLog.debug("Soramimi target language changed", {
        songId,
        previousLanguage: lastSoramimiTargetLanguageRef.current,
        nextLanguage: soramimiTargetLanguage,
      });
      setSoramimiInfo(undefined);
      lastSoramimiTargetLanguageRef.current = soramimiTargetLanguage;
    }
  }, [soramimiTargetLanguage, songId]);

  // ==========================================================================
  // Effect: Fetch lyrics (and optionally translation/furigana info)
  // ==========================================================================
  useEffect(() => {
    const effectSongId = songId;

    if (!effectSongId) {
      dispatch({
        type: "patch",
        payload: {
          originalLines: [],
          translatedLines: null,
          currentLine: -1,
          isFetchingOriginal: false,
          error: undefined,
          errorSongId: null,
          loadedSongId: null,
          furiganaInfo: undefined,
          soramimiInfo: undefined,
        },
      });
      cachedKeyRef.current = null;
      translationInfoRef.current = undefined;
      return;
    }

    if (isOffline()) {
      lyricsLog.debug("Skipped lyrics fetch while offline", logContext);
      dispatch({
        type: "patch",
        payload: {
          error: "iPod requires an internet connection",
          errorSongId: effectSongId,
          loadedSongId: null,
        },
      });
      return;
    }

    const selectedMatchKey = selectedMatch?.hash || "";
    const cacheKey = `song:${effectSongId}:${selectedMatchKey}:${lyricsLanguage}`;

    if (!isRefetchRequest && cacheKey === cachedKeyRef.current) {
      lyricsLog.debug("Reusing lyrics already loaded in memory", logContext);
      markRefetchHandled();
      return;
    }

    // Clear ALL state before fetching to prevent stale data from previous song
    dispatch({
      type: "patch",
      payload: {
        originalLines: [],
        translatedLines: null,
        currentLine: -1,
        isFetchingOriginal: true,
        isTranslating: false,
        error: undefined,
        errorSongId: null,
        loadedSongId: null,
        furiganaInfo: undefined,
        soramimiInfo: undefined,
      },
    });
    translationInfoRef.current = undefined;

    const controller = new AbortController();
    let requestSettled = false;
    const forceServerFetch = shouldForceLyricsFetch({
      isCacheBustRequest,
      isAuthenticated: Boolean(authCredentials),
    });

    // Build request - include translateTo, includeFurigana, includeSoramimi to reduce round-trips
    const requestBody: Record<string, unknown> = {
      action: "fetch-lyrics",
      force: forceServerFetch,
      title: title || undefined,
      artist: artist || undefined,
      translateTo: translateTo || undefined,
      lyricsLanguage,
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

    lyricsLog.debug("Fetching lyrics", {
      ...logContext,
      force: Boolean(requestBody.force),
      isRefetchRequest,
      isCacheBustRequest,
      hasAuthenticatedUser: Boolean(authCredentials),
    });
    fetchLyrics(effectSongId, {
      force: Boolean(requestBody.force),
      title: typeof requestBody.title === "string" ? requestBody.title : undefined,
      artist: typeof requestBody.artist === "string" ? requestBody.artist : undefined,
      translateTo:
        typeof requestBody.translateTo === "string"
          ? requestBody.translateTo
          : undefined,
      lyricsLanguage,
      includeFurigana: Boolean(requestBody.includeFurigana),
      includeSoramimi: Boolean(requestBody.includeSoramimi),
      soramimiTargetLanguage:
        requestBody.soramimiTargetLanguage === "en" ? "en" : undefined,
      lyricsSource: requestBody.lyricsSource as
        | NonNullable<Parameters<typeof fetchSongLyrics>[1]>["lyricsSource"]
        | undefined,
      signal: controller.signal,
    })
      .then(async (json) => {
        if (controller.signal.aborted) {
          lyricsLog.debug("Ignored lyrics response after cancellation", logContext);
          return null;
        }
        if (effectSongId !== currentSongIdRef.current) {
          lyricsLog.debug("Ignored stale lyrics response", {
            ...logContext,
            currentSongId: currentSongIdRef.current,
          });
          return null;
        }
        return json as UnifiedLyricsResponse;
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

        dispatch({
          type: "patch",
          payload: {
            originalLines: parsed,
            loadedSongId: effectSongId,
            errorSongId: null,
          },
        });
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
        lyricsLog.debug("Lyrics loaded", {
          ...logContext,
          lineCount: parsed.length,
          cached: json.cached ?? false,
          hasTranslation: Boolean(json.translation),
          hasFurigana: Boolean(json.furigana),
          hasSoramimi: Boolean(json.soramimi),
        });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) {
          lyricsLog.debug("Lyrics fetch cancelled", logContext);
          return;
        }
        if (effectSongId !== currentSongIdRef.current) {
          lyricsLog.debug("Ignored error from stale lyrics request", {
            ...logContext,
            currentSongId: currentSongIdRef.current,
          });
          return;
        }
        handleLyricsError(
          normalizeLyricsFetchError(err),
          logContext,
          setError,
          setOriginalLines,
          setCurrentLine
        );
        dispatch({
          type: "patch",
          payload: {
            errorSongId: effectSongId,
            loadedSongId: null,
            furiganaInfo: undefined,
            soramimiInfo: undefined,
          },
        });
      })
      .finally(() => {
        requestSettled = true;
        if (!controller.signal.aborted && effectSongId === currentSongIdRef.current) {
          setIsFetchingOriginal(false);
          markRefetchHandled();
        }
      });

    return () => {
      if (!requestSettled && !controller.signal.aborted) {
        lyricsLog.debug("Cancelling lyrics fetch", logContext);
      }
      controller.abort();
      // Reset loading state on cleanup to prevent stuck indicators
      setIsFetchingOriginal(false);
    };
  }, [
    songId,
    title,
    artist,
    isRefetchRequest,
    isCacheBustRequest,
    markRefetchHandled,
    selectedMatch,
    translateTo,
    lyricsLanguage,
    includeFurigana,
    includeSoramimi,
    soramimiTargetLanguage,
    authCredentials,
    logContext,
    fetchLyrics,
  ]);

  // ==========================================================================
  // Effect: Translate lyrics
  // ==========================================================================
  useEffect(() => {
    const effectSongId = songId;

    if (!effectSongId || !translateTo) {
      dispatch({
        type: "patch",
        payload: {
          translatedLines: null,
          isTranslating: false,
          translationProgress: undefined,
        },
      });
      return;
    }

    if (
      !canStartLyricsTranslation({
        songId: effectSongId,
        loadedSongId,
        originalLineCount: originalLines.length,
        isFetchingOriginal,
      })
    ) {
      lyricsLog.debug("Waiting for original lyrics before translation", {
        ...logContext,
        targetLanguage: translateTo,
      });
      dispatch({ type: "patch", payload: { isTranslating: false } });
      return;
    }

    if (isOffline()) {
      lyricsLog.debug("Skipped lyrics translation while offline", {
        ...logContext,
        targetLanguage: translateTo,
      });
      dispatch({
        type: "patch",
        payload: {
          isTranslating: false,
          error: "iPod requires an internet connection",
        },
      });
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
      dispatch({
        type: "patch",
        payload: {
          translatedLines,
          isTranslating: false,
        },
      });
      lyricsLog.debug("Loaded cached lyrics translation", {
        ...logContext,
        targetLanguage: translateTo,
        lineCount: translatedLines.length,
      });
      return;
    }

    dispatch({
      type: "patch",
      payload: {
        isTranslating: true,
        translationProgress: 0,
        error: undefined,
      },
    });

    const controller = new AbortController();
    let requestSettled = false;

    lyricsLog.debug("Starting lyrics translation", {
      ...logContext,
      targetLanguage: translateTo,
      lineCount: originalLines.length,
      force: isCacheBustRequest,
      hasAuthenticatedUser: Boolean(authCredentials),
    });
    translateLyrics(effectSongId, translateTo, {
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
        lyricsLog.debug("Lyrics translation completed", {
          ...logContext,
          targetLanguage: translateTo,
          lineCount: finalLines.length,
          success: result.success,
        });
        markCacheBustHandled();
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) {
          lyricsLog.debug("Lyrics translation cancelled", {
            ...logContext,
            targetLanguage: translateTo,
          });
          return;
        }
        if (effectSongId !== currentSongIdRef.current) {
          lyricsLog.debug("Ignored error from stale translation request", {
            ...logContext,
            currentSongId: currentSongIdRef.current,
            targetLanguage: translateTo,
          });
          return;
        }
        handleTranslationError(err, logContext, setError, setTranslatedLines);
      })
      .finally(() => {
        requestSettled = true;
        if (!controller.signal.aborted && effectSongId === currentSongIdRef.current) {
          dispatch({
            type: "patch",
            payload: {
              isTranslating: false,
              translationProgress: undefined,
            },
          });
          markCacheBustHandled();
        }
      });

    return () => {
      if (!requestSettled && !controller.signal.aborted) {
        lyricsLog.debug("Cancelling lyrics translation", {
          ...logContext,
          targetLanguage: translateTo,
        });
      }
      controller.abort();
      // Reset loading state on cleanup to prevent stuck indicators
      dispatch({
        type: "patch",
        payload: {
          isTranslating: false,
          translationProgress: undefined,
        },
      });
    };
  }, [
    songId,
    loadedSongId,
    originalLines,
    translateTo,
    isFetchingOriginal,
    isCacheBustRequest,
    markCacheBustHandled,
    authCredentials,
    logContext,
    translateLyrics,
  ]);

  // ==========================================================================
  // Current line tracking
  // ==========================================================================
  const hasLyricsForCurrentSong = loadedSongId === songId;
  // Use a stable sentinel array when no lyrics are loaded so downstream
  // memos / effects (parsedTimestamps, calculateCurrentLine, current-line
  // effect) keep their references between renders. See `EMPTY_LYRIC_LINES`
  // declaration above for the full rationale.
  const displayOriginalLines = hasLyricsForCurrentSong
    ? originalLines
    : (EMPTY_LYRIC_LINES as LyricLine[]);
  const displayLines = hasLyricsForCurrentSong
    ? translatedLines || originalLines
    : (EMPTY_LYRIC_LINES as LyricLine[]);
  const currentError = errorSongId === songId ? error : undefined;
  const isLoadingCurrentLyrics =
    isFetchingOriginal || Boolean(songId && !hasLyricsForCurrentSong && !currentError);

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
    const next = calculateCurrentLine(currentTime);
    // Remote / virtual clock ticks ~10/s; avoid setState when line index unchanged (saves Karaoke re-renders).
    setCurrentLine((prev) => {
      if (prev === next) return prev;
      lyricsLog.debug("Active lyric line changed", {
        songId,
        previousLine: prev,
        nextLine: next,
        timeMs: Math.round(currentTime * 1000),
      });
      return next;
    });
  }, [currentTime, calculateCurrentLine, songId]);

  const updateCurrentTimeManually = useCallback(
    (newTimeInSeconds: number) => {
      lastTimeRef.current = newTimeInSeconds;
      const nextLine = calculateCurrentLine(newTimeInSeconds);
      setCurrentLine((previousLine) => {
        if (previousLine === nextLine) return previousLine;
        lyricsLog.debug("Updated lyric time manually", {
          songId,
          previousLine,
          nextLine,
          timeMs: Math.round(newTimeInSeconds * 1000),
        });
        return nextLine;
      });
    },
    [calculateCurrentLine, songId]
  );

  return {
    lines: displayLines,
    originalLines: displayOriginalLines,
    loadedSongId: hasLyricsForCurrentSong ? loadedSongId : null,
    currentLine,
    isLoading: isLoadingCurrentLyrics,
    isTranslating,
    translationProgress,
    error: currentError,
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
  context: LyricsLogContext,
  setError: (e: string | undefined) => void,
  setOriginalLines: (lines: LyricLine[]) => void,
  setCurrentLine: (line: number) => void
) {
  const displayError = getLyricsErrorMessage(err);
  const logPayload = { error: err, displayError, context };
  if (isExpectedLyricsMissError(err)) {
    lyricsLog.warn("Lyrics were not found", logPayload);
  } else {
    lyricsLog.error("Lyrics fetch failed", logPayload);
  }
  setError(displayError);
  setOriginalLines([]);
  setCurrentLine(-1);
  useIpodStore.setState({ currentLyrics: null });
}

function handleTranslationError(
  err: unknown,
  context: LyricsLogContext,
  setError: (e: string | undefined) => void,
  setTranslatedLines: (lines: LyricLine[] | null) => void
) {
  lyricsLog.error("Lyrics translation failed", { error: err, context });
  if (err instanceof DOMException && err.name === "AbortError") {
    setError("Translation timed out.");
  } else {
    setError(err instanceof Error ? err.message : "Unknown translation error");
  }
  setTranslatedLines(null);
}
