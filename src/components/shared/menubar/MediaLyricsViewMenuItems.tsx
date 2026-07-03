import {
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
import { LyricsPronunciationSubmenu } from "@/components/shared/menubar/lyrics/LyricsPronunciationSubmenu";
import { LyricsTranslationLanguageSubmenu } from "@/components/shared/menubar/lyrics/LyricsTranslationLanguageSubmenu";
import { MENUBAR_SEPARATOR_CLASS } from "@/components/shared/menubar/menubarStyles";
import { toast } from "sonner";
import {
  DisplayMode,
  LyricsFont,
  type LyricsAlignment,
  type RomanizationSettings,
} from "@/types/lyrics";
import type { TranslatedLyricsLanguage } from "@/hooks/useTranslatedLyricsLanguages";
import type { TFunction } from "i18next";

export type MediaLyricsViewMenuItemsProps = {
  t: TFunction;
  /** Label for the "Show Lyrics" toggle (iPod and Karaoke use different keys). */
  showLyricsLabel: string;
  showLyrics: boolean;
  onToggleLyrics: () => void;
  lyricsAlignment: LyricsAlignment;
  setLyricsAlignment: (alignment: LyricsAlignment) => void;
  lyricsFont: LyricsFont;
  setLyricsFont: (font: LyricsFont) => void;
  romanization: RomanizationSettings | undefined;
  setRomanization: (patch: Partial<RomanizationSettings>) => void;
  lyricsTranslationLanguage: string | null;
  setLyricsTranslationLanguage: (code: string | null) => void;
  translationLanguages: TranslatedLyricsLanguage[];
  displayMode: DisplayMode;
  setDisplayMode: (mode: DisplayMode) => void;
  /** When true, omit the Video display option (iPod Apple Music behavior). */
  hideVideoOption?: boolean;
  onRefreshLyrics: () => void;
  onAdjustTiming?: () => void;
  clearLyricsCache: () => void;
  tracks: { length: number };
  currentIndex: number;
  debugMode: boolean;
  isAdmin: boolean;
};

export function MediaLyricsViewMenuItems({
  t,
  showLyricsLabel,
  showLyrics,
  onToggleLyrics,
  lyricsAlignment,
  setLyricsAlignment,
  lyricsFont,
  setLyricsFont,
  romanization,
  setRomanization,
  lyricsTranslationLanguage,
  setLyricsTranslationLanguage,
  translationLanguages,
  displayMode,
  setDisplayMode,
  hideVideoOption,
  onRefreshLyrics,
  onAdjustTiming,
  clearLyricsCache,
  tracks,
  currentIndex,
  debugMode,
  isAdmin,
}: MediaLyricsViewMenuItemsProps) {
  const lyricsDisabled = tracks.length === 0 || currentIndex === -1;

  return (
    <>
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
            {showLyricsLabel}
          </MenubarCheckboxItem>

          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />

          <LyricsAlignmentMenuItems
            lyricsAlignment={lyricsAlignment}
            setLyricsAlignment={setLyricsAlignment}
            multiLabel={t("apps.ipod.menu.multi")}
            singleLabel={t("apps.ipod.menu.single")}
            alternatingLabel={t("apps.ipod.menu.alternating")}
          />

          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />

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

      <LyricsTranslationLanguageSubmenu
        submenuLabel={t("apps.ipod.menu.translate")}
        translationLanguages={translationLanguages}
        lyricsTranslationLanguage={lyricsTranslationLanguage}
        setLyricsTranslationLanguage={setLyricsTranslationLanguage}
      />

      <LyricsPronunciationSubmenu
        submenuLabel={t("apps.ipod.menu.pronunciation")}
        pronunciationLabel={t("apps.ipod.menu.pronunciation")}
        pronunciationOnlyLabel={t("apps.ipod.menu.pronunciationOnly")}
        japaneseFuriganaLabel={t("apps.ipod.menu.japaneseFurigana")}
        japaneseRomajiLabel={t("apps.ipod.menu.japaneseRomaji")}
        koreanRomanizationLabel={t("apps.ipod.menu.koreanRomanization")}
        chinesePinyinLabel={t("apps.ipod.menu.chinesePinyin")}
        automaticLabel={t("apps.ipod.translationLanguages.auto")}
        chineseTraditionalLabel={t("settings.language.chineseTraditional")}
        chineseSimplifiedLabel={t("settings.language.chineseSimplified")}
        chineseSoramimiLabel={t("apps.ipod.menu.chineseSoramimi")}
        soramimiLabel={t("apps.ipod.menu.soramimi")}
        romanization={romanization}
        setRomanization={setRomanization}
      />

      <MenubarSub>
        <MenubarSubTrigger className="text-md h-6 px-3">
          {t("apps.ipod.menu.display")}
        </MenubarSubTrigger>
        <MenubarSubContent className="px-0">
          {!hideVideoOption && (
            <MenubarCheckboxItem
              checked={displayMode === DisplayMode.Video}
              onCheckedChange={(checked) => {
                if (checked) setDisplayMode(DisplayMode.Video);
              }}
              className="text-md h-6 pr-3"
            >
              {t("apps.ipod.menu.displayVideo")}
            </MenubarCheckboxItem>
          )}
          <MenubarCheckboxItem
            checked={displayMode === DisplayMode.Mesh}
            onCheckedChange={(checked) => {
              if (checked) setDisplayMode(DisplayMode.Mesh);
            }}
            className="text-md h-6 pr-3"
          >
            {t("apps.ipod.menu.displayGradient")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={displayMode === DisplayMode.Water}
            onCheckedChange={(checked) => {
              if (checked) setDisplayMode(DisplayMode.Water);
            }}
            className="text-md h-6 pr-3"
          >
            {t("apps.ipod.menu.displayWater")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={displayMode === DisplayMode.Shader}
            onCheckedChange={(checked) => {
              if (checked) setDisplayMode(DisplayMode.Shader);
            }}
            className="text-md h-6 pr-3"
          >
            {t("apps.ipod.menu.displayShader")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={displayMode === DisplayMode.Landscapes}
            onCheckedChange={(checked) => {
              if (checked) setDisplayMode(DisplayMode.Landscapes);
            }}
            className="text-md h-6 pr-3"
          >
            {t("apps.ipod.menu.displayLandscapes")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={displayMode === DisplayMode.Cover}
            onCheckedChange={(checked) => {
              if (checked) setDisplayMode(DisplayMode.Cover);
            }}
            className="text-md h-6 pr-3"
          >
            {t("apps.ipod.menu.displayCover")}
          </MenubarCheckboxItem>
        </MenubarSubContent>
      </MenubarSub>

      <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />

      <MenubarItem
        onClick={onRefreshLyrics}
        className="text-md h-6 px-3"
        disabled={lyricsDisabled}
      >
        {t("apps.ipod.menu.refreshLyrics")}
      </MenubarItem>
      <MenubarItem
        onClick={onAdjustTiming}
        className="text-md h-6 px-3"
        disabled={lyricsDisabled}
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
          disabled={lyricsDisabled}
        >
          {t("apps.ipod.menu.clearCache")}
        </MenubarItem>
      )}
    </>
  );
}
