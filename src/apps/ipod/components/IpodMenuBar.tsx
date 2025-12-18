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
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
} from "@/components/ui/menubar";
import { useIpodStoreShallow } from "@/stores/helpers";
import { useAppStore } from "@/stores/useAppStore";
import { toast } from "sonner";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { LyricsAlignment, ChineseVariant, KoreanDisplay, JapaneseFurigana } from "@/types/lyrics";
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
  onRefreshLyrics?: () => void;
}

export function IpodMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  onClearLibrary,
  onSyncLibrary,
  onAddTrack,
  onShareSong,
  onRefreshLyrics,
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
    japaneseFurigana,
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
    clearLyricsCache,
    setChineseVariant,
    setKoreanDisplay,
    setJapaneseFurigana,
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
    japaneseFurigana: s.japaneseFurigana ?? JapaneseFurigana.On,
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
    clearLyricsCache: s.clearLyricsCache,
    setChineseVariant: s.setChineseVariant,
    setKoreanDisplay: s.setKoreanDisplay,
    setJapaneseFurigana: s.setJapaneseFurigana,
    setLyricsTranslationLanguage: s.setLyricsTranslationLanguage,
    importLibrary: s.importLibrary,
    exportLibrary: s.exportLibrary,
  }));

  const appTheme = useThemeStore((state) => state.current);
  const isXpTheme = appTheme === "xp" || appTheme === "win98";
  const debugMode = useAppStore((state) => state.debugMode);

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
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
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
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
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

              {/* Chinese toggle */}
              <MenubarCheckboxItem
                checked={chineseVariant === ChineseVariant.Traditional}
                onCheckedChange={(checked) =>
                  setChineseVariant(
                    checked
                      ? ChineseVariant.Traditional
                      : ChineseVariant.Original
                  )
                }
                className="text-md h-6 px-3"
              >
                {t("apps.ipod.menu.traditionalChinese")}
              </MenubarCheckboxItem>

              {/* Korean toggle */}
              <MenubarCheckboxItem
                checked={koreanDisplay === KoreanDisplay.Original}
                onCheckedChange={(checked) =>
                  setKoreanDisplay(
                    checked
                      ? KoreanDisplay.Original
                      : KoreanDisplay.Romanized
                  )
                }
                className="text-md h-6 px-3"
              >
                {t("apps.ipod.menu.korean")}
              </MenubarCheckboxItem>

              {/* Japanese furigana toggle */}
              <MenubarCheckboxItem
                checked={japaneseFurigana === JapaneseFurigana.On}
                onCheckedChange={(checked) =>
                  setJapaneseFurigana(
                    checked
                      ? JapaneseFurigana.On
                      : JapaneseFurigana.Off
                  )
                }
                className="text-md h-6 px-3"
              >
                {t("apps.ipod.menu.furigana")}
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
                {translationLanguages.map((lang) => {
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

          <MenubarItem
            onClick={onRefreshLyrics || refreshLyrics}
            className="text-md h-6 px-3"
            disabled={tracks.length === 0 || currentIndex === -1}
          >
            {t("apps.ipod.menu.refreshLyrics")}
          </MenubarItem>

          {debugMode && (
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

          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarCheckboxItem
            checked={currentTheme === "classic"}
            onCheckedChange={(checked) => {
              if (checked) setTheme("classic");
            }}
            className="text-md h-6 pr-3"
          >
            {t("apps.ipod.menu.classic")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={currentTheme === "black"}
            onCheckedChange={(checked) => {
              if (checked) setTheme("black");
            }}
            className="text-md h-6 pr-3"
          >
            {t("apps.ipod.menu.black")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={currentTheme === "u2"}
            onCheckedChange={(checked) => {
              if (checked) setTheme("u2");
            }}
            className="text-md h-6 pr-3"
          >
            {t("apps.ipod.menu.u2")}
          </MenubarCheckboxItem>

          <MenubarSeparator className="h-[2px] bg-black my-1" />

          <MenubarCheckboxItem
            checked={isFullScreen}
            onCheckedChange={() => toggleFullScreen()}
            className="text-md h-6 px-3"
          >
            {t("apps.ipod.menu.fullScreen")}
          </MenubarCheckboxItem>
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
                    <MenubarCheckboxItem
                      key={`all-${track.id}`}
                      checked={index === currentIndex}
                      onCheckedChange={() => handlePlayTrack(index)}
                      className="text-md h-6 pr-3 max-w-[220px] truncate"
                    >
                      <span className="truncate min-w-0">{track.title}</span>
                    </MenubarCheckboxItem>
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
                        <MenubarCheckboxItem
                          key={`${artist}-${track.id}`}
                          checked={index === currentIndex}
                          onCheckedChange={() => handlePlayTrack(index)}
                          className="text-md h-6 pr-3 max-w-[160px] sm:max-w-[200px] truncate"
                        >
                          <span className="truncate min-w-0">
                            {track.title}
                          </span>
                        </MenubarCheckboxItem>
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
