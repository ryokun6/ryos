import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { LyricsAlignment, RomanizationSettings } from "@/types/lyrics";
import { LyricsFont, getLyricsFontClassName } from "@/types/lyrics";
import { getTranslationBadge } from "@/apps/ipod/constants";
import { Globe, Maximize2, X, Clock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useThemeStore } from "@/stores/useThemeStore";

// Aqua-style shine overlays for macOS X theme (dark glass style)
function AquaShineOverlays({ variant }: { variant: "compact" | "responsive" }) {
  return (
    <>
      {/* Top shine */}
      <div
        className="pointer-events-none absolute left-1/2 -translate-x-1/2"
        style={{
          top: "2px",
          height: "35%",
          width: variant === "compact" ? "calc(100% - 24px)" : "calc(100% - 28px)",
          borderRadius: "100px",
          background: "linear-gradient(rgba(255,255,255,0.06), rgba(255,255,255,0.01))",
          filter: "blur(0.5px)",
          zIndex: 2,
        }}
      />
    </>
  );
}

export interface TranslationLanguageOption {
  label: string;
  code: string | null;
  separator?: boolean;
}

export interface FullscreenPlayerControlsProps {
  // Playback state
  isPlaying: boolean;

  // Transport controls
  onPrevious: () => void;
  onPlayPause: () => void;
  onNext: () => void;

  // Sync mode (lyrics timing)
  onSyncMode?: () => void;

  // Lyrics alignment
  currentAlignment: LyricsAlignment;
  onAlignmentCycle: () => void;

  // Font style
  currentFont: LyricsFont;
  onFontCycle: () => void;

  // Romanization/Pronunciation settings
  romanization?: RomanizationSettings;
  onRomanizationChange?: (settings: Partial<RomanizationSettings>) => void;
  isPronunciationMenuOpen?: boolean;
  setIsPronunciationMenuOpen?: (open: boolean) => void;

  // Translation
  currentTranslationCode: string | null;
  onTranslationSelect: (code: string | null) => void;
  translationLanguages: TranslationLanguageOption[];
  isLangMenuOpen: boolean;
  setIsLangMenuOpen: (open: boolean) => void;

  // Optional close button (for fullscreen mode)
  onClose?: () => void;

  // Optional fullscreen button (for non-fullscreen mode)
  onFullscreen?: () => void;

  // Styling variants
  variant?: "compact" | "responsive";
  bgOpacity?: "35" | "60";

  // Activity callback (for auto-hide timers)
  onInteraction?: () => void;

  // Portal container for fullscreen mode (dropdown menus need to render inside the fullscreen element)
  portalContainer?: HTMLElement | null;
}

export function FullscreenPlayerControls({
  isPlaying,
  onPrevious,
  onPlayPause,
  onNext,
  onSyncMode,
  currentAlignment,
  onAlignmentCycle,
  currentFont,
  onFontCycle,
  romanization,
  onRomanizationChange,
  isPronunciationMenuOpen = false,
  setIsPronunciationMenuOpen,
  currentTranslationCode,
  onTranslationSelect,
  translationLanguages,
  isLangMenuOpen,
  setIsLangMenuOpen,
  onClose,
  onFullscreen,
  variant = "responsive",
  bgOpacity = "35",
  onInteraction,
  portalContainer,
}: FullscreenPlayerControlsProps) {
  const { t, i18n } = useTranslation();
  const currentTheme = useThemeStore((s) => s.current);
  const isMacTheme = currentTheme === "macosx";

  const translationBadge = getTranslationBadge(currentTranslationCode);

  // Get pronunciation button glyph based on active romanization setting
  const getPronunciationGlyph = () => {
    if (!romanization?.enabled) return "漢";
    // Priority: soramimi > romaji > korean > furigana > pinyin
    if (romanization.soramimi && romanization.soramamiTargetLanguage === "zh-TW") return "空";
    if (romanization.soramimi && romanization.soramamiTargetLanguage === "en") return "Mi";
    if (romanization.japaneseRomaji) return "Ro";
    if (romanization.korean) return "Ko";
    if (romanization.japaneseFurigana) return "ふ";
    if (romanization.chinese) return "拼";
    return "漢";
  };

  // Get font label based on current locale
  const getFontLabel = () => {
    const lang = i18n.language;
    if (lang === "ja") return "あ";
    if (lang === "ko") return "가";
    if (lang === "zh-TW") return "字";
    return "Aa";
  };

  // Button size classes based on variant
  const buttonSize =
    variant === "compact"
      ? "w-8 h-8"
      : "w-9 h-9 md:w-12 md:h-12";

  const iconSize =
    variant === "compact"
      ? "text-base"
      : "text-[18px] md:text-[22px]";

  const smallIconSize =
    variant === "compact"
      ? "text-sm"
      : "text-[16px] md:text-[18px]";

  const svgSize = variant === "compact" ? 14 : 18;
  const svgSizeMd = variant === "compact" ? 14 : 22;

  const handleClick = (handler: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onInteraction?.();
    handler();
  };

  // Common styles for each island segment
  const segmentClasses = isMacTheme
    ? "relative overflow-hidden rounded-full shadow-lg flex items-center gap-1 px-1 py-1 font-geneva-12"
    : cn(
        "border border-white/10 backdrop-blur-sm rounded-full shadow-lg flex items-center gap-1 px-1 py-1 font-geneva-12",
        variant === "responsive" && "md:gap-2",
        bgOpacity === "35" ? "bg-neutral-800/35" : "bg-neutral-800/60"
      );

  // Aqua segment inline styles
  const aquaSegmentStyle: React.CSSProperties = isMacTheme
    ? {
        background: "linear-gradient(to bottom, rgba(60, 60, 60, 0.6), rgba(30, 30, 30, 0.5))",
        boxShadow:
          "0 2px 4px rgba(0, 0, 0, 0.2), inset 0 0 0 0.5px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
      }
    : {};

  // Button classes for individual buttons
  const buttonClasses = isMacTheme
    ? cn(
        buttonSize,
        "flex items-center justify-center rounded-full transition-colors focus:outline-none relative z-10"
      )
    : cn(
        buttonSize,
        "flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
      );

  // Icon classes for macOS theme (white with dark shadow)
  const iconClasses = isMacTheme
    ? "text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
    : "";

  const svgClasses = (baseClass?: string) =>
    cn(baseClass, isMacTheme && "text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]");

  return (
    <div className={cn(
      "relative ipod-force-font flex items-center",
      variant === "compact" ? "gap-2" : "gap-2 md:gap-3"
    )}>
      {/* Playback controls island */}
      <div className={segmentClasses} style={aquaSegmentStyle}>
        {isMacTheme && <AquaShineOverlays variant={variant} />}
        {/* Previous */}
        <button
          type="button"
          onClick={handleClick(onPrevious)}
          aria-label={t("apps.ipod.ariaLabels.previousTrack")}
          className={buttonClasses}
          title={t("apps.ipod.menu.previous")}
        >
          <span className={cn(iconSize, iconClasses)}>⏮</span>
        </button>

        {/* Play/Pause */}
        <button
          type="button"
          onClick={handleClick(onPlayPause)}
          aria-label={t("apps.ipod.ariaLabels.playPause")}
          className={buttonClasses}
          title={t("apps.ipod.ariaLabels.playPause")}
        >
          <span className={cn(iconSize, iconClasses)}>{isPlaying ? "⏸" : "▶"}</span>
        </button>

        {/* Next */}
        <button
          type="button"
          onClick={handleClick(onNext)}
          aria-label={t("apps.ipod.ariaLabels.nextTrack")}
          className={buttonClasses}
          title={t("apps.ipod.menu.next")}
        >
          <span className={cn(iconSize, iconClasses)}>⏭</span>
        </button>
      </div>

      {/* Lyrics controls island */}
      <div className={segmentClasses} style={aquaSegmentStyle}>
        {isMacTheme && <AquaShineOverlays variant={variant} />}
        {/* Sync mode (lyrics timing) */}
        {onSyncMode && (
          <button
            type="button"
            onClick={handleClick(onSyncMode)}
            aria-label={t("apps.ipod.syncMode.title", "Sync Lyrics")}
            className={buttonClasses}
            title={t("apps.ipod.syncMode.title", "Sync Lyrics")}
          >
            <Clock className={cn(variant === "compact" ? "w-3.5 h-3.5" : "w-4 h-4", svgClasses())} />
          </button>
        )}

        {/* Layout alignment */}
        <button
          type="button"
          onClick={handleClick(onAlignmentCycle)}
          aria-label={t("apps.ipod.ariaLabels.cycleLyricLayout")}
          className={buttonClasses}
          title={t("apps.ipod.ariaLabels.cycleLyricLayout")}
        >
          {currentAlignment === "focusThree" ? (
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              width={svgSize}
              height={svgSize}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={svgClasses(variant === "responsive" ? `md:w-[${svgSizeMd}px] md:h-[${svgSizeMd}px]` : undefined)}
            >
              <line x1="6" y1="6" x2="18" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="6" y1="18" x2="18" y2="18" />
            </svg>
          ) : currentAlignment === "center" ? (
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              width={svgSize}
              height={svgSize}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={svgClasses(variant === "responsive" ? `md:w-[${svgSizeMd}px] md:h-[${svgSizeMd}px]` : undefined)}
            >
              <line x1="6" y1="12" x2="18" y2="12" />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              width={svgSize}
              height={svgSize}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={svgClasses(variant === "responsive" ? `md:w-[${svgSizeMd}px] md:h-[${svgSizeMd}px]` : undefined)}
            >
              <line x1="4" y1="8" x2="13" y2="8" />
              <line x1="11" y1="16" x2="20" y2="16" />
            </svg>
          )}
        </button>

        {/* Font style */}
        <button
          type="button"
          onClick={handleClick(onFontCycle)}
          aria-label={t("apps.ipod.ariaLabels.cycleLyricFont")}
          className={buttonClasses}
          title={t("apps.ipod.ariaLabels.cycleLyricFont")}
        >
          <span className={cn(
            smallIconSize,
            getLyricsFontClassName(currentFont),
            iconClasses
          )}>
            {getFontLabel()}
          </span>
        </button>

        {/* Translation */}
        <DropdownMenu open={isLangMenuOpen} onOpenChange={(open) => {
          setIsLangMenuOpen(open);
          if (open && setIsPronunciationMenuOpen) setIsPronunciationMenuOpen(false);
        }}>
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
                <Globe
                  size={svgSize}
                  className={svgClasses(variant === "responsive" ? `md:w-[${svgSizeMd}px] md:h-[${svgSizeMd}px]` : undefined)}
                />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            container={portalContainer}
            side="top"
            align="center"
            sideOffset={8}
            className={cn(
              "px-0 max-h-[50vh] overflow-y-auto",
              variant === "compact" ? "w-40" : "w-44"
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
                    return <DropdownMenuSeparator key={`sep-${index}`} />;
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

        {/* Pronunciation menu */}
        {romanization && onRomanizationChange && setIsPronunciationMenuOpen && (
          <DropdownMenu open={isPronunciationMenuOpen} onOpenChange={(open) => {
            setIsPronunciationMenuOpen(open);
            if (open) setIsLangMenuOpen(false);
          }}>
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
                <span className={cn(smallIconSize, iconClasses)}>{getPronunciationGlyph()}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              container={portalContainer}
              side="top"
              align="center"
              sideOffset={8}
              className="px-0 w-max min-w-40 max-w-none"
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
                    // Romaji requires furigana
                    onRomanizationChange({ 
                      japaneseRomaji: checked, 
                      japaneseFurigana: checked || romanization.japaneseFurigana 
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
                  checked={romanization.soramimi && romanization.soramamiTargetLanguage === "zh-TW"}
                  onCheckedChange={(checked) => {
                    onRomanizationChange({ soramimi: checked, soramamiTargetLanguage: "zh-TW" });
                    onInteraction?.();
                  }}
                  disabled={!romanization.enabled}
                  className="text-md h-6 px-3 whitespace-nowrap"
                >
                  {t("apps.ipod.menu.chineseSoramimi")}
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={romanization.soramimi && romanization.soramamiTargetLanguage === "en"}
                  onCheckedChange={(checked) => {
                    onRomanizationChange({ soramimi: checked, soramamiTargetLanguage: "en" });
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

      {/* Close/Expand island */}
      {(onFullscreen || onClose) && (
        <div className={segmentClasses} style={aquaSegmentStyle}>
          {isMacTheme && <AquaShineOverlays variant={variant} />}
          {/* Fullscreen button (for non-fullscreen mode) */}
          {onFullscreen && (
            <button
              type="button"
              onClick={handleClick(onFullscreen)}
              className={buttonClasses}
              aria-label={t("apps.ipod.ariaLabels.enterFullscreen")}
              title={t("apps.ipod.ariaLabels.enterFullscreen")}
            >
              <Maximize2
                size={svgSize}
                className={svgClasses(variant === "responsive" ? `md:w-[${svgSizeMd}px] md:h-[${svgSizeMd}px]` : undefined)}
              />
            </button>
          )}

          {/* Close button (for fullscreen mode) */}
          {onClose && (
            <button
              type="button"
              onClick={handleClick(onClose)}
              className={buttonClasses}
              aria-label={t("apps.ipod.ariaLabels.closeFullscreen")}
              title={t("common.dialog.close")}
            >
              <X
                size={svgSize}
                className={svgClasses(variant === "responsive" ? `md:w-[${svgSizeMd}px] md:h-[${svgSizeMd}px]` : undefined)}
              />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
