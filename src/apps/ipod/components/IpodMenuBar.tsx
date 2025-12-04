import { useState } from "react";
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
} from "@/components/ui/menubar";
import { cn } from "@/lib/utils";
import { useIpodStoreShallow } from "@/stores/helpers";
import { toast } from "sonner";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { LyricsAlignment, ChineseVariant, KoreanDisplay } from "@/types/lyrics";
import { useThemeStore } from "@/stores/useThemeStore";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { appRegistry } from "@/config/appRegistry";
import { useTranslation } from "react-i18next";

interface IpodMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onClearLibrary: () => void;
  onSyncLibrary: () => void;
  onAddTrack: () => void;
  onShareSong: () => void;
}

export function IpodMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  onClearLibrary,
  onSyncLibrary,
  onAddTrack,
  onShareSong,
}: IpodMenuBarProps) {
  const { t } = useTranslation();
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const appId = "ipod";
  const appName = appRegistry[appId as keyof typeof appRegistry]?.name || appId;

  const translationLanguages = [
    { label: t("apps.ipod.translationLanguages.original"), code: null },
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
    tracks,
    currentIndex,
    isLoopAll,
    isLoopCurrent,
    isPlaying,
    isShuffled,
    isBacklightOn,
    isVideoOn,
    isLcdFilterOn,
    currentTheme,
    showLyrics,
    isFullScreen,
    lyricsAlignment,
    chineseVariant,
    koreanDisplay,
    lyricsTranslationLanguage,
    // Actions
    setCurrentIndex,
    setIsPlaying,
    toggleLoopAll,
    toggleLoopCurrent,
    toggleShuffle,
    togglePlay,
    nextTrack,
    previousTrack,
    toggleBacklight,
    toggleVideo,
    toggleLcdFilter,
    toggleFullScreen,
    setTheme,
    toggleLyrics,
    setLyricsAlignment,
    refreshLyrics,
    setChineseVariant,
    setKoreanDisplay,
    setLyricsTranslationLanguage,
    importLibrary,
    exportLibrary,
  } = useIpodStoreShallow((s) => ({
    // State
    tracks: s.tracks,
    currentIndex: s.currentIndex,
    isLoopAll: s.loopAll,
    isLoopCurrent: s.loopCurrent,
    isPlaying: s.isPlaying,
    isShuffled: s.isShuffled,
    isBacklightOn: s.backlightOn,
    isVideoOn: s.showVideo,
    isLcdFilterOn: s.lcdFilterOn,
    currentTheme: s.theme,
    showLyrics: s.showLyrics,
    isFullScreen: s.isFullScreen,
    lyricsAlignment: s.lyricsAlignment ?? LyricsAlignment.FocusThree,
    chineseVariant: s.chineseVariant ?? ChineseVariant.Traditional,
    koreanDisplay: s.koreanDisplay ?? KoreanDisplay.Original,
    lyricsTranslationLanguage: s.lyricsTranslationLanguage,
    // Actions
    setCurrentIndex: s.setCurrentIndex,
    setIsPlaying: s.setIsPlaying,
    toggleLoopAll: s.toggleLoopAll,
    toggleLoopCurrent: s.toggleLoopCurrent,
    toggleShuffle: s.toggleShuffle,
    togglePlay: s.togglePlay,
    nextTrack: s.nextTrack,
    previousTrack: s.previousTrack,
    toggleBacklight: s.toggleBacklight,
    toggleVideo: s.toggleVideo,
    toggleLcdFilter: s.toggleLcdFilter,
    toggleFullScreen: s.toggleFullScreen,
    setTheme: s.setTheme,
    toggleLyrics: s.toggleLyrics,
    setLyricsAlignment: s.setLyricsAlignment,
    refreshLyrics: s.refreshLyrics,
    setChineseVariant: s.setChineseVariant,
    setKoreanDisplay: s.setKoreanDisplay,
    setLyricsTranslationLanguage: s.setLyricsTranslationLanguage,
    importLibrary: s.importLibrary,
    exportLibrary: s.exportLibrary,
  }));

  const appTheme = useThemeStore((state) => state.current);
  const isXpTheme = appTheme === "xp" || appTheme === "win98";

  const handlePlayTrack = (index: number) => {
    setCurrentIndex(index);
    setIsPlaying(true);
  };

  // Group tracks by artist
  const tracksByArtist = tracks.reduce<
    Record<string, { track: (typeof tracks)[0]; index: number }[]>
  >((acc, track, index) => {
    const artist = track.artist || t("apps.ipod.menu.unknownArtist");
    if (!acc[artist]) {
      acc[artist] = [];
    }
    acc[artist].push({ track, index });
    return acc;
  }, {});

  // Get sorted list of artists
  const artists = Object.keys(tracksByArtist).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
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

  return (
    <MenuBar inWindowFrame={isXpTheme}>
      {/* File Menu */}
      <MenubarMenu>
        <MenubarTrigger className="h-6 text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("apps.ipod.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onAddTrack}
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
        <MenubarTrigger className="h-6 px-2 py-1 text-md focus-visible:ring-0">
          {t("apps.ipod.menu.controls")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={togglePlay}
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
          <MenubarItem
            onClick={toggleShuffle}
            className="text-md h-6 px-3"
          >
            <span className={cn(!isShuffled && "pl-4")}>
              {isShuffled ? `✓ ${t("apps.ipod.menu.shuffle")}` : t("apps.ipod.menu.shuffle")}
            </span>
          </MenubarItem>
          <MenubarItem
            onClick={toggleLoopAll}
            className="text-md h-6 px-3"
          >
            <span className={cn(!isLoopAll && "pl-4")}>
              {isLoopAll ? `✓ ${t("apps.ipod.menu.repeatAll")}` : t("apps.ipod.menu.repeatAll")}
            </span>
          </MenubarItem>
          <MenubarItem
            onClick={toggleLoopCurrent}
            className="text-md h-6 px-3"
          >
            <span className={cn(!isLoopCurrent && "pl-4")}>
              {isLoopCurrent ? `✓ ${t("apps.ipod.menu.repeatOne")}` : t("apps.ipod.menu.repeatOne")}
            </span>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* View Menu */}
      <MenubarMenu>
        <MenubarTrigger className="h-6 px-2 py-1 text-md focus-visible:ring-0">
          {t("apps.ipod.menu.view")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          {/* Lyrics Submenu */}
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {t("apps.ipod.menu.lyrics")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              <MenubarItem
                onClick={toggleLyrics}
                className="text-md h-6 px-3"
              >
                <span className={cn(!showLyrics && "pl-4")}>
                  {showLyrics ? `✓ ${t("apps.ipod.menu.showLyrics")}` : t("apps.ipod.menu.showLyrics")}
                </span>
              </MenubarItem>

              <MenubarItem
                onClick={refreshLyrics}
                className="text-md h-6 px-3"
                disabled={tracks.length === 0 || currentIndex === -1}
              >
                {t("apps.ipod.menu.refreshLyrics")}
              </MenubarItem>

              <MenubarSeparator className="h-[2px] bg-black my-1" />

              {/* Chinese toggle */}
              <MenubarItem
                onClick={() =>
                  setChineseVariant(
                    chineseVariant === ChineseVariant.Traditional
                      ? ChineseVariant.Original
                      : ChineseVariant.Traditional
                  )
                }
                className="text-md h-6 px-3"
              >
                <span
                  className={cn(
                    chineseVariant !== ChineseVariant.Traditional && "pl-4"
                  )}
                >
                  {chineseVariant === ChineseVariant.Traditional
                    ? `✓ ${t("apps.ipod.menu.traditionalChinese")}`
                    : t("apps.ipod.menu.traditionalChinese")}
                </span>
              </MenubarItem>

              {/* Korean toggle */}
              <MenubarItem
                onClick={() =>
                  setKoreanDisplay(
                    koreanDisplay === KoreanDisplay.Original
                      ? KoreanDisplay.Romanized
                      : KoreanDisplay.Original
                  )
                }
                className="text-md h-6 px-3"
              >
                <span
                  className={cn(
                    koreanDisplay !== KoreanDisplay.Original && "pl-4"
                  )}
                >
                  {koreanDisplay === KoreanDisplay.Original ? `✓ ${t("apps.ipod.menu.korean")}` : t("apps.ipod.menu.korean")}
                </span>
              </MenubarItem>

              <MenubarSeparator className="h-[2px] bg-black my-1" />

              {/* Alignment modes */}
              <MenubarItem
                onClick={() => setLyricsAlignment(LyricsAlignment.FocusThree)}
                className="text-md h-6 px-3"
              >
                <span
                  className={cn(
                    lyricsAlignment !== LyricsAlignment.FocusThree && "pl-4"
                  )}
                >
                  {lyricsAlignment === LyricsAlignment.FocusThree
                    ? `✓ ${t("apps.ipod.menu.multi")}`
                    : t("apps.ipod.menu.multi")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => setLyricsAlignment(LyricsAlignment.Center)}
                className="text-md h-6 px-3"
              >
                <span
                  className={cn(
                    lyricsAlignment !== LyricsAlignment.Center && "pl-4"
                  )}
                >
                  {lyricsAlignment === LyricsAlignment.Center
                    ? `✓ ${t("apps.ipod.menu.single")}`
                    : t("apps.ipod.menu.single")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => setLyricsAlignment(LyricsAlignment.Alternating)}
                className="text-md h-6 px-3"
              >
                <span
                  className={cn(
                    lyricsAlignment !== LyricsAlignment.Alternating && "pl-4"
                  )}
                >
                  {lyricsAlignment === LyricsAlignment.Alternating
                    ? `✓ ${t("apps.ipod.menu.alternating")}`
                    : t("apps.ipod.menu.alternating")}
                </span>
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>

          {/* Translate Lyrics Submenu */}
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {t("apps.ipod.menu.translate")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0 max-h-[400px] overflow-y-auto">
              {translationLanguages.map((lang) => {
                // Show checkmark if this language is the current persistent preference
                const isSelected = lyricsTranslationLanguage === lang.code;
                const isOriginal = !lang.code && !lyricsTranslationLanguage;
                
                return (
                  <MenubarItem
                    key={lang.code || "off"}
                    onClick={() => {
                      setLyricsTranslationLanguage(lang.code);
                    }}
                    className="text-md h-6 px-3"
                  >
                    <span className={cn((!isSelected && !isOriginal) && "pl-4")}>
                      {(isSelected || isOriginal) ? "✓ " : ""}{lang.label}
                    </span>
                  </MenubarItem>
                );
              })}
            </MenubarSubContent>
          </MenubarSub>

          <MenubarSeparator className="h-[2px] bg-black my-1" />

          <MenubarItem
            onClick={toggleBacklight}
            className="text-md h-6 px-3"
          >
            <span className={cn(!isBacklightOn && "pl-4")}>
              {isBacklightOn ? `✓ ${t("apps.ipod.menu.backlight")}` : t("apps.ipod.menu.backlight")}
            </span>
          </MenubarItem>

          <MenubarItem
            onClick={toggleLcdFilter}
            className="text-md h-6 px-3"
          >
            <span className={cn(!isLcdFilterOn && "pl-4")}>
              {isLcdFilterOn ? `✓ ${t("apps.ipod.menu.lcdFilter")}` : t("apps.ipod.menu.lcdFilter")}
            </span>
          </MenubarItem>
          <MenubarItem
            onClick={toggleVideo}
            className="text-md h-6 px-3"
            disabled={!isPlaying}
          >
            <span className={cn(!isVideoOn && "pl-4")}>
              {isVideoOn ? `✓ ${t("apps.ipod.menu.video")}` : t("apps.ipod.menu.video")}
            </span>
          </MenubarItem>

          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={() => setTheme("classic")}
            className="text-md h-6 px-3"
          >
            <span className={cn(currentTheme !== "classic" && "pl-4")}>
              {currentTheme === "classic" ? `✓ ${t("apps.ipod.menu.classic")}` : t("apps.ipod.menu.classic")}
            </span>
          </MenubarItem>
          <MenubarItem
            onClick={() => setTheme("black")}
            className="text-md h-6 px-3"
          >
            <span className={cn(currentTheme !== "black" && "pl-4")}>
              {currentTheme === "black" ? `✓ ${t("apps.ipod.menu.black")}` : t("apps.ipod.menu.black")}
            </span>
          </MenubarItem>
          <MenubarItem
            onClick={() => setTheme("u2")}
            className="text-md h-6 px-3"
          >
            <span className={cn(currentTheme !== "u2" && "pl-4")}>
              {currentTheme === "u2" ? `✓ ${t("apps.ipod.menu.u2")}` : t("apps.ipod.menu.u2")}
            </span>
          </MenubarItem>

          <MenubarSeparator className="h-[2px] bg-black my-1" />

          <MenubarItem
            onClick={toggleFullScreen}
            className="text-md h-6 px-3"
          >
            <span className={cn(!isFullScreen && "pl-4")}>
              {isFullScreen ? `✓ ${t("apps.ipod.menu.fullScreen")}` : t("apps.ipod.menu.fullScreen")}
            </span>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Library Menu */}
      <MenubarMenu>
        <MenubarTrigger className="h-6 px-2 py-1 text-md focus-visible:ring-0">
          {t("apps.ipod.menu.library")}
        </MenubarTrigger>
        <MenubarContent
          align="start"
          sideOffset={1}
          className="px-0 max-w-[180px] sm:max-w-[220px]"
        >
          <MenubarItem
            onClick={onAddTrack}
            className="text-md h-6 px-3"
          >
            {t("apps.ipod.menu.addToLibrary")}
          </MenubarItem>

          {tracks.length > 0 && (
            <>
              <MenubarSeparator className="h-[2px] bg-black my-1" />

              {/* All Tracks section */}
              <MenubarSub>
                <MenubarSubTrigger className="text-md h-6 px-3">
                  <div className="flex justify-between w-full items-center overflow-hidden">
                    <span className="truncate min-w-0">{t("apps.ipod.menu.allSongs")}</span>
                  </div>
                </MenubarSubTrigger>
                <MenubarSubContent className="px-0 max-w-[180px] sm:max-w-[220px] max-h-[400px] overflow-y-auto">
                  {tracks.map((track, index) => (
                    <MenubarItem
                      key={`all-${track.id}`}
                      onClick={() => handlePlayTrack(index)}
                      className={cn(
                        "text-md h-6 px-3 max-w-[220px] truncate",
                        index === currentIndex && "bg-gray-200"
                      )}
                    >
                      <div className="flex items-center w-full">
                        <span
                          className={cn(
                            "flex-none whitespace-nowrap",
                            index === currentIndex ? "mr-1" : "pl-5"
                          )}
                        >
                          {index === currentIndex ? "♪ " : ""}
                        </span>
                        <span className="truncate min-w-0">{track.title}</span>
                      </div>
                    </MenubarItem>
                  ))}
                </MenubarSubContent>
              </MenubarSub>

              {/* Individual Artist submenus */}
              <div className="max-h-[300px] overflow-y-auto">
                {artists.map((artist) => (
                  <MenubarSub key={artist}>
                    <MenubarSubTrigger className="text-md h-6 px-3">
                      <div className="flex justify-between w-full items-center overflow-hidden">
                        <span className="truncate min-w-0">{artist}</span>
                      </div>
                    </MenubarSubTrigger>
                    <MenubarSubContent className="px-0 max-w-[180px] sm:max-w-[220px] max-h-[200px] overflow-y-auto">
                      {tracksByArtist[artist].map(({ track, index }) => (
                        <MenubarItem
                          key={`${artist}-${track.id}`}
                          onClick={() => handlePlayTrack(index)}
                          className={cn(
                            "text-md h-6 px-3 max-w-[160px] sm:max-w-[200px] truncate",
                            index === currentIndex && "bg-gray-200"
                          )}
                        >
                          <div className="flex items-center w-full">
                            <span
                              className={cn(
                                "flex-none whitespace-nowrap",
                                index === currentIndex ? "mr-1" : "pl-5"
                              )}
                            >
                              {index === currentIndex ? "♪ " : ""}
                            </span>
                            <span className="truncate min-w-0">
                              {track.title}
                            </span>
                          </div>
                        </MenubarItem>
                      ))}
                    </MenubarSubContent>
                  </MenubarSub>
                ))}
              </div>

              <MenubarSeparator className="h-[2px] bg-black my-1" />
            </>
          )}

          <MenubarItem
            onClick={onClearLibrary}
            className="text-md h-6 px-3"
          >
            {t("apps.ipod.menu.clearLibrary")}
          </MenubarItem>
          <MenubarItem
            onClick={onSyncLibrary}
            className="text-md h-6 px-3"
          >
            {t("apps.ipod.menu.syncLibrary")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Help Menu */}
      <MenubarMenu>
        <MenubarTrigger className="h-6 px-2 py-1 text-md focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onShowHelp}
            className="text-md h-6 px-3"
          >
            {t("apps.ipod.menu.ipodHelp")}
          </MenubarItem>
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
