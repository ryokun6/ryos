import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useIpodStoreShallow } from "@/stores/useIpodStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import { LyricsAlignment, LyricsFont, DisplayMode } from "@/types/lyrics";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { useTranslatedLyricsLanguages } from "@/hooks/useTranslatedLyricsLanguages";
import { useIpodLibraryJsonImportExport } from "@/hooks/useIpodLibraryJsonImportExport";
import { useIsRyoAdmin } from "@/hooks/useIsRyoAdmin";
import {
  getSortedArtistNames,
  groupTracksByArtist,
} from "@/utils/groupTracksByArtist";
import type { KaraokeMenuBarProps } from "./types";

export type KaraokeMenuBarViewModel = ReturnType<typeof useKaraokeMenuBar>;

export function useKaraokeMenuBar(props: KaraokeMenuBarProps) {
  const {
    onClose,
    onShowHelp,
    onShowAbout,
    onAddSong,
    onShareSong,
    onStartListenSession,
    onJoinListenSession,
    onShareListenSession,
    onLeaveListenSession,
    isInListenSession,
    isListenSessionHost,
    onClearLibrary,
    onSyncLibrary,
    onPlayTrack,
    onTogglePlay,
    onPreviousTrack,
    onNextTrack,
    isPlaying,
    isShuffled,
    onToggleShuffle,
    loopAll,
    onToggleLoopAll,
    loopCurrent,
    onToggleLoopCurrent,
    showLyrics,
    onToggleLyrics,
    onToggleFullScreen,
    onRefreshLyrics,
    onAdjustTiming,
    onToggleCoverFlow,
    tracks,
    currentIndex,
  } = props;

  const { t } = useTranslation();
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isWindowsTheme,
    isMacOSTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("karaoke", t("apps.karaoke.name"));
  const debugMode = useDisplaySettingsStore((state) => state.debugMode);
  const isAdmin = useIsRyoAdmin();

  const {
    lyricsAlignment,
    lyricsFont,
    romanization,
    lyricsTranslationLanguage,
    setLyricsAlignment,
    setLyricsFont,
    setRomanization,
    setLyricsTranslationLanguage,
    refreshLyrics,
    clearLyricsCache,
    importLibrary,
    exportLibrary,
  } = useIpodStoreShallow((s) => ({
    lyricsAlignment: s.lyricsAlignment ?? LyricsAlignment.FocusThree,
    lyricsFont: s.lyricsFont ?? LyricsFont.GoldGlow,
    romanization: s.romanization,
    lyricsTranslationLanguage: s.lyricsTranslationLanguage,
    setLyricsAlignment: s.setLyricsAlignment,
    setLyricsFont: s.setLyricsFont,
    setRomanization: s.setRomanization,
    setLyricsTranslationLanguage: s.setLyricsTranslationLanguage,
    refreshLyrics: s.refreshLyrics,
    clearLyricsCache: s.clearLyricsCache,
    importLibrary: s.importLibrary,
    exportLibrary: s.exportLibrary,
  }));

  const displayMode = useKaraokeStore((s) => s.displayMode ?? DisplayMode.Video);
  const setDisplayMode = useKaraokeStore((s) => s.setDisplayMode);

  const translationLanguages = useTranslatedLyricsLanguages();

  const unknownArtistLabel = t("apps.ipod.menu.unknownArtist");

  const tracksByArtist = useMemo(
    () => groupTracksByArtist(tracks, unknownArtistLabel),
    [tracks, unknownArtistLabel],
  );

  const artists = useMemo(
    () => getSortedArtistNames(tracksByArtist),
    [tracksByArtist],
  );

  const { handleExportLibrary, handleImportLibrary } =
    useIpodLibraryJsonImportExport(exportLibrary, importLibrary, t);

  return {
    t,
    isShareDialogOpen,
    setIsShareDialogOpen,
    appId,
    appName,
    isWindowsTheme,
    isMacOSTheme,
    debugMode,
    isAdmin,
    lyricsAlignment,
    lyricsFont,
    romanization,
    lyricsTranslationLanguage,
    setLyricsAlignment,
    setLyricsFont,
    setRomanization,
    setLyricsTranslationLanguage,
    refreshLyrics,
    clearLyricsCache,
    displayMode,
    setDisplayMode,
    translationLanguages,
    tracksByArtist,
    artists,
    handleExportLibrary,
    handleImportLibrary,
    tracks,
    currentIndex,
    onClose,
    onShowHelp,
    onShowAbout,
    onAddSong,
    onShareSong,
    onStartListenSession,
    onJoinListenSession,
    onShareListenSession,
    onLeaveListenSession,
    isInListenSession,
    isListenSessionHost,
    onClearLibrary,
    onSyncLibrary,
    onPlayTrack,
    onTogglePlay,
    onPreviousTrack,
    onNextTrack,
    isPlaying,
    isShuffled,
    onToggleShuffle,
    loopAll,
    onToggleLoopAll,
    loopCurrent,
    onToggleLoopCurrent,
    showLyrics,
    onToggleLyrics,
    onToggleFullScreen,
    onRefreshLyrics,
    onAdjustTiming,
    onToggleCoverFlow,
  };
}
