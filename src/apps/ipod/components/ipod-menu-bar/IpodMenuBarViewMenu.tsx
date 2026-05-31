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
import { LyricsAlignment, DisplayMode, LyricsFont } from "@/types/lyrics";
import type { IpodMenuBarViewModel } from "./useIpodMenuBar";

export function IpodMenuBarViewMenu({ vm }: { vm: IpodMenuBarViewModel }) {

  return (
    <>
      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {vm.t("apps.ipod.menu.view")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {vm.t("apps.ipod.menu.lyrics")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              <MenubarCheckboxItem
                checked={vm.showLyrics}
                onCheckedChange={() => vm.toggleLyrics()}
                className="text-md h-6 px-3"
              >
                {vm.t("apps.ipod.menu.showLyrics")}
              </MenubarCheckboxItem>

              <MenubarSeparator className="h-[2px] bg-black my-1" />
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

              <MenubarRadioGroup
                value={vm.lyricsFont}
                onValueChange={(v) => vm.setLyricsFont(v as LyricsFont)}
              >
                <MenubarRadioItem
                  value={LyricsFont.Rounded}
                  className="text-md h-6 pr-3"
                >
                  {vm.t("apps.ipod.menu.fontRounded")}
                </MenubarRadioItem>
                <MenubarRadioItem
                  value={LyricsFont.Serif}
                  className="text-md h-6 pr-3"
                >
                  {vm.t("apps.ipod.menu.fontSerif")}
                </MenubarRadioItem>
                <MenubarRadioItem
                  value={LyricsFont.SansSerif}
                  className="text-md h-6 pr-3"
                >
                  {vm.t("apps.ipod.menu.fontSansSerif")}
                </MenubarRadioItem>
                <MenubarRadioItem
                  value={LyricsFont.SerifRed}
                  className="text-md h-6 pr-3"
                >
                  {vm.t("apps.ipod.menu.fontSerifRed")}
                </MenubarRadioItem>
                <MenubarRadioItem
                  value={LyricsFont.GoldGlow}
                  className="text-md h-6 pr-3"
                >
                  {vm.t("apps.ipod.menu.fontGoldGlow")}
                </MenubarRadioItem>
                <MenubarRadioItem
                  value={LyricsFont.Gradient}
                  className="text-md h-6 pr-3"
                >
                  {vm.t("apps.ipod.menu.fontGradient")}
                </MenubarRadioItem>
              </MenubarRadioGroup>

            </MenubarSubContent>
          </MenubarSub>
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
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {vm.t("apps.ipod.menu.display")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              {!vm.isAppleMusic && (
                <MenubarCheckboxItem
                  checked={vm.effectiveDisplayMode === DisplayMode.Video}
                  onCheckedChange={(checked) => {
                    if (checked) vm.setDisplayMode(DisplayMode.Video);
                  }}
                  className="text-md h-6 pr-3"
                >
                  {vm.t("apps.ipod.menu.displayVideo")}
                </MenubarCheckboxItem>
              )}
              <MenubarCheckboxItem
                checked={vm.effectiveDisplayMode === DisplayMode.Mesh}
                onCheckedChange={(checked) => {
                  if (checked) vm.setDisplayMode(DisplayMode.Mesh);
                }}
                className="text-md h-6 pr-3"
              >
                {vm.t("apps.ipod.menu.displayGradient")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={vm.effectiveDisplayMode === DisplayMode.Water}
                onCheckedChange={(checked) => {
                  if (checked) vm.setDisplayMode(DisplayMode.Water);
                }}
                className="text-md h-6 pr-3"
              >
                {vm.t("apps.ipod.menu.displayWater")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={vm.effectiveDisplayMode === DisplayMode.Shader}
                onCheckedChange={(checked) => {
                  if (checked) vm.setDisplayMode(DisplayMode.Shader);
                }}
                className="text-md h-6 pr-3"
              >
                {vm.t("apps.ipod.menu.displayShader")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={vm.effectiveDisplayMode === DisplayMode.Landscapes}
                onCheckedChange={(checked) => {
                  if (checked) vm.setDisplayMode(DisplayMode.Landscapes);
                }}
                className="text-md h-6 pr-3"
              >
                {vm.t("apps.ipod.menu.displayLandscapes")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={vm.effectiveDisplayMode === DisplayMode.Cover}
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
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {vm.t("apps.ipod.menu.backlight")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              <MenubarRadioGroup
                value={vm.backlightTimeout}
                onValueChange={(value) => {
                  const timeout = value as "2s" | "10s" | "always-on" | "off";
                  vm.setBacklightTimeout(timeout);
                  if (timeout === "off" && vm.isBacklightOn) {
                    vm.toggleBacklight();
                  } else if (
                    (timeout === "2s" || timeout === "10s" || timeout === "always-on") &&
                    !vm.isBacklightOn
                  ) {
                    vm.toggleBacklight();
                  }
                }}
              >
                <MenubarRadioItem value="2s" className="text-md h-6 pr-3">
                  2s
                </MenubarRadioItem>
                <MenubarRadioItem value="10s" className="text-md h-6 pr-3">
                  10s
                </MenubarRadioItem>
                <MenubarRadioItem value="always-on" className="text-md h-6 pr-3">
                  {vm.t("apps.ipod.menuItems.alwaysOn", "Keep On")}
                </MenubarRadioItem>
                <MenubarRadioItem value="off" className="text-md h-6 pr-3">
                  {vm.t("apps.ipod.menuItems.off")}
                </MenubarRadioItem>
              </MenubarRadioGroup>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {vm.t("apps.ipod.menu.uiTheme")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              <MenubarRadioGroup
                value={vm.uiVariant}
                onValueChange={(value) =>
                  vm.setUiVariant(value as "classic" | "modern")
                }
              >
                <MenubarRadioItem value="classic" className="text-md h-6 pr-3">
                  {vm.t("apps.ipod.menu.screenClassic")}
                </MenubarRadioItem>
                <MenubarRadioItem value="modern" className="text-md h-6 pr-3">
                  {vm.t("apps.ipod.menu.screenModern")}
                </MenubarRadioItem>
              </MenubarRadioGroup>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {vm.t("apps.ipod.menu.deviceTheme")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              <MenubarRadioGroup
                value={vm.currentTheme}
                onValueChange={(value) =>
                  vm.setTheme(value as "classic" | "black" | "u2")
                }
              >
                <MenubarRadioItem value="classic" className="text-md h-6 pr-3">
                  {vm.t("apps.ipod.menu.classic")}
                </MenubarRadioItem>
                <MenubarRadioItem value="black" className="text-md h-6 pr-3">
                  {vm.t("apps.ipod.menu.black")}
                </MenubarRadioItem>
                <MenubarRadioItem value="u2" className="text-md h-6 pr-3">
                  {vm.t("apps.ipod.menu.u2")}
                </MenubarRadioItem>
              </MenubarRadioGroup>
            </MenubarSubContent>
          </MenubarSub>

          <MenubarSeparator className="h-[2px] bg-black my-1" />

          <MenubarItem
            onClick={() => vm.onToggleCoverFlow?.()}
            className="text-md h-6 px-3"
            disabled={vm.tracks.length === 0}
          >
            {vm.t("apps.ipod.menu.coverFlow")}
          </MenubarItem>
          <MenubarItem
            onClick={() => vm.toggleFullScreen()}
            className="text-md h-6 px-3"
          >
            {vm.t("apps.ipod.menu.fullScreen")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </>
  );
}
