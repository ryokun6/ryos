import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useIpodStoreShallow } from "@/stores/helpers";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import { TRANSLATION_LANGUAGES } from "@/apps/ipod/constants";
import { LyricsAlignment, LyricsFont, DisplayMode } from "@/types/lyrics";
import type { Track } from "@/stores/useIpodStore";
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
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const appId = "karaoke";
  const appName = t("apps.karaoke.name");

  const { isWindowsTheme: isXpTheme, isMacOSTheme: isMacOsxTheme } =
    useThemeFlags();
  const debugMode = useDisplaySettingsStore((state) => state.debugMode);
  const username = useChatsStore((state) => state.username);
  const isAdmin = username?.toLowerCase() === "ryo";

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
    lyricsFont: s.lyricsFont ?? LyricsFont.SansSerif,
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

  const translationLanguages = useMemo(
    () =>
      TRANSLATION_LANGUAGES.map((lang) => ({
        label: lang.labelKey ? t(lang.labelKey) : lang.label || "",
        code: lang.code,
        separator: lang.separator,
      })),
    [t]
  );

  const unknownArtistLabel = t("apps.ipod.menu.unknownArtist");

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
    isXpTheme,
    isMacOsxTheme,
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
