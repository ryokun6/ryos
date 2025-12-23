import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { LyricsAlignment, KoreanDisplay } from "@/types/lyrics";
import { LyricsFont } from "@/types/lyrics";
import { getTranslationBadge } from "@/apps/ipod/constants";
import { Maximize2, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface TranslationLanguageOption {
  label: string;
  code: string | null;
}

export interface FullscreenPlayerControlsProps {
  // Playback state
  isPlaying: boolean;

  // Transport controls
  onPrevious: () => void;
  onPlayPause: () => void;
  onNext: () => void;

  // Lyrics alignment
  currentAlignment: LyricsAlignment;
  onAlignmentCycle: () => void;

  // Font style
  currentFont: LyricsFont;
  onFontCycle: () => void;

  // Korean display
  koreanDisplay: KoreanDisplay;
  onKoreanToggle: () => void;

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
}

export function FullscreenPlayerControls({
  isPlaying,
  onPrevious,
  onPlayPause,
  onNext,
  currentAlignment,
  onAlignmentCycle,
  currentFont,
  onFontCycle,
  koreanDisplay,
  onKoreanToggle,
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
}: FullscreenPlayerControlsProps) {
  const { t } = useTranslation();

  const translationBadge = getTranslationBadge(currentTranslationCode);

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

  return (
    <div className="relative ipod-force-font">
      <div
        className={cn(
          "border border-white/10 backdrop-blur-sm rounded-full shadow-lg flex items-center gap-1 px-1 py-1 font-geneva-12",
          variant === "responsive" && "md:gap-2",
          bgOpacity === "35" ? "bg-neutral-800/35" : "bg-neutral-800/60"
        )}
      >
        {/* Previous */}
        <button
          type="button"
          onClick={handleClick(onPrevious)}
          aria-label={t("apps.ipod.ariaLabels.previousTrack")}
          className={cn(
            buttonSize,
            "flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
          )}
          title={t("apps.ipod.menu.previous")}
        >
          <span className={iconSize}>⏮</span>
        </button>

        {/* Play/Pause */}
        <button
          type="button"
          onClick={handleClick(onPlayPause)}
          aria-label={t("apps.ipod.ariaLabels.playPause")}
          className={cn(
            buttonSize,
            "flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
          )}
          title={t("apps.ipod.ariaLabels.playPause")}
        >
          <span className={iconSize}>{isPlaying ? "⏸" : "▶"}</span>
        </button>

        {/* Next */}
        <button
          type="button"
          onClick={handleClick(onNext)}
          aria-label={t("apps.ipod.ariaLabels.nextTrack")}
          className={cn(
            buttonSize,
            "flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
          )}
          title={t("apps.ipod.menu.next")}
        >
          <span className={iconSize}>⏭</span>
        </button>

        {/* Layout alignment */}
        <button
          type="button"
          onClick={handleClick(onAlignmentCycle)}
          aria-label={t("apps.ipod.ariaLabels.cycleLyricLayout")}
          className={cn(
            buttonSize,
            "flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
          )}
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
              className={variant === "responsive" ? `md:w-[${svgSizeMd}px] md:h-[${svgSizeMd}px]` : undefined}
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
              className={variant === "responsive" ? `md:w-[${svgSizeMd}px] md:h-[${svgSizeMd}px]` : undefined}
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
              className={variant === "responsive" ? `md:w-[${svgSizeMd}px] md:h-[${svgSizeMd}px]` : undefined}
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
          className={cn(
            buttonSize,
            "flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
          )}
          title={t("apps.ipod.ariaLabels.cycleLyricFont")}
        >
          <span className={smallIconSize}>
            {currentFont === LyricsFont.Rounded
              ? "丸"
              : currentFont === LyricsFont.Serif
              ? "明"
              : "ゴ"}
          </span>
        </button>

        {/* Hangul toggle */}
        <button
          type="button"
          onClick={handleClick(onKoreanToggle)}
          aria-label={t("apps.ipod.ariaLabels.toggleHangulRomanization")}
          className={cn(
            buttonSize,
            "flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
          )}
          title={t("apps.ipod.ariaLabels.toggleHangulRomanization")}
        >
          <span className={smallIconSize}>
            {koreanDisplay === "romanized" ? "Ko" : "한"}
          </span>
        </button>

        {/* Translation */}
        <DropdownMenu open={isLangMenuOpen} onOpenChange={setIsLangMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onInteraction?.();
              }}
              aria-label={t("apps.ipod.ariaLabels.translateLyrics")}
              className={cn(
                buttonSize,
                "flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
              )}
              title={t("apps.ipod.ariaLabels.translateLyrics")}
            >
              {translationBadge ? (
                <span
                  className={cn(
                    "inline-flex items-center justify-center leading-none",
                    variant === "compact"
                      ? "w-[20px] h-[20px] text-sm"
                      : "w-[24px] h-[24px] md:w-[28px] md:h-[28px] text-[16px] md:text-[18px]"
                  )}
                >
                  {translationBadge}
                </span>
              ) : (
                <span
                  className={cn(
                    "inline-flex items-center justify-center leading-none",
                    variant === "compact"
                      ? "w-[20px] h-[20px] text-sm"
                      : "w-[24px] h-[24px] md:w-[28px] md:h-[28px] text-[16px] md:text-[18px]"
                  )}
                >
                  Aa
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="center"
            sideOffset={8}
            className={cn(
              "max-h-[50vh] overflow-y-auto",
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
              {translationLanguages.map((lang) => (
                <DropdownMenuRadioItem
                  key={lang.code || "off"}
                  value={lang.code || "off"}
                >
                  {lang.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Fullscreen button (for non-fullscreen mode) */}
        {onFullscreen && (
          <button
            type="button"
            onClick={handleClick(onFullscreen)}
            className={cn(
              buttonSize,
              "flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
            )}
            aria-label={t("apps.ipod.ariaLabels.enterFullscreen")}
            title={t("apps.ipod.ariaLabels.enterFullscreen")}
          >
            <Maximize2
              size={svgSize}
              className={variant === "responsive" ? `md:w-[${svgSizeMd}px] md:h-[${svgSizeMd}px]` : undefined}
            />
          </button>
        )}

        {/* Close button (for fullscreen mode) */}
        {onClose && (
          <button
            type="button"
            onClick={handleClick(onClose)}
            className={cn(
              buttonSize,
              "flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
            )}
            aria-label={t("apps.ipod.ariaLabels.closeFullscreen")}
            title={t("common.dialog.close")}
          >
            <X
              size={svgSize}
              className={variant === "responsive" ? `md:w-[${svgSizeMd}px] md:h-[${svgSizeMd}px]` : undefined}
            />
          </button>
        )}
      </div>
    </div>
  );
}
