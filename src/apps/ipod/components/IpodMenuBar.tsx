import { useState, useMemo } from "react";
import { MenuBar } from "@/components/layout/MenuBar";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
} from "@/components/ui/menubar";
import { useIpodStoreShallow } from "@/stores/helpers";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { toast } from "sonner";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { LyricsAlignment, DisplayMode, LyricsFont } from "@/types/lyrics";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { appRegistry } from "@/config/appRegistry";
import { useTranslation } from "react-i18next";

// Caps for the in-menubar library browser. Radix's MenubarSub doesn't
// virtualize, so a 5,000-song library would commit thousands of DOM
// nodes the moment the user opens the dropdown. The full library is
// always available inside the iPod itself (which IS virtualized).
const MENUBAR_TRACK_LIMIT = 200;
const MENUBAR_ARTIST_LIMIT = 100;

interface IpodMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onClearLibrary: () => void;
  onSyncLibrary: () => void;
  onAddSong: () => void;
  onShareSong: () => void;
  onAddToFavorites?: () => void;
  onRefreshLyrics?: () => void;
  onAdjustTiming?: () => void;
  onToggleCoverFlow?: () => void;
  // Apple Music integration
  appleMusicAuthorized?: boolean;
  musicKitConfigured?: boolean;
  onSwitchLibrary?: (source: "youtube" | "appleMusic") => void;
  onAppleMusicSignIn?: () => void;
  onAppleMusicSignOut?: () => void;
  onAppleMusicRefresh?: () => void;
  onNextTrack?: () => void;
  onPreviousTrack?: () => void;
  onTogglePlay?: () => void;
}

export function IpodMenuBar({
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
  onNextTrack,
  onPreviousTrack,
  onTogglePlay,
}: IpodMenuBarProps) {
  const { t } = useTranslation();
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const appId = "ipod";
  const appName = appRegistry[appId as keyof typeof appRegistry]?.name || appId;

  const translationLanguages = [
    { label: t("apps.ipod.translationLanguages.original"), code: null },
    { label: t("apps.ipod.translationLanguages.auto"), code: "auto" },
    { separator: true },
    { label: "English", code: "en" },
    { label: "中文", code: "zh-TW" },
    { label: "日本語", code: "ja" },
    { label: "한국어", code: "ko" },
    { label: "Español", code: "es" },
    { label: "Français", code: "fr" },
    { label: "Deutsch", code: "de" },
    { label: "Português", code: "pt" },
    { label: "Italiano", code: "it" },
    { label: "Русский", code: "ru" },
  ];
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
    isVideoOn,
    displayMode,
    isLcdFilterOn,
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
    setAppleMusicPlaybackQueue,
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
    toggleVideo,
    setDisplayMode,
    toggleLcdFilter,
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
    isVideoOn: s.showVideo,
    displayMode: s.displayMode ?? DisplayMode.Video,
    isLcdFilterOn: s.lcdFilterOn,
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
    setAppleMusicPlaybackQueue: s.setAppleMusicPlaybackQueue,
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
    toggleVideo: s.toggleVideo,
    setDisplayMode: s.setDisplayMode,
    toggleLcdFilter: s.toggleLcdFilter,
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
  const nextTrack = onNextTrack ?? (isAppleMusic ? appleMusicNext : youtubeNext);
  const previousTrack =
    onPreviousTrack ?? (isAppleMusic ? appleMusicPrevious : youtubePrevious);
  const playPause = onTogglePlay ?? togglePlay;

  // Compute currentIndex from currentSongId
  const currentIndex = useMemo(() => {
    if (!currentSongId) return tracks.length > 0 ? 0 : -1;
    const index = tracks.findIndex((t) => t.id === currentSongId);
    return index >= 0 ? index : (tracks.length > 0 ? 0 : -1);
  }, [tracks, currentSongId]);

  const handlePlayTrack = (index: number, queueIds?: string[] | null) => {
    const trackId = tracks[index]?.id;
    if (!trackId) return;
    if (isAppleMusic && queueIds !== undefined) {
      setAppleMusicPlaybackQueue(queueIds);
    }
    setCurrentSongId(trackId);
    setIsPlaying(true);
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
    const grouped: Record<
      string,
      { track: (typeof tracks)[0]; index: number }[]
    > = {};
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

  const librarySourceActionsNodes = (
    <>
      {!isAppleMusic && (
        <>
          <MenubarItem
            onClick={onClearLibrary}
            className="text-md h-6 px-3 whitespace-nowrap"
          >
            {t("apps.ipod.menu.clearLibrary")}
          </MenubarItem>
          <MenubarItem
            onClick={onSyncLibrary}
            className="text-md h-6 px-3 whitespace-nowrap"
          >
            {t("apps.ipod.menu.syncLibrary")}
          </MenubarItem>
        </>
      )}
      {isAppleMusic && musicKitConfigured && (
        <>
          {appleMusicAuthorized ? (
            <>
              <MenubarItem
                onClick={onAppleMusicRefresh}
                className="text-md h-6 px-3 whitespace-nowrap"
                disabled={!onAppleMusicRefresh}
              >
                {t("apps.ipod.menu.refreshAppleMusic")}
              </MenubarItem>
              <MenubarItem
                onClick={onAppleMusicSignOut}
                className="text-md h-6 px-3 whitespace-nowrap"
                disabled={!onAppleMusicSignOut}
              >
                {t("apps.ipod.menu.appleMusicSignOut")}
              </MenubarItem>
            </>
          ) : (
            <MenubarItem
              onClick={onAppleMusicSignIn}
              className="text-md h-6 px-3 whitespace-nowrap"
              disabled={!onAppleMusicSignIn}
            >
              {t("apps.ipod.menu.appleMusicSignIn")}
            </MenubarItem>
          )}
        </>
      )}
    </>
  );

  const librarySwitchMenubarItem = (
    <MenubarItem
      onClick={handleSwitchLibraryMenu}
      className="text-md h-6 px-3 whitespace-nowrap"
      disabled={
        !onSwitchLibrary || (!isAppleMusic && !musicKitConfigured)
      }
    >
      {isAppleMusic
        ? t("apps.ipod.menu.switchToYoutubeLibrary")
        : t("apps.ipod.menu.switchToAppleMusic")}
    </MenubarItem>
  );

  return (
    <MenuBar inWindowFrame={isXpTheme}>
      {/* File Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("apps.ipod.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onAddSong}
            className="text-md h-6 px-3"
          >
            {t("apps.ipod.menu.addSong")}
          </MenubarItem>
          <MenubarItem
            onClick={onShareSong}
            className="text-md h-6 px-3"
            disabled={tracks.length === 0 || currentIndex === -1}
          >
            {t("apps.ipod.menu.shareSong")}
          </MenubarItem>
          {isAppleMusic && (
            <MenubarItem
              onClick={onAddToFavorites}
              className="text-md h-6 px-3"
              disabled={
                !appleMusicAuthorized ||
                !onAddToFavorites ||
                tracks.length === 0 ||
                currentIndex === -1
              }
            >
              {t("apps.ipod.menu.addToFavorites", "Add to Favorites")}
            </MenubarItem>
          )}
          {!isAppleMusic && (
            <>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem
                onClick={handleExportLibrary}
                className="text-md h-6 px-3"
                disabled={tracks.length === 0}
              >
                {t("apps.ipod.menu.exportLibrary")}
              </MenubarItem>
              <MenubarItem
                onClick={handleImportLibrary}
                className="text-md h-6 px-3"
              >
                {t("apps.ipod.menu.importLibrary")}
              </MenubarItem>
            </>
          )}
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          {librarySourceActionsNodes}
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          {librarySwitchMenubarItem}
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onClose}
            className="text-md h-6 px-3"
          >
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Controls Menu */}
      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {t("apps.ipod.menu.controls")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={playPause}
            className="text-md h-6 px-3"
            disabled={tracks.length === 0}
          >
            {isPlaying ? t("apps.ipod.menu.pause") : t("apps.ipod.menu.play")}
          </MenubarItem>
          <MenubarItem
            onClick={previousTrack}
            className="text-md h-6 px-3"
            disabled={tracks.length === 0}
          >
            {t("apps.ipod.menu.previous")}
          </MenubarItem>
          <MenubarItem
            onClick={nextTrack}
            className="text-md h-6 px-3"
            disabled={tracks.length === 0}
          >
            {t("apps.ipod.menu.next")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarCheckboxItem
            checked={isShuffled}
            onCheckedChange={() => toggleShuffle()}
            className="text-md h-6 px-3"
          >
            {t("apps.ipod.menu.shuffle")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={isLoopAll}
            onCheckedChange={() => toggleLoopAll()}
            className="text-md h-6 px-3"
          >
            {t("apps.ipod.menu.repeatAll")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={isLoopCurrent}
            onCheckedChange={() => toggleLoopCurrent()}
            className="text-md h-6 px-3"
          >
            {t("apps.ipod.menu.repeatOne")}
          </MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>

      {/* View Menu */}
      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {t("apps.ipod.menu.view")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          {/* Lyrics Submenu */}
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {t("apps.ipod.menu.lyrics")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              <MenubarCheckboxItem
                checked={showLyrics}
                onCheckedChange={() => toggleLyrics()}
                className="text-md h-6 px-3"
              >
                {t("apps.ipod.menu.showLyrics")}
              </MenubarCheckboxItem>

              <MenubarSeparator className="h-[2px] bg-black my-1" />

              {/* Alignment modes */}
              <MenubarCheckboxItem
                checked={lyricsAlignment === LyricsAlignment.FocusThree}
                onCheckedChange={(checked) => {
                  if (checked) setLyricsAlignment(LyricsAlignment.FocusThree);
                }}
                className="text-md h-6 pr-3"
              >
                {t("apps.ipod.menu.multi")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={lyricsAlignment === LyricsAlignment.Center}
                onCheckedChange={(checked) => {
                  if (checked) setLyricsAlignment(LyricsAlignment.Center);
                }}
                className="text-md h-6 pr-3"
              >
                {t("apps.ipod.menu.single")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={lyricsAlignment === LyricsAlignment.Alternating}
                onCheckedChange={(checked) => {
                  if (checked) setLyricsAlignment(LyricsAlignment.Alternating);
                }}
                className="text-md h-6 pr-3"
              >
                {t("apps.ipod.menu.alternating")}
              </MenubarCheckboxItem>

              <MenubarSeparator className="h-[2px] bg-black my-1" />

              <MenubarRadioGroup
                value={lyricsFont}
                onValueChange={(v) => setLyricsFont(v as LyricsFont)}
              >
                <MenubarRadioItem
                  value={LyricsFont.Rounded}
                  className="text-md h-6 pr-3"
                >
                  {t("apps.ipod.menu.fontRounded")}
                </MenubarRadioItem>
                <MenubarRadioItem
                  value={LyricsFont.Serif}
                  className="text-md h-6 pr-3"
                >
                  {t("apps.ipod.menu.fontSerif")}
                </MenubarRadioItem>
                <MenubarRadioItem
                  value={LyricsFont.SansSerif}
                  className="text-md h-6 pr-3"
                >
                  {t("apps.ipod.menu.fontSansSerif")}
                </MenubarRadioItem>
                <MenubarRadioItem
                  value={LyricsFont.SerifRed}
                  className="text-md h-6 pr-3"
                >
                  {t("apps.ipod.menu.fontSerifRed")}
                </MenubarRadioItem>
                <MenubarRadioItem
                  value={LyricsFont.GoldGlow}
                  className="text-md h-6 pr-3"
                >
                  {t("apps.ipod.menu.fontGoldGlow")}
                </MenubarRadioItem>
                <MenubarRadioItem
                  value={LyricsFont.Gradient}
                  className="text-md h-6 pr-3"
                >
                  {t("apps.ipod.menu.fontGradient")}
                </MenubarRadioItem>
              </MenubarRadioGroup>

            </MenubarSubContent>
          </MenubarSub>

          {/* Translate Lyrics Submenu */}
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {t("apps.ipod.menu.translate")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0 max-h-[400px] overflow-y-auto">
              <MenubarRadioGroup
                value={lyricsTranslationLanguage || "off"}
                onValueChange={(value) => {
                  setLyricsTranslationLanguage(value === "off" ? null : value);
                }}
              >
                {translationLanguages.map((lang, index) => {
                  if (lang.separator) {
                    const prevCode = translationLanguages[index - 1]?.code || "start";
                    const nextCode = translationLanguages[index + 1]?.code || "end";
                    return <MenubarSeparator key={`sep-${prevCode}-${nextCode}`} className="h-[2px] bg-black my-1" />;
                  }
                  const value = lang.code || "off";
                  return (
                    <MenubarRadioItem
                      key={value}
                      value={value}
                      className="text-md h-6 pr-3"
                    >
                      {lang.label}
                    </MenubarRadioItem>
                  );
                })}
              </MenubarRadioGroup>
            </MenubarSubContent>
          </MenubarSub>

          {/* Pronunciation Submenu */}
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {t("apps.ipod.menu.pronunciation")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              <MenubarCheckboxItem
                checked={romanization?.enabled ?? true}
                onCheckedChange={(checked) =>
                  setRomanization({ enabled: checked })
                }
                className="text-md h-6 px-3 truncate"
              >
                {t("apps.ipod.menu.pronunciation")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={romanization?.pronunciationOnly ?? false}
                onCheckedChange={(checked) =>
                  setRomanization({ pronunciationOnly: checked })
                }
                disabled={!romanization?.enabled}
                className="text-md h-6 px-3"
              >
                {t("apps.ipod.menu.pronunciationOnly")}
              </MenubarCheckboxItem>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarCheckboxItem
                checked={romanization?.japaneseFurigana ?? true}
                onCheckedChange={(checked) =>
                  setRomanization({ japaneseFurigana: checked })
                }
                disabled={!romanization?.enabled || romanization?.japaneseRomaji}
                className="text-md h-6 px-3"
              >
                {t("apps.ipod.menu.japaneseFurigana")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={romanization?.japaneseRomaji ?? false}
                onCheckedChange={(checked) =>
                  // Romaji requires furigana to annotate kanji
                  setRomanization({ japaneseRomaji: checked, japaneseFurigana: checked || (romanization?.japaneseFurigana ?? true) })
                }
                disabled={!romanization?.enabled}
                className="text-md h-6 px-3"
              >
                {t("apps.ipod.menu.japaneseRomaji")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={romanization?.korean ?? true}
                onCheckedChange={(checked) =>
                  setRomanization({ korean: checked })
                }
                disabled={!romanization?.enabled}
                className="text-md h-6 px-3"
              >
                {t("apps.ipod.menu.koreanRomanization")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={romanization?.chinese ?? false}
                onCheckedChange={(checked) =>
                  setRomanization({ chinese: checked })
                }
                disabled={!romanization?.enabled}
                className="text-md h-6 px-3"
              >
                {t("apps.ipod.menu.chinesePinyin")}
              </MenubarCheckboxItem>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarCheckboxItem
                checked={romanization?.soramimi && romanization?.soramamiTargetLanguage === "zh-TW"}
                onCheckedChange={(checked) =>
                  setRomanization({ 
                    soramimi: checked, 
                    soramamiTargetLanguage: "zh-TW" 
                  })
                }
                disabled={!romanization?.enabled}
                className="text-md h-6 px-3"
              >
                {t("apps.ipod.menu.chineseSoramimi")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={romanization?.soramimi && romanization?.soramamiTargetLanguage === "en"}
                onCheckedChange={(checked) =>
                  setRomanization({ 
                    soramimi: checked, 
                    soramamiTargetLanguage: "en" 
                  })
                }
                disabled={!romanization?.enabled}
                className="text-md h-6 px-3"
              >
                {t("apps.ipod.menu.soramimi")}
              </MenubarCheckboxItem>
            </MenubarSubContent>
          </MenubarSub>

          {/* Display Submenu */}
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {t("apps.ipod.menu.display")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              {!isAppleMusic && (
                <MenubarCheckboxItem
                  checked={effectiveDisplayMode === DisplayMode.Video}
                  onCheckedChange={(checked) => {
                    if (checked) setDisplayMode(DisplayMode.Video);
                  }}
                  className="text-md h-6 pr-3"
                >
                  {t("apps.ipod.menu.displayVideo")}
                </MenubarCheckboxItem>
              )}
              <MenubarCheckboxItem
                checked={effectiveDisplayMode === DisplayMode.Mesh}
                onCheckedChange={(checked) => {
                  if (checked) setDisplayMode(DisplayMode.Mesh);
                }}
                className="text-md h-6 pr-3"
              >
                {t("apps.ipod.menu.displayGradient")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={effectiveDisplayMode === DisplayMode.Water}
                onCheckedChange={(checked) => {
                  if (checked) setDisplayMode(DisplayMode.Water);
                }}
                className="text-md h-6 pr-3"
              >
                {t("apps.ipod.menu.displayWater")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={effectiveDisplayMode === DisplayMode.Shader}
                onCheckedChange={(checked) => {
                  if (checked) setDisplayMode(DisplayMode.Shader);
                }}
                className="text-md h-6 pr-3"
              >
                {t("apps.ipod.menu.displayShader")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={effectiveDisplayMode === DisplayMode.Landscapes}
                onCheckedChange={(checked) => {
                  if (checked) setDisplayMode(DisplayMode.Landscapes);
                }}
                className="text-md h-6 pr-3"
              >
                {t("apps.ipod.menu.displayLandscapes")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={effectiveDisplayMode === DisplayMode.Cover}
                onCheckedChange={(checked) => {
                  if (checked) setDisplayMode(DisplayMode.Cover);
                }}
                className="text-md h-6 pr-3"
              >
                {t("apps.ipod.menu.displayCover")}
              </MenubarCheckboxItem>
            </MenubarSubContent>
          </MenubarSub>

          <MenubarSeparator className="h-[2px] bg-black my-1" />

          <MenubarItem
            onClick={onRefreshLyrics || refreshLyrics}
            className="text-md h-6 px-3"
            disabled={tracks.length === 0 || currentIndex === -1}
          >
            {t("apps.ipod.menu.refreshLyrics")}
          </MenubarItem>
          <MenubarItem
            onClick={onAdjustTiming}
            className="text-md h-6 px-3"
            disabled={tracks.length === 0 || currentIndex === -1}
          >
            {t("apps.ipod.menu.adjustTiming")}
          </MenubarItem>

          {(debugMode || isAdmin) && (
            <MenubarItem
              onClick={() => {
                clearLyricsCache();
                toast.success(t("apps.ipod.menu.cacheCleared"));
              }}
              className="text-md h-6 px-3"
              disabled={tracks.length === 0 || currentIndex === -1}
            >
              {t("apps.ipod.menu.clearCache")}
            </MenubarItem>
          )}

          <MenubarSeparator className="h-[2px] bg-black my-1" />

          {/* Screen: backlight, monochrome filter, embedded video */}
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {t("apps.ipod.menu.screen")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              <MenubarCheckboxItem
                checked={isBacklightOn}
                onCheckedChange={() => toggleBacklight()}
                className="text-md h-6 px-3"
              >
                {t("apps.ipod.menu.backlight")}
              </MenubarCheckboxItem>

              <MenubarCheckboxItem
                checked={isLcdFilterOn}
                onCheckedChange={() => toggleLcdFilter()}
                className="text-md h-6 px-3"
              >
                {t("apps.ipod.menu.lcdFilter")}
              </MenubarCheckboxItem>

              <MenubarCheckboxItem
                checked={isVideoOn}
                onCheckedChange={() => toggleVideo()}
                className="text-md h-6 px-3"
                disabled={!isPlaying}
              >
                {t("apps.ipod.menu.video")}
              </MenubarCheckboxItem>
            </MenubarSubContent>
          </MenubarSub>

          {/* LCD skin — classic monochrome vs modern iOS-6 */}
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {t("apps.ipod.menu.uiTheme")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              <MenubarRadioGroup
                value={uiVariant}
                onValueChange={(value) =>
                  setUiVariant(value as "classic" | "modern")
                }
              >
                <MenubarRadioItem value="classic" className="text-md h-6 pr-3">
                  {t("apps.ipod.menu.screenClassic")}
                </MenubarRadioItem>
                <MenubarRadioItem value="modern" className="text-md h-6 pr-3">
                  {t("apps.ipod.menu.screenModern")}
                </MenubarRadioItem>
              </MenubarRadioGroup>
            </MenubarSubContent>
          </MenubarSub>

          {/* Chassis / click wheel cosmetic */}
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {t("apps.ipod.menu.deviceTheme")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              <MenubarRadioGroup
                value={currentTheme}
                onValueChange={(value) =>
                  setTheme(value as "classic" | "black" | "u2")
                }
              >
                <MenubarRadioItem value="classic" className="text-md h-6 pr-3">
                  {t("apps.ipod.menu.classic")}
                </MenubarRadioItem>
                <MenubarRadioItem value="black" className="text-md h-6 pr-3">
                  {t("apps.ipod.menu.black")}
                </MenubarRadioItem>
                <MenubarRadioItem value="u2" className="text-md h-6 pr-3">
                  {t("apps.ipod.menu.u2")}
                </MenubarRadioItem>
              </MenubarRadioGroup>
            </MenubarSubContent>
          </MenubarSub>

          <MenubarSeparator className="h-[2px] bg-black my-1" />

          <MenubarItem
            onClick={() => onToggleCoverFlow?.()}
            className="text-md h-6 px-3"
            disabled={tracks.length === 0}
          >
            {t("apps.ipod.menu.coverFlow")}
          </MenubarItem>
          <MenubarItem
            onClick={() => toggleFullScreen()}
            className="text-md h-6 px-3"
          >
            {t("apps.ipod.menu.fullScreen")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Library Menu */}
      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {t("apps.ipod.menu.library")}
        </MenubarTrigger>
        <MenubarContent
          align="start"
          sideOffset={1}
          className="px-0 max-w-[260px] sm:max-w-[280px]"
        >
          <MenubarItem
            onClick={onAddSong}
            className="text-md h-6 px-3 whitespace-nowrap"
          >
            {t("apps.ipod.menu.addToLibrary")}
          </MenubarItem>

          {librarySourceActionsNodes}

          <MenubarSeparator className="h-[2px] bg-black my-1" />

          {tracks.length > 0 && (
            <>
              {/* All Tracks section. The Radix submenu has no built-in
                  virtualization, so a 5,000-song Apple Music library would
                  commit thousands of nodes when opened. Cap the dropdown
                  to a sane size and tell the user to use the iPod itself
                  for the full list. */}
              <MenubarSub>
                <MenubarSubTrigger className="text-md h-6 px-3">
                  <div className="flex justify-between w-full items-center overflow-hidden">
                    <span className="truncate min-w-0">{t("apps.ipod.menu.allSongs")}</span>
                  </div>
                </MenubarSubTrigger>
                <MenubarSubContent className="px-0 max-w-[180px] sm:max-w-[220px] max-h-[400px] overflow-y-auto">
                  {tracks.slice(0, MENUBAR_TRACK_LIMIT).map((track, index) => (
                    <MenubarCheckboxItem
                      key={`all-${track.id}`}
                      checked={index === currentIndex}
                      onCheckedChange={() => handlePlayTrack(index, null)}
                      className="text-md h-6 pr-3 max-w-[220px] truncate"
                    >
                      <span className="truncate min-w-0">{track.title}</span>
                    </MenubarCheckboxItem>
                  ))}
                  {tracks.length > MENUBAR_TRACK_LIMIT && (
                    <MenubarItem
                      disabled
                      className="text-md h-6 px-3 italic opacity-70"
                    >
                      {t(
                        "apps.ipod.menu.menubarTrackLimit",
                        `Showing ${MENUBAR_TRACK_LIMIT} of ${tracks.length} — open iPod to browse all`,
                        {
                          limit: MENUBAR_TRACK_LIMIT,
                          total: tracks.length,
                        }
                      )}
                    </MenubarItem>
                  )}
                </MenubarSubContent>
              </MenubarSub>

              {/* Individual Artist submenus. Same reasoning — cap the
                  outer artist list. The full grouping is still memoized
                  above so the iPod screen can use it freely. */}
              <div className="max-h-[300px] overflow-y-auto">
                {artists.slice(0, MENUBAR_ARTIST_LIMIT).map((artist) => {
                  const artistQueueIds = tracksByArtist[artist].map(
                    ({ track }) => track.id
                  );
                  return (
                  <MenubarSub key={artist}>
                    <MenubarSubTrigger className="text-md h-6 px-3">
                      <div className="flex justify-between w-full items-center overflow-hidden">
                        <span className="truncate min-w-0">{artist}</span>
                      </div>
                    </MenubarSubTrigger>
                    <MenubarSubContent className="px-0 max-w-[180px] sm:max-w-[220px] max-h-[200px] overflow-y-auto">
                      {tracksByArtist[artist]
                        .slice(0, MENUBAR_TRACK_LIMIT)
                        .map(({ track, index }) => (
                          <MenubarCheckboxItem
                            key={`${artist}-${track.id}`}
                            checked={index === currentIndex}
                            onCheckedChange={() =>
                              handlePlayTrack(index, artistQueueIds)
                            }
                            className="text-md h-6 pr-3 max-w-[160px] sm:max-w-[200px] truncate"
                          >
                            <span className="truncate min-w-0">
                              {track.title}
                            </span>
                          </MenubarCheckboxItem>
                        ))}
                    </MenubarSubContent>
                  </MenubarSub>
                  );
                })}
                {artists.length > MENUBAR_ARTIST_LIMIT && (
                  <MenubarItem
                    disabled
                    className="text-md h-6 px-3 italic opacity-70"
                  >
                    {t(
                      "apps.ipod.menu.menubarArtistLimit",
                      `Showing ${MENUBAR_ARTIST_LIMIT} of ${artists.length} artists`,
                      {
                        limit: MENUBAR_ARTIST_LIMIT,
                        total: artists.length,
                      }
                    )}
                  </MenubarItem>
                )}
              </div>

              <MenubarSeparator className="h-[2px] bg-black my-1" />
            </>
          )}

          {librarySwitchMenubarItem}
        </MenubarContent>
      </MenubarMenu>

      {/* Help Menu */}
      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onShowHelp}
            className="text-md h-6 px-3"
          >
            {t("apps.ipod.menu.ipodHelp")}
          </MenubarItem>
          {!isMacOsxTheme && (
            <>
              <MenubarItem
                onSelect={() => setIsShareDialogOpen(true)}
                className="text-md h-6 px-3"
              >
                {t("apps.ipod.menu.shareApp")}
              </MenubarItem>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem
                onClick={onShowAbout}
                className="text-md h-6 px-3"
              >
                {t("apps.ipod.menu.aboutIpod")}
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>
      <ShareItemDialog
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
        itemType="App"
        itemIdentifier={appId}
        title={appName}
        generateShareUrl={generateAppShareUrl}
      />
    </MenuBar>
  );
}
