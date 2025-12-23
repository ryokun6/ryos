import { useState } from "react";
import { MenuBar } from "@/components/layout/MenuBar";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarCheckboxItem,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarRadioGroup,
  MenubarRadioItem,
} from "@/components/ui/menubar";
import { useTranslation } from "react-i18next";
import { useThemeStore } from "@/stores/useThemeStore";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { useIpodStoreShallow } from "@/stores/helpers";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { toast } from "sonner";
import { LyricsAlignment, LyricsFont } from "@/types/lyrics";
import { Track } from "@/stores/useIpodStore";

interface KaraokeMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  // File menu actions
  onAddSong: () => void;
  onShareSong: () => void;
  // Library actions
  onClearLibrary: () => void;
  onSyncLibrary: () => void;
  onPlayTrack: (index: number) => void;
  // Playback controls
  onTogglePlay: () => void;
  onPreviousTrack: () => void;
  onNextTrack: () => void;
  isPlaying: boolean;
  isShuffled: boolean;
  onToggleShuffle: () => void;
  loopAll: boolean;
  onToggleLoopAll: () => void;
  loopCurrent: boolean;
  onToggleLoopCurrent: () => void;
  // View options
  showLyrics: boolean;
  onToggleLyrics: () => void;
  onToggleFullScreen: () => void;
  onRefreshLyrics?: () => void;
  // Tracks
  tracks: Track[];
  currentIndex: number;
}

export function KaraokeMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  onAddSong,
  onShareSong,
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
  tracks,
  currentIndex,
}: KaraokeMenuBarProps) {
  const { t } = useTranslation();
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const appId = "karaoke";
  const appName = t("apps.karaoke.name");

  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const debugMode = useDisplaySettingsStore((state) => state.debugMode);

  // Lyrics settings from iPod store
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
    lyricsFont: s.lyricsFont ?? LyricsFont.Rounded,
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

  // Group tracks by artist
  const tracksByArtist = tracks.reduce<
    Record<string, { track: Track; index: number }[]>
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
          {t("apps.karaoke.menu.file")}
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
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("apps.karaoke.menu.controls")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onTogglePlay}
            className="text-md h-6 px-3"
            disabled={tracks.length === 0}
          >
            {isPlaying ? t("apps.ipod.menu.pause") : t("apps.ipod.menu.play")}
          </MenubarItem>
          <MenubarItem
            onClick={onPreviousTrack}
            className="text-md h-6 px-3"
            disabled={tracks.length === 0}
          >
            {t("apps.karaoke.menu.previous")}
          </MenubarItem>
          <MenubarItem
            onClick={onNextTrack}
            className="text-md h-6 px-3"
            disabled={tracks.length === 0}
          >
            {t("apps.karaoke.menu.next")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarCheckboxItem
            checked={isShuffled}
            onCheckedChange={onToggleShuffle}
            className="text-md h-6 px-3"
          >
            {t("apps.karaoke.menu.shuffle")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={loopAll}
            onCheckedChange={onToggleLoopAll}
            className="text-md h-6 px-3"
          >
            {t("apps.karaoke.menu.repeatAll")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={loopCurrent}
            onCheckedChange={onToggleLoopCurrent}
            className="text-md h-6 px-3"
          >
            {t("apps.karaoke.menu.repeatOne")}
          </MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>

      {/* View Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("apps.karaoke.menu.view")}
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
                onCheckedChange={onToggleLyrics}
                className="text-md h-6 px-3"
              >
                {t("apps.karaoke.menu.showLyrics")}
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

              {/* Font style modes */}
              <MenubarCheckboxItem
                checked={lyricsFont === LyricsFont.Rounded}
                onCheckedChange={(checked) => {
                  if (checked) setLyricsFont(LyricsFont.Rounded);
                }}
                className="text-md h-6 pr-3"
              >
                {t("apps.ipod.menu.fontRounded")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={lyricsFont === LyricsFont.Serif}
                onCheckedChange={(checked) => {
                  if (checked) setLyricsFont(LyricsFont.Serif);
                }}
                className="text-md h-6 pr-3"
              >
                {t("apps.ipod.menu.fontSerif")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={lyricsFont === LyricsFont.SansSerif}
                onCheckedChange={(checked) => {
                  if (checked) setLyricsFont(LyricsFont.SansSerif);
                }}
                className="text-md h-6 pr-3"
              >
                {t("apps.ipod.menu.fontSansSerif")}
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
                {translationLanguages.map((lang, index) => {
                  if (lang.separator) {
                    return <MenubarSeparator key={`sep-${index}`} className="h-[2px] bg-black my-1" />;
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
                {t("apps.ipod.menu.showPronunciation")}
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
                checked={romanization?.korean ?? false}
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

          <MenubarItem
            onClick={onToggleFullScreen}
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
          className="px-0 max-w-[180px] sm:max-w-[220px]"
        >
          <MenubarItem
            onClick={onAddSong}
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
                      onCheckedChange={() => onPlayTrack(index)}
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
                          onCheckedChange={() => onPlayTrack(index)}
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
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onShowHelp}
            className="text-md h-6 px-3"
          >
            {t("apps.karaoke.menu.karaokeHelp")}
          </MenubarItem>
          <MenubarItem
            onSelect={() => setIsShareDialogOpen(true)}
            className="text-md h-6 px-3"
          >
            {t("apps.karaoke.menu.shareApp")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onShowAbout}
            className="text-md h-6 px-3"
          >
            {t("apps.karaoke.menu.aboutKaraoke")}
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
