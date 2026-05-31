import { useState, useMemo } from "react";
import { useIpodStoreShallow } from "@/stores/helpers";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { toast } from "sonner";
import { LyricsAlignment, DisplayMode } from "@/types/lyrics";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { appRegistry } from "@/config/appRegistry";
import { useTranslation } from "react-i18next";
import type { Track } from "@/stores/useIpodStore";
import { TRANSLATION_LANGUAGES } from "../../constants";
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
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const appId = "ipod";
  const appName = appRegistry[appId as keyof typeof appRegistry]?.name || appId;

  const translationLanguages = useMemo(
    () =>
      TRANSLATION_LANGUAGES.map((lang) => ({
        label: lang.labelKey ? t(lang.labelKey) : lang.label || "",
        code: lang.code,
        separator: lang.separator,
      })),
    [t]
  );
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

  const { isWindowsTheme: isXpTheme, isMacOSTheme: isMacOsxTheme } =
    useThemeFlags();
  const debugMode = useDisplaySettingsStore((state) => state.debugMode);
  const username = useChatsStore((state) => state.username);
  const isAdmin = username?.toLowerCase() === "ryo";

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

  const tracksByArtist = useMemo(() => {
    const grouped: Record<string, { track: Track; index: number }[]> = {};
    for (let index = 0; index < tracks.length; index++) {
      const track = tracks[index];
      const artist = track.artist || unknownArtistLabel;
      const bucket = grouped[artist] || (grouped[artist] = []);
      bucket.push({ track, index });
    }
    return grouped;
  }, [tracks, unknownArtistLabel]);
  const artists = useMemo(
    () =>
      Object.keys(tracksByArtist).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      ),
    [tracksByArtist]
  );

  const handleExportLibrary = () => {
    try {
      const json = exportLibrary();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ipod-library.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t("apps.ipod.dialogs.libraryExportedSuccessfully"));
    } catch (error) {
      console.error("Failed to export library:", error);
      toast.error(t("apps.ipod.dialogs.failedToExportLibrary"));
    }
  };

  const handleImportLibrary = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = event.target?.result as string;
          importLibrary(json);
          toast.success(t("apps.ipod.dialogs.libraryImportedSuccessfully"));
        } catch (error) {
          console.error("Failed to import library:", error);
          toast.error(t("apps.ipod.dialogs.failedToImportLibrary"));
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };


  return {
    t,
    isShareDialogOpen,
    setIsShareDialogOpen,
    appId,
    appName,
    translationLanguages,
    isXpTheme,
    isMacOsxTheme,
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
