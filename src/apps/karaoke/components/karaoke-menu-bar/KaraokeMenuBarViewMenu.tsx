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
import { toast } from "sonner";
import { LyricsAlignment, LyricsFont, DisplayMode } from "@/types/lyrics";
import type { KaraokeMenuBarViewModel } from "./useKaraokeMenuBar";

export function KaraokeMenuBarViewMenu({ vm }: { vm: KaraokeMenuBarViewModel }) {
  return (
    <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {vm.t("apps.karaoke.menu.view")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          {/* Lyrics Submenu */}
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {vm.t("apps.ipod.menu.lyrics")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              <MenubarCheckboxItem
                checked={vm.showLyrics}
                onCheckedChange={vm.onToggleLyrics}
                className="text-md h-6 px-3"
              >
                {vm.t("apps.karaoke.menu.showLyrics")}
              </MenubarCheckboxItem>

              <MenubarSeparator className="h-[2px] bg-black my-1" />

              {/* Alignment modes */}
              <MenubarCheckboxItem
                checked={vm.lyricsAlignment === LyricsAlignment.FocusThree}
                onCheckedChange={(checked) => {
                  if (checked) vm.setLyricsAlignment(LyricsAlignment.FocusThree);
                }}
                className="text-md h-6 pr-3"
              >
                {vm.t("apps.ipod.menu.multi")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={vm.lyricsAlignment === LyricsAlignment.Center}
                onCheckedChange={(checked) => {
                  if (checked) vm.setLyricsAlignment(LyricsAlignment.Center);
                }}
                className="text-md h-6 pr-3"
              >
                {vm.t("apps.ipod.menu.single")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={vm.lyricsAlignment === LyricsAlignment.Alternating}
                onCheckedChange={(checked) => {
                  if (checked) vm.setLyricsAlignment(LyricsAlignment.Alternating);
                }}
                className="text-md h-6 pr-3"
              >
                {vm.t("apps.ipod.menu.alternating")}
              </MenubarCheckboxItem>

              <MenubarSeparator className="h-[2px] bg-black my-1" />

              {/* Font style modes */}
              <MenubarCheckboxItem
                checked={vm.lyricsFont === LyricsFont.Rounded}
                onCheckedChange={(checked) => {
                  if (checked) vm.setLyricsFont(LyricsFont.Rounded);
                }}
                className="text-md h-6 pr-3"
              >
                {vm.t("apps.ipod.menu.fontRounded")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={vm.lyricsFont === LyricsFont.Serif}
                onCheckedChange={(checked) => {
                  if (checked) vm.setLyricsFont(LyricsFont.Serif);
                }}
                className="text-md h-6 pr-3"
              >
                {vm.t("apps.ipod.menu.fontSerif")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={vm.lyricsFont === LyricsFont.SansSerif}
                onCheckedChange={(checked) => {
                  if (checked) vm.setLyricsFont(LyricsFont.SansSerif);
                }}
                className="text-md h-6 pr-3"
              >
                {vm.t("apps.ipod.menu.fontSansSerif")}
              </MenubarCheckboxItem>

              {/* Special style modes */}
              <MenubarCheckboxItem
                checked={vm.lyricsFont === LyricsFont.SerifRed}
                onCheckedChange={(checked) => {
                  if (checked) vm.setLyricsFont(LyricsFont.SerifRed);
                }}
                className="text-md h-6 pr-3"
              >
                {vm.t("apps.ipod.menu.fontSerifRed")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={vm.lyricsFont === LyricsFont.GoldGlow}
                onCheckedChange={(checked) => {
                  if (checked) vm.setLyricsFont(LyricsFont.GoldGlow);
                }}
                className="text-md h-6 pr-3"
              >
                {vm.t("apps.ipod.menu.fontGoldGlow")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={vm.lyricsFont === LyricsFont.Gradient}
                onCheckedChange={(checked) => {
                  if (checked) vm.setLyricsFont(LyricsFont.Gradient);
                }}
                className="text-md h-6 pr-3"
              >
                {vm.t("apps.ipod.menu.fontGradient")}
              </MenubarCheckboxItem>
            </MenubarSubContent>
          </MenubarSub>

          {/* Translate Lyrics Submenu */}
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {vm.t("apps.ipod.menu.translate")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0 max-h-[400px] overflow-y-auto">
              <MenubarRadioGroup
                value={vm.lyricsTranslationLanguage || "off"}
                onValueChange={(value) => {
                  vm.setLyricsTranslationLanguage(value === "off" ? null : value);
                }}
              >
                {vm.translationLanguages.map((lang, index) => {
                  if (lang.separator) {
                    const prevCode = vm.translationLanguages[index - 1]?.code || "start";
                    const nextCode = vm.translationLanguages[index + 1]?.code || "end";
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
              {vm.t("apps.ipod.menu.pronunciation")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              <MenubarCheckboxItem
                checked={vm.romanization?.enabled ?? true}
                onCheckedChange={(checked) =>
                  vm.setRomanization({ enabled: checked })
                }
                className="text-md h-6 px-3 truncate"
              >
                {vm.t("apps.ipod.menu.pronunciation")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={vm.romanization?.pronunciationOnly ?? false}
                onCheckedChange={(checked) =>
                  vm.setRomanization({ pronunciationOnly: checked })
                }
                disabled={!vm.romanization?.enabled}
                className="text-md h-6 px-3"
              >
                {vm.t("apps.ipod.menu.pronunciationOnly")}
              </MenubarCheckboxItem>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarCheckboxItem
                checked={vm.romanization?.japaneseFurigana ?? true}
                onCheckedChange={(checked) =>
                  vm.setRomanization({ japaneseFurigana: checked })
                }
                disabled={!vm.romanization?.enabled || vm.romanization?.japaneseRomaji}
                className="text-md h-6 px-3"
              >
                {vm.t("apps.ipod.menu.japaneseFurigana")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={vm.romanization?.japaneseRomaji ?? false}
                onCheckedChange={(checked) =>
                  // Romaji requires furigana to annotate kanji
                  vm.setRomanization({ japaneseRomaji: checked, japaneseFurigana: checked || (vm.romanization?.japaneseFurigana ?? true) })
                }
                disabled={!vm.romanization?.enabled}
                className="text-md h-6 px-3"
              >
                {vm.t("apps.ipod.menu.japaneseRomaji")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={vm.romanization?.korean ?? true}
                onCheckedChange={(checked) =>
                  vm.setRomanization({ korean: checked })
                }
                disabled={!vm.romanization?.enabled}
                className="text-md h-6 px-3"
              >
                {vm.t("apps.ipod.menu.koreanRomanization")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={vm.romanization?.chinese ?? false}
                onCheckedChange={(checked) =>
                  vm.setRomanization({ chinese: checked })
                }
                disabled={!vm.romanization?.enabled}
                className="text-md h-6 px-3"
              >
                {vm.t("apps.ipod.menu.chinesePinyin")}
              </MenubarCheckboxItem>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarCheckboxItem
                checked={vm.romanization?.soramimi && vm.romanization?.soramamiTargetLanguage === "zh-TW"}
                onCheckedChange={(checked) =>
                  vm.setRomanization({ 
                    soramimi: checked, 
                    soramamiTargetLanguage: "zh-TW" 
                  })
                }
                disabled={!vm.romanization?.enabled}
                className="text-md h-6 px-3"
              >
                {vm.t("apps.ipod.menu.chineseSoramimi")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={vm.romanization?.soramimi && vm.romanization?.soramamiTargetLanguage === "en"}
                onCheckedChange={(checked) =>
                  vm.setRomanization({ 
                    soramimi: checked, 
                    soramamiTargetLanguage: "en" 
                  })
                }
                disabled={!vm.romanization?.enabled}
                className="text-md h-6 px-3"
              >
                {vm.t("apps.ipod.menu.soramimi")}
              </MenubarCheckboxItem>
            </MenubarSubContent>
          </MenubarSub>

          {/* Display Submenu */}
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {vm.t("apps.ipod.menu.display")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              <MenubarCheckboxItem
                checked={vm.displayMode === DisplayMode.Video}
                onCheckedChange={(checked) => {
                  if (checked) vm.setDisplayMode(DisplayMode.Video);
                }}
                className="text-md h-6 pr-3"
              >
                {vm.t("apps.ipod.menu.displayVideo")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={vm.displayMode === DisplayMode.Mesh}
                onCheckedChange={(checked) => {
                  if (checked) vm.setDisplayMode(DisplayMode.Mesh);
                }}
                className="text-md h-6 pr-3"
              >
                {vm.t("apps.ipod.menu.displayGradient")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={vm.displayMode === DisplayMode.Water}
                onCheckedChange={(checked) => {
                  if (checked) vm.setDisplayMode(DisplayMode.Water);
                }}
                className="text-md h-6 pr-3"
              >
                {vm.t("apps.ipod.menu.displayWater")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={vm.displayMode === DisplayMode.Shader}
                onCheckedChange={(checked) => {
                  if (checked) vm.setDisplayMode(DisplayMode.Shader);
                }}
                className="text-md h-6 pr-3"
              >
                {vm.t("apps.ipod.menu.displayShader")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={vm.displayMode === DisplayMode.Landscapes}
                onCheckedChange={(checked) => {
                  if (checked) vm.setDisplayMode(DisplayMode.Landscapes);
                }}
                className="text-md h-6 pr-3"
              >
                {vm.t("apps.ipod.menu.displayLandscapes")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={vm.displayMode === DisplayMode.Cover}
                onCheckedChange={(checked) => {
                  if (checked) vm.setDisplayMode(DisplayMode.Cover);
                }}
                className="text-md h-6 pr-3"
              >
                {vm.t("apps.ipod.menu.displayCover")}
              </MenubarCheckboxItem>
            </MenubarSubContent>
          </MenubarSub>

          <MenubarSeparator className="h-[2px] bg-black my-1" />

          <MenubarItem
            onClick={vm.onRefreshLyrics || vm.refreshLyrics}
            className="text-md h-6 px-3"
            disabled={vm.tracks.length === 0 || vm.currentIndex === -1}
          >
            {vm.t("apps.ipod.menu.refreshLyrics")}
          </MenubarItem>
          <MenubarItem
            onClick={vm.onAdjustTiming}
            className="text-md h-6 px-3"
            disabled={vm.tracks.length === 0 || vm.currentIndex === -1}
          >
            {vm.t("apps.ipod.menu.adjustTiming")}
          </MenubarItem>

          {(vm.debugMode || vm.isAdmin) && (
            <MenubarItem
              onClick={() => {
                vm.clearLyricsCache();
                toast.success(vm.t("apps.ipod.menu.cacheCleared"));
              }}
              className="text-md h-6 px-3"
              disabled={vm.tracks.length === 0 || vm.currentIndex === -1}
            >
              {vm.t("apps.ipod.menu.clearCache")}
            </MenubarItem>
          )}

          <MenubarSeparator className="h-[2px] bg-black my-1" />

          <MenubarItem
            onClick={vm.onToggleCoverFlow}
            className="text-md h-6 px-3"
            disabled={vm.tracks.length === 0}
          >
            {vm.t("apps.ipod.menu.coverFlow")}
          </MenubarItem>
          <MenubarItem
            onClick={vm.onToggleFullScreen}
            className="text-md h-6 px-3"
          >
            {vm.t("apps.ipod.menu.fullScreen")}
          </MenubarItem>
        </MenubarContent>
    </MenubarMenu>
  );
}
