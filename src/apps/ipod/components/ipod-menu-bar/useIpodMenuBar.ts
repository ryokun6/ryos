import { useMemo } from "react";
import { useIpodStoreShallow } from "@/stores/useIpodStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { LyricsAlignment, DisplayMode } from "@/types/lyrics";
import { useTranslation } from "react-i18next";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { useTranslatedLyricsLanguages } from "@/hooks/useTranslatedLyricsLanguages";
import { useIpodLibraryJsonImportExport } from "@/hooks/useIpodLibraryJsonImportExport";
import { useIsRyoAdmin } from "@/hooks/useIsRyoAdmin";
import {
  getSortedArtistNames,
  groupTracksByArtist,
} from "@/utils/groupTracksByArtist";
import type { IpodMenuBarProps } from "./types";

export type IpodMenuBarViewModel = ReturnType<typeof useIpodMenuBar>;

export function useIpodMenuBar(props: IpodMenuBarProps) {
  const {
    onClose,
    onShowHelp,
    onShowAbout,
    onClearLibrary,
    onSyncLibrary,
    onAddSong,
    onShareSong,
    onAddToFavorites,
    onRefreshLyrics,
    onAdjustTiming,
    onToggleCoverFlow,
    appleMusicAuthorized = false,
    musicKitConfigured = true,
    onSwitchLibrary,
    onAppleMusicSignIn,
    onAppleMusicSignOut,
    onAppleMusicRefresh,
  } = props;
  const { t } = useTranslation();
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isWindowsTheme,
    isMacOSTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("ipod");
  const translationLanguages = useTranslatedLyricsLanguages();
  const {
    youtubeTracks,
    youtubeCurrentSongId,
    appleMusicTracks,
    appleMusicCurrentSongId,
    activeLibrarySource,
    isLoopAll,
    isLoopCurrent,
    isPlaying,
    isShuffled,
    isBacklightOn,
    backlightTimeout,
    displayMode,
    currentTheme,
    uiVariant,
    showLyrics,
    lyricsAlignment,
    lyricsFont,
    romanization,
    lyricsTranslationLanguage,
    // Actions
    setYoutubeCurrentSongId,
    setAppleMusicCurrentSongId,
    setIsPlaying,
    toggleLoopAll,
    toggleLoopCurrent,
    toggleShuffle,
    togglePlay,
    youtubeNext,
    youtubePrevious,
    appleMusicNext,
    appleMusicPrevious,
    toggleBacklight,
    setBacklightTimeout,
    setDisplayMode,
    toggleFullScreen,
    setTheme,
    setUiVariant,
    toggleLyrics,
    setLyricsAlignment,
    setLyricsFont,
    refreshLyrics,
    clearLyricsCache,
    setRomanization,
    setLyricsTranslationLanguage,
    importLibrary,
    exportLibrary,
  } = useIpodStoreShallow((s) => ({
    // State
    youtubeTracks: s.tracks,
    youtubeCurrentSongId: s.currentSongId,
    appleMusicTracks: s.appleMusicTracks,
    appleMusicCurrentSongId: s.appleMusicCurrentSongId,
    activeLibrarySource: s.librarySource,
    isLoopAll: s.loopAll,
    isLoopCurrent: s.loopCurrent,
    isPlaying: s.isPlaying,
    isShuffled: s.isShuffled,
    isBacklightOn: s.backlightOn,
    backlightTimeout: s.backlightTimeout,
    displayMode: s.displayMode ?? DisplayMode.Video,
    currentTheme: s.theme,
    uiVariant: s.uiVariant ?? "modern",
    showLyrics: s.showLyrics,
    lyricsAlignment: s.lyricsAlignment ?? LyricsAlignment.FocusThree,
    lyricsFont: s.lyricsFont,
    romanization: s.romanization,
    lyricsTranslationLanguage: s.lyricsTranslationLanguage,
    // Actions
    setYoutubeCurrentSongId: s.setCurrentSongId,
    setAppleMusicCurrentSongId: s.setAppleMusicCurrentSongId,
    setIsPlaying: s.setIsPlaying,
    toggleLoopAll: s.toggleLoopAll,
    toggleLoopCurrent: s.toggleLoopCurrent,
    toggleShuffle: s.toggleShuffle,
    togglePlay: s.togglePlay,
    youtubeNext: s.nextTrack,
    youtubePrevious: s.previousTrack,
    appleMusicNext: s.appleMusicNextTrack,
    appleMusicPrevious: s.appleMusicPreviousTrack,
    toggleBacklight: s.toggleBacklight,
    setBacklightTimeout: s.setBacklightTimeout,
    setDisplayMode: s.setDisplayMode,
    toggleFullScreen: s.toggleFullScreen,
    setTheme: s.setTheme,
    setUiVariant: s.setUiVariant,
    toggleLyrics: s.toggleLyrics,
    setLyricsAlignment: s.setLyricsAlignment,
    setLyricsFont: s.setLyricsFont,
    refreshLyrics: s.refreshLyrics,
    clearLyricsCache: s.clearLyricsCache,
    setRomanization: s.setRomanization,
    setLyricsTranslationLanguage: s.setLyricsTranslationLanguage,
    importLibrary: s.importLibrary,
    exportLibrary: s.exportLibrary,
  }));

  const debugMode = useDisplaySettingsStore((state) => state.debugMode);
  const isAdmin = useIsRyoAdmin();

  // The menubar reflects whichever library is currently active so the
  // "All Songs" / per-artist views stay in sync with what the iPod is
  // actually showing on its screen.
  const isAppleMusic = activeLibrarySource === "appleMusic";
  const tracks = isAppleMusic ? appleMusicTracks : youtubeTracks;
  const currentSongId = isAppleMusic
    ? appleMusicCurrentSongId
    : youtubeCurrentSongId;
  const effectiveDisplayMode =
    isAppleMusic && displayMode === DisplayMode.Video
      ? DisplayMode.Cover
      : displayMode;
  const setCurrentSongId = isAppleMusic
    ? setAppleMusicCurrentSongId
    : setYoutubeCurrentSongId;
  const nextTrack = isAppleMusic ? appleMusicNext : youtubeNext;
  const previousTrack = isAppleMusic ? appleMusicPrevious : youtubePrevious;

  // Compute currentIndex from currentSongId
  const currentIndex = useMemo(() => {
    if (!currentSongId) return tracks.length > 0 ? 0 : -1;
    const index = tracks.findIndex((t) => t.id === currentSongId);
    return index >= 0 ? index : tracks.length > 0 ? 0 : -1;
  }, [tracks, currentSongId]);

  const handlePlayTrack = (index: number) => {
    const trackId = tracks[index]?.id;
    if (trackId) {
      setCurrentSongId(trackId);
      setIsPlaying(true);
    }
  };

  // Group tracks by artist. Memoized because the menubar re-renders on
  // every player tick (for the Now Playing indicator) and the reduce/sort
  // becomes expensive once the Apple Music library is in the thousands.
  const unknownArtistLabel = t("apps.ipod.menu.unknownArtist");

  const handleSwitchLibraryMenu = () => {
    if (!onSwitchLibrary) return;
    if (!isAppleMusic && !musicKitConfigured) return;
    onSwitchLibrary(isAppleMusic ? "youtube" : "appleMusic");
  };

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
    translationLanguages,
    isWindowsTheme,
    isMacOSTheme,
    debugMode,
    isAdmin,
    isAppleMusic,
    tracks,
    currentIndex,
    effectiveDisplayMode,
    isLoopAll,
    isLoopCurrent,
    isPlaying,
    isShuffled,
    isBacklightOn,
    backlightTimeout,
    currentTheme,
    uiVariant,
    showLyrics,
    lyricsAlignment,
    lyricsFont,
    romanization,
    lyricsTranslationLanguage,
    toggleLoopAll,
    toggleLoopCurrent,
    toggleShuffle,
    togglePlay,
    nextTrack,
    previousTrack,
    toggleBacklight,
    setBacklightTimeout,
    setDisplayMode,
    toggleFullScreen,
    setTheme,
    setUiVariant,
    toggleLyrics,
    setLyricsAlignment,
    setLyricsFont,
    refreshLyrics,
    clearLyricsCache,
    setRomanization,
    setLyricsTranslationLanguage,
    tracksByArtist,
    artists,
    handlePlayTrack,
    handleExportLibrary,
    handleImportLibrary,
    handleSwitchLibraryMenu,
    onClose,
    onShowHelp,
    onShowAbout,
    onClearLibrary,
    onSyncLibrary,
    onAddSong,
    onShareSong,
    onAddToFavorites,
    onRefreshLyrics,
    onAdjustTiming,
    onToggleCoverFlow,
    appleMusicAuthorized,
    musicKitConfigured,
    onSwitchLibrary,
    onAppleMusicSignIn,
    onAppleMusicSignOut,
    onAppleMusicRefresh,
  };
}
