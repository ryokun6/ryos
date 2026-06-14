import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getTranslationBadge } from "@/utils/lyricsTranslation";
import type { LyricsAlignment, RomanizationSettings } from "@/types/lyrics";
import { getLyricsFontClassName, LyricsFont } from "@/types/lyrics";
import {
  ClockClockwise,
  HandsClapping,
  Translate,
} from "@phosphor-icons/react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AquaShineOverlays } from "./AquaShineOverlays";
import { LyricsAlignmentIcon } from "./LyricsAlignmentIcon";
import { getFontLabel, getPronunciationGlyph } from "./utils";
import type {
  FullscreenControlClickHandler,
  FullscreenControlStyles,
  TranslationLanguageOption,
} from "./types";

interface LyricsControlsIslandProps {
  onSyncMode?: () => void;
  currentAlignment: LyricsAlignment;
  onAlignmentCycle: () => void;
  currentFont: LyricsFont;
  onFontCycle: () => void;
  romanization?: RomanizationSettings;
  onRomanizationChange?: (settings: Partial<RomanizationSettings>) => void;
  isPronunciationMenuOpen: boolean;
  setIsPronunciationMenuOpen?: (open: boolean) => void;
  currentTranslationCode: string | null;
  onTranslationSelect: (code: string | null) => void;
  translationLanguages: TranslationLanguageOption[];
  isLangMenuOpen: boolean;
  setIsLangMenuOpen: (open: boolean) => void;
  portalContainer?: HTMLElement | null;
  karaokeKtvRoomFxEnabled?: boolean;
  onToggleKaraokeKtvRoomFx?: () => void;
  onInteraction?: () => void;
  styles: FullscreenControlStyles;
  handleClick: FullscreenControlClickHandler;
}

export function LyricsControlsIsland({
  onSyncMode,
  currentAlignment,
  onAlignmentCycle,
  currentFont,
  onFontCycle,
  romanization,
  onRomanizationChange,
  isPronunciationMenuOpen,
  setIsPronunciationMenuOpen,
  currentTranslationCode,
  onTranslationSelect,
  translationLanguages,
  isLangMenuOpen,
  setIsLangMenuOpen,
  portalContainer,
  karaokeKtvRoomFxEnabled,
  onToggleKaraokeKtvRoomFx,
  onInteraction,
  styles,
  handleClick,
}: LyricsControlsIslandProps) {
  const { t, i18n } = useTranslation();
  const {
    segmentClasses,
    aquaSegmentStyle,
    buttonClasses,
    iconClasses,
    svgClasses,
    smallIconSize,
    svgSize,
    svgSizeMd,
    variant,
    isMacTheme,
  } = styles;

  const translationBadge = getTranslationBadge(currentTranslationCode);
  const responsiveSvgClass =
    variant === "responsive"
      ? `md:w-[${svgSizeMd}px] md:h-[${svgSizeMd}px]`
      : undefined;

  return (
    <div className={segmentClasses} style={aquaSegmentStyle}>
      {isMacTheme && <AquaShineOverlays variant={variant} />}
      {onSyncMode && (
        <button
          type="button"
          onClick={handleClick(onSyncMode)}
          aria-label={t("apps.ipod.syncMode.title", "Sync Lyrics")}
          className={buttonClasses}
          title={t("apps.ipod.syncMode.title", "Sync Lyrics")}
        >
          <ClockClockwise
            weight="fill"
            className={cn(
              variant === "compact" ? "w-3.5 h-3.5" : "w-4 h-4",
              svgClasses()
            )}
          />
        </button>
      )}

      {karaokeKtvRoomFxEnabled !== undefined && onToggleKaraokeKtvRoomFx && (
        <button
          type="button"
          onClick={handleClick(onToggleKaraokeKtvRoomFx)}
          aria-pressed={karaokeKtvRoomFxEnabled}
          aria-label={t("apps.karaoke.ktvRoomFx")}
          className={cn(
            buttonClasses,
            !karaokeKtvRoomFxEnabled && "opacity-[0.42]"
          )}
          title={t("apps.karaoke.ktvRoomFxHint")}
        >
          <HandsClapping
            weight={karaokeKtvRoomFxEnabled ? "fill" : "regular"}
            className={cn(
              variant === "compact" ? "w-3.5 h-3.5" : "w-4 h-4",
              svgClasses()
            )}
          />
        </button>
      )}

      <button
        type="button"
        onClick={handleClick(onAlignmentCycle)}
        aria-label={t("apps.ipod.ariaLabels.cycleLyricLayout")}
        className={buttonClasses}
        title={t("apps.ipod.ariaLabels.cycleLyricLayout")}
      >
        <LyricsAlignmentIcon alignment={currentAlignment} styles={styles} />
      </button>

      <button
        type="button"
        onClick={handleClick(onFontCycle)}
        aria-label={t("apps.ipod.ariaLabels.cycleLyricFont")}
        className={buttonClasses}
        title={t("apps.ipod.ariaLabels.cycleLyricFont")}
      >
        <span
          className={cn(
            smallIconSize,
            getLyricsFontClassName(currentFont),
            iconClasses
          )}
        >
          {getFontLabel(i18n.language)}
        </span>
      </button>

      <DropdownMenu
        open={isLangMenuOpen}
        onOpenChange={(open) => {
          setIsLangMenuOpen(open);
          if (open && setIsPronunciationMenuOpen) setIsPronunciationMenuOpen(false);
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onInteraction?.();
            }}
            aria-label={t("apps.ipod.ariaLabels.translateLyrics")}
            className={buttonClasses}
            title={t("apps.ipod.ariaLabels.translateLyrics")}
          >
            {translationBadge ? (
              <span
                className={cn(
                  "inline-flex items-center justify-center leading-none",
                  variant === "compact"
                    ? "w-[20px] h-[20px] text-sm"
                    : "w-[24px] h-[24px] md:w-[28px] md:h-[28px] text-[16px] md:text-[18px]",
                  iconClasses
                )}
              >
                {translationBadge}
              </span>
            ) : (
              <Translate
                weight="bold"
                size={svgSize}
                className={svgClasses(responsiveSvgClass)}
              />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          container={portalContainer}
          side="top"
          align={variant === "compact" ? "end" : "center"}
          alignOffset={
            variant === "compact"
              ? ({ positioner }) => -positioner.width
              : undefined
          }
          sideOffset={8}
          collisionAvoidance={{
            side: "shift",
            align: "shift",
            fallbackAxisSide: "none",
          }}
          collisionBoundary={portalContainer ?? undefined}
          collisionPadding={8}
          className={cn(
            "px-0 max-h-[50vh] overflow-y-auto",
            variant === "compact"
              ? "w-40 max-w-[calc(100vw-1rem)]"
              : "w-44"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenuRadioGroup
            value={currentTranslationCode || "off"}
            onValueChange={(value) => {
              onTranslationSelect(value === "off" ? null : value);
              onInteraction?.();
            }}
          >
            {translationLanguages.map((lang, index) => {
              if (lang.separator) {
                const prevCode =
                  translationLanguages[index - 1]?.code || "start";
                const nextCode = translationLanguages[index + 1]?.code || "end";
                return (
                  <DropdownMenuSeparator
                    key={`sep-${prevCode}-${nextCode}`}
                  />
                );
              }
              return (
                <DropdownMenuRadioItem
                  key={lang.code || "off"}
                  value={lang.code || "off"}
                  className="text-md h-6 pr-3"
                >
                  {lang.label}
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {romanization &&
        onRomanizationChange &&
        setIsPronunciationMenuOpen && (
          <DropdownMenu
            open={isPronunciationMenuOpen}
            onOpenChange={(open) => {
              setIsPronunciationMenuOpen(open);
              if (open) setIsLangMenuOpen(false);
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onInteraction?.();
                }}
                aria-label={t("apps.ipod.menu.pronunciation")}
                className={buttonClasses}
                title={t("apps.ipod.menu.pronunciation")}
              >
                <span className={cn(smallIconSize, iconClasses)}>
                  {getPronunciationGlyph(romanization)}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              container={portalContainer}
              side="top"
              align={variant === "compact" ? "end" : "center"}
              alignOffset={
                variant === "compact"
                  ? ({ positioner }) => -positioner.width
                  : undefined
              }
              sideOffset={8}
              collisionAvoidance={{
                side: "shift",
                align: "shift",
                fallbackAxisSide: "none",
              }}
              collisionBoundary={portalContainer ?? undefined}
              collisionPadding={8}
              className={cn(
                "px-0",
                variant === "compact"
                  ? "w-44 max-w-[calc(100vw-1rem)]"
                  : "w-max min-w-40 max-w-none"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuCheckboxItem
                checked={romanization.enabled}
                onCheckedChange={(checked) => {
                  onRomanizationChange({ enabled: checked });
                  onInteraction?.();
                }}
                className="text-md h-6 px-3 whitespace-nowrap"
              >
                {t("apps.ipod.menu.pronunciation")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={romanization.pronunciationOnly ?? false}
                onCheckedChange={(checked) => {
                  onRomanizationChange({ pronunciationOnly: checked });
                  onInteraction?.();
                }}
                disabled={!romanization.enabled}
                className="text-md h-6 px-3 whitespace-nowrap"
              >
                {t("apps.ipod.menu.pronunciationOnly")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={romanization.japaneseFurigana}
                onCheckedChange={(checked) => {
                  onRomanizationChange({ japaneseFurigana: checked });
                  onInteraction?.();
                }}
                disabled={!romanization.enabled || romanization.japaneseRomaji}
                className="text-md h-6 px-3 whitespace-nowrap"
              >
                {t("apps.ipod.menu.japaneseFurigana")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={romanization.japaneseRomaji}
                onCheckedChange={(checked) => {
                  onRomanizationChange({
                    japaneseRomaji: checked,
                    japaneseFurigana:
                      checked || romanization.japaneseFurigana,
                  });
                  onInteraction?.();
                }}
                disabled={!romanization.enabled}
                className="text-md h-6 px-3 whitespace-nowrap"
              >
                {t("apps.ipod.menu.japaneseRomaji")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={romanization.korean}
                onCheckedChange={(checked) => {
                  onRomanizationChange({ korean: checked });
                  onInteraction?.();
                }}
                disabled={!romanization.enabled}
                className="text-md h-6 px-3 whitespace-nowrap"
              >
                {t("apps.ipod.menu.koreanRomanization")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={romanization.chinese}
                onCheckedChange={(checked) => {
                  onRomanizationChange({ chinese: checked });
                  onInteraction?.();
                }}
                disabled={!romanization.enabled}
                className="text-md h-6 px-3 whitespace-nowrap"
              >
                {t("apps.ipod.menu.chinesePinyin")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={
                  romanization.soramimi &&
                  romanization.soramamiTargetLanguage === "zh-TW"
                }
                onCheckedChange={(checked) => {
                  onRomanizationChange({
                    soramimi: checked,
                    soramamiTargetLanguage: "zh-TW",
                  });
                  onInteraction?.();
                }}
                disabled={!romanization.enabled}
                className="text-md h-6 px-3 whitespace-nowrap"
              >
                {t("apps.ipod.menu.chineseSoramimi")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={
                  romanization.soramimi &&
                  romanization.soramamiTargetLanguage === "en"
                }
                onCheckedChange={(checked) => {
                  onRomanizationChange({
                    soramimi: checked,
                    soramamiTargetLanguage: "en",
                  });
                  onInteraction?.();
                }}
                disabled={!romanization.enabled}
                className="text-md h-6 px-3 whitespace-nowrap"
              >
                {t("apps.ipod.menu.soramimi")}
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
    </div>
  );
}
