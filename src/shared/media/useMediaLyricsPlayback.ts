import { useMemo } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useLyrics } from "@/hooks/useLyrics";
import { useFurigana } from "@/hooks/useFurigana";
import {
  useActivityState,
  isAnyActivityActive,
} from "@/hooks/useActivityState";
import { useLyricsErrorToast } from "@/hooks/useLyricsErrorToast";
import {
  getEffectiveTranslationLanguage,
  type LyricsSource,
} from "@/stores/useIpodStore";
import type { RomanizationSettings } from "@/types/lyrics";

/**
 * Shared lyrics-playback composition for media apps (iPod + Karaoke).
 *
 * Wraps the four hooks both apps wire identically — `useLyrics`,
 * `useLyricsErrorToast`, `useFurigana`, `useActivityState` — together with the
 * `selectedMatch` / effective-translation-language memos that were previously
 * copy-pasted into `useIpodLogic` and `KaraokeLyricsPlaybackProvider`.
 *
 * App-specific concerns intentionally stay with the caller:
 * - The playback clock. iPod drives lyric-line tracking out-of-React via a
 *   store subscription (passing `currentTime: 0` here to avoid re-rendering the
 *   huge iPod logic hook ~20x/sec); Karaoke passes a reactive `currentTime`.
 *   Both use the returned `lyricsControls.updateCurrentTimeManually`.
 * - Writing the furigana map into a store (iPod only).
 * - Apple Music shell metadata resolution (iPod resolves title/artist/songId
 *   before calling this hook).
 */
export interface UseMediaLyricsPlaybackParams {
  /** Resolved lyrics song id (Apple Music callers resolve the live song id). */
  songId: string;
  /** Resolved title (may differ from the track title for AM shells). */
  title: string;
  /** Resolved artist. */
  artist: string;
  /**
   * Current playback time in seconds, already including any lyric offset.
   * Pass `0` (static) when driving line tracking imperatively via
   * `lyricsControls.updateCurrentTimeManually` to avoid per-tick re-renders.
   */
  currentTime: number;
  /** Raw translation-language preference; resolved to a locale internally. */
  lyricsTranslationLanguage: string | null;
  romanization: RomanizationSettings;
  /** Manual per-track lyrics-source override, if any. */
  lyricsSourceOverride: LyricsSource | undefined;
  /** Whether a song is currently being added (feeds the activity indicator). */
  isAddingSong: boolean;
  /** Opens the manual lyrics-search dialog from the error toast action. */
  onSearchLyrics: () => void;
  /** Owning app — selects the i18n namespace for the error toast. */
  appId: "ipod" | "karaoke";
  auth?: { username: string; isAuthenticated: boolean };
  t: TFunction;
}

export interface UseMediaLyricsPlaybackResult {
  lyricsControls: ReturnType<typeof useLyrics>;
  furiganaMap: ReturnType<typeof useFurigana>["furiganaMap"];
  soramimiMap: ReturnType<typeof useFurigana>["soramimiMap"];
  activityState: ReturnType<typeof useActivityState>;
  hasActiveActivity: boolean;
  /** "auto" resolved to the active ryOS locale. */
  effectiveTranslationLanguage: string | null;
}

export function useMediaLyricsPlayback({
  songId,
  title,
  artist,
  currentTime,
  lyricsTranslationLanguage,
  romanization,
  lyricsSourceOverride,
  isAddingSong,
  onSearchLyrics,
  appId,
  auth,
  t,
}: UseMediaLyricsPlaybackParams): UseMediaLyricsPlaybackResult {
  const { i18n } = useTranslation();
  // Track the resolved language so "auto" updates when the system language changes.
  const appLanguage = i18n.resolvedLanguage ?? i18n.language;

  const selectedMatchForLyrics = useMemo(() => {
    if (!lyricsSourceOverride) return undefined;
    return {
      hash: lyricsSourceOverride.hash,
      albumId: lyricsSourceOverride.albumId,
      title: lyricsSourceOverride.title,
      artist: lyricsSourceOverride.artist,
      album: lyricsSourceOverride.album,
    };
  }, [lyricsSourceOverride]);

  const effectiveTranslationLanguage = useMemo(
    () => getEffectiveTranslationLanguage(lyricsTranslationLanguage),
    // appLanguage intentionally a dep so "auto" re-resolves on locale change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lyricsTranslationLanguage, appLanguage]
  );

  const lyricsControls = useLyrics({
    songId,
    title,
    artist,
    currentTime,
    translateTo: effectiveTranslationLanguage,
    selectedMatch: selectedMatchForLyrics,
    // Fetch furigana info with lyrics to reduce API calls.
    includeFurigana: true,
    // Always include soramimi in request to avoid hydration timing issues
    // (default setting is false, but the user's saved setting might be true
    // after hydration). The server only returns cached soramimi data here.
    includeSoramimi: true,
    soramimiTargetLanguage: romanization.soramamiTargetLanguage ?? "zh-TW",
    auth,
  });

  // Show a toast with a Search button when lyrics fetch fails.
  useLyricsErrorToast({
    error: lyricsControls.error,
    songId: songId || undefined,
    onSearchClick: onSearchLyrics,
    t,
    appId,
  });

  const {
    furiganaMap,
    soramimiMap,
    isFetchingFurigana,
    isFetchingSoramimi,
    furiganaProgress,
    soramimiProgress,
  } = useFurigana({
    songId,
    lines: lyricsControls.originalLines,
    isShowingOriginal: true,
    romanization,
    prefetchedInfo: lyricsControls.furiganaInfo,
    prefetchedSoramimiInfo: lyricsControls.soramimiInfo,
    auth,
  });

  const activityState = useActivityState({
    lyricsState: {
      isLoading: lyricsControls.isLoading,
      isTranslating: lyricsControls.isTranslating,
      translationProgress: lyricsControls.translationProgress,
    },
    furiganaState: {
      isFetchingFurigana,
      furiganaProgress,
      isFetchingSoramimi,
      soramimiProgress,
    },
    translationLanguage: effectiveTranslationLanguage,
    isAddingSong,
  });

  const hasActiveActivity = isAnyActivityActive(activityState);

  return {
    lyricsControls,
    furiganaMap,
    soramimiMap,
    activityState,
    hasActiveActivity,
    effectiveTranslationLanguage,
  };
}
