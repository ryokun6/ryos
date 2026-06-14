import {
  createContext,
  use,
  useEffect,
  useMemo,
  type MutableRefObject,
  type ReactNode,
} from "react";
import type { TFunction } from "i18next";
import { useShallow } from "zustand/react/shallow";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import { type Track } from "@/stores/useIpodStore";
import {
  useMediaLyricsPlayback,
  type UseMediaLyricsPlaybackResult,
} from "@/shared/media/useMediaLyricsPlayback";
import {
  getLyricsFontClassName,
  LyricsFont as LyricsFontEnum,
  type LyricsFont,
  type RomanizationSettings,
} from "@/types/lyrics";

export interface KaraokeLyricsPlaybackContextValue {
  lyricsControls: UseMediaLyricsPlaybackResult["lyricsControls"];
  furiganaMap: UseMediaLyricsPlaybackResult["furiganaMap"];
  soramimiMap: UseMediaLyricsPlaybackResult["soramimiMap"];
  activityState: UseMediaLyricsPlaybackResult["activityState"];
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
  const elapsedTime = useKaraokeStore(useShallow((s) => s.elapsedTime));

  const lyricsFontClassName = getLyricsFontClassName(lyricsFont ?? LyricsFontEnum.GoldGlow);

  const {
    lyricsControls,
    furiganaMap,
    soramimiMap,
    activityState,
    hasActiveActivity,
  } = useMediaLyricsPlayback({
    songId: currentTrack?.id ?? "",
    title: currentTrack?.title ?? "",
    artist: currentTrack?.artist ?? "",
    // Karaoke drives line tracking reactively from the playback clock; this
    // small provider re-rendering each tick is acceptable.
    currentTime: elapsedTime + (currentTrack?.lyricOffset ?? 0) / 1000,
    lyricsTranslationLanguage,
    romanization,
    lyricsSourceOverride,
    isAddingSong,
    onSearchLyrics: () => setIsLyricsSearchDialogOpen(true),
    appId: "karaoke",
    auth,
    t,
  });

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
