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
} from "@/components/ui/menubar";
import { LyricsAlignmentMenuItems } from "@/components/shared/menubar/lyrics/LyricsAlignmentMenuItems";
import { LyricsDisplayModeSubmenu } from "@/components/shared/menubar/lyrics/LyricsDisplayModeSubmenu";
import { LyricsPronunciationSubmenu } from "@/components/shared/menubar/lyrics/LyricsPronunciationSubmenu";
import { LyricsTranslationLanguageSubmenu } from "@/components/shared/menubar/lyrics/LyricsTranslationLanguageSubmenu";
import { MENUBAR_SEPARATOR_CLASS, MENUBAR_TRIGGER_CLASS } from "@/components/shared/menubar/menubarStyles";
import { toast } from "sonner";
import { LyricsFont } from "@/types/lyrics";
import type { KaraokeMenuBarViewModel } from "./useKaraokeMenuBar";

export function KaraokeMenuBarViewMenu({ vm }: { vm: KaraokeMenuBarViewModel }) {
  return (
    <MenubarMenu>
      <MenubarTrigger className={MENUBAR_TRIGGER_CLASS}>
        {vm.t("apps.karaoke.menu.view")}
      </MenubarTrigger>
      <MenubarContent align="start" sideOffset={1} className="px-0">
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

            <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />

            <LyricsAlignmentMenuItems
              lyricsAlignment={vm.lyricsAlignment}
              setLyricsAlignment={vm.setLyricsAlignment}
              multiLabel={vm.t("apps.ipod.menu.multi")}
              singleLabel={vm.t("apps.ipod.menu.single")}
              alternatingLabel={vm.t("apps.ipod.menu.alternating")}
            />

            <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />

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
          displayMode={vm.displayMode}
          setDisplayMode={vm.setDisplayMode}
          includeVideo
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
