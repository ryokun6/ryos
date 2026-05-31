import {
  createContext,
  use,
  useEffect,
  useMemo,
  type MutableRefObject,
  type ReactNode,
} from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { useLyrics } from "@/hooks/useLyrics";
import { useFurigana } from "@/hooks/useFurigana";
import { useActivityState, isAnyActivityActive } from "@/hooks/useActivityState";
import { useLyricsErrorToast } from "@/hooks/useLyricsErrorToast";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import { getEffectiveTranslationLanguage, type Track } from "@/stores/useIpodStore";
import {
  getLyricsFontClassName,
  LyricsFont as LyricsFontEnum,
  type LyricsFont,
  type RomanizationSettings,
} from "@/types/lyrics";

export interface KaraokeLyricsPlaybackContextValue {
  lyricsControls: ReturnType<typeof useLyrics>;
  furiganaMap: ReturnType<typeof useFurigana>["furiganaMap"];
  soramimiMap: ReturnType<typeof useFurigana>["soramimiMap"];
  activityState: ReturnType<typeof useActivityState>;
  hasActiveActivity: boolean;
  elapsedTime: number;
  lyricsFontClassName: string;
}

const KaraokeLyricsPlaybackContext = createContext<KaraokeLyricsPlaybackContextValue | null>(
  null
);

export function useKaraokeLyricsPlayback(): KaraokeLyricsPlaybackContextValue {
  const ctx = use(KaraokeLyricsPlaybackContext);
  if (!ctx) {
    throw new Error("useKaraokeLyricsPlayback must be used within KaraokeLyricsPlaybackProvider");
  }
  return ctx;
}

interface ProviderProps {
  children: ReactNode;
  currentTrack: Track | null;
  lyricsFont: LyricsFont | undefined;
  romanization: RomanizationSettings;
  lyricsTranslationLanguage: string | null;
  lyricsSourceOverride: Track["lyricsSource"];
  isAddingSong: boolean;
  setIsLyricsSearchDialogOpen: (open: boolean) => void;
  t: TFunction;
  auth?: { username: string; isAuthenticated: boolean };
  lyricsPlaybackSyncRef: MutableRefObject<
    ((timeInLyricsSeconds: number) => void) | null
  >;
}

export function KaraokeLyricsPlaybackProvider({
  children,
  currentTrack,
  lyricsFont,
  romanization,
  lyricsTranslationLanguage,
  lyricsSourceOverride,
  isAddingSong,
  setIsLyricsSearchDialogOpen,
  t,
  auth,
  lyricsPlaybackSyncRef,
}: ProviderProps) {
  const { i18n } = useTranslation();
  const appLanguage = i18n.resolvedLanguage ?? i18n.language;
  const elapsedTime = useKaraokeStore(useShallow((s) => s.elapsedTime));

  const lyricsFontClassName = getLyricsFontClassName(lyricsFont ?? LyricsFontEnum.SansSerif);

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
    [lyricsTranslationLanguage, appLanguage]
  );

  const lyricsControls = useLyrics({
    songId: currentTrack?.id ?? "",
    title: currentTrack?.title ?? "",
    artist: currentTrack?.artist ?? "",
    currentTime: elapsedTime + (currentTrack?.lyricOffset ?? 0) / 1000,
    translateTo: effectiveTranslationLanguage,
    selectedMatch: selectedMatchForLyrics,
    includeFurigana: true,
    includeSoramimi: true,
    soramimiTargetLanguage: romanization.soramamiTargetLanguage ?? "zh-TW",
    auth,
  });

  useLyricsErrorToast({
    error: lyricsControls.error,
    songId: currentTrack?.id,
    onSearchClick: () => setIsLyricsSearchDialogOpen(true),
    t,
    appId: "karaoke",
  });

  const {
    furiganaMap,
    soramimiMap,
    isFetchingFurigana: isFetchingFuriganaFromHook,
    isFetchingSoramimi,
    furiganaProgress,
    soramimiProgress,
  } = useFurigana({
    songId: currentTrack?.id ?? "",
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
      isFetchingFurigana: isFetchingFuriganaFromHook,
      furiganaProgress,
      isFetchingSoramimi,
      soramimiProgress,
    },
    translationLanguage: effectiveTranslationLanguage,
    isAddingSong,
  });

  const hasActiveActivity = isAnyActivityActive(activityState);

  useEffect(() => {
    lyricsPlaybackSyncRef.current = (timeInLyricsSeconds: number) => {
      lyricsControls.updateCurrentTimeManually(timeInLyricsSeconds);
    };
    return () => {
      lyricsPlaybackSyncRef.current = null;
    };
  }, [lyricsControls, lyricsPlaybackSyncRef]);

  const value = useMemo(
    (): KaraokeLyricsPlaybackContextValue => ({
      lyricsControls,
      furiganaMap,
      soramimiMap,
      activityState,
      hasActiveActivity,
      elapsedTime,
      lyricsFontClassName,
    }),
    [
      lyricsControls,
      furiganaMap,
      soramimiMap,
      activityState,
      hasActiveActivity,
      elapsedTime,
      lyricsFontClassName,
    ]
  );

  return (
    <KaraokeLyricsPlaybackContext.Provider value={value}>
      {children}
    </KaraokeLyricsPlaybackContext.Provider>
  );
}
