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
import { LyricsAlignmentMenuItems } from "@/components/shared/menubar/lyrics/LyricsAlignmentMenuItems";
import { LyricsDisplayModeSubmenu } from "@/components/shared/menubar/lyrics/LyricsDisplayModeSubmenu";
import { LyricsPronunciationSubmenu } from "@/components/shared/menubar/lyrics/LyricsPronunciationSubmenu";
import { LyricsTranslationLanguageSubmenu } from "@/components/shared/menubar/lyrics/LyricsTranslationLanguageSubmenu";
import { MENUBAR_SEPARATOR_CLASS } from "@/components/shared/menubar/menubarStyles";
import { toast } from "sonner";
import { LyricsFont } from "@/types/lyrics";
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

              <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
              <LyricsAlignmentMenuItems
                lyricsAlignment={vm.lyricsAlignment}
                setLyricsAlignment={vm.setLyricsAlignment}
                multiLabel={vm.t("apps.ipod.menu.multi")}
                singleLabel={vm.t("apps.ipod.menu.single")}
                alternatingLabel={vm.t("apps.ipod.menu.alternating")}
              />

              <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />

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
          <LyricsTranslationLanguageSubmenu
            submenuLabel={vm.t("apps.ipod.menu.translate")}
            translationLanguages={vm.translationLanguages}
            lyricsTranslationLanguage={vm.lyricsTranslationLanguage}
            setLyricsTranslationLanguage={vm.setLyricsTranslationLanguage}
          />
          <LyricsPronunciationSubmenu
            submenuLabel={vm.t("apps.ipod.menu.pronunciation")}
            pronunciationLabel={vm.t("apps.ipod.menu.pronunciation")}
            pronunciationOnlyLabel={vm.t("apps.ipod.menu.pronunciationOnly")}
            japaneseFuriganaLabel={vm.t("apps.ipod.menu.japaneseFurigana")}
            japaneseRomajiLabel={vm.t("apps.ipod.menu.japaneseRomaji")}
            koreanRomanizationLabel={vm.t("apps.ipod.menu.koreanRomanization")}
            chinesePinyinLabel={vm.t("apps.ipod.menu.chinesePinyin")}
            chineseSoramimiLabel={vm.t("apps.ipod.menu.chineseSoramimi")}
            soramimiLabel={vm.t("apps.ipod.menu.soramimi")}
            romanization={vm.romanization}
            setRomanization={vm.setRomanization}
          />
          <LyricsDisplayModeSubmenu
            submenuLabel={vm.t("apps.ipod.menu.display")}
            displayMode={vm.effectiveDisplayMode}
            setDisplayMode={vm.setDisplayMode}
            includeVideo={!vm.isAppleMusic}
            videoLabel={vm.t("apps.ipod.menu.displayVideo")}
            gradientLabel={vm.t("apps.ipod.menu.displayGradient")}
            waterLabel={vm.t("apps.ipod.menu.displayWater")}
            shaderLabel={vm.t("apps.ipod.menu.displayShader")}
            landscapesLabel={vm.t("apps.ipod.menu.displayLandscapes")}
            coverLabel={vm.t("apps.ipod.menu.displayCover")}
          />

          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />

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

          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
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

          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />

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
