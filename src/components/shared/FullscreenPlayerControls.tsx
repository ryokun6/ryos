import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { KoreanDisplay } from "@/types/lyrics";
import { LyricsAlignment, LyricsFont } from "@/types/lyrics";
import { getTranslationBadge } from "@/apps/ipod/constants";
import {
  Maximize2,
  X,
  MoreHorizontal,
  SkipBack,
  SkipForward,
  Play,
  Pause,
  Shuffle,
  Repeat,
  Repeat1,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface TranslationLanguageOption {
  label: string;
  code: string | null;
  separator?: boolean;
}

export interface FullscreenPlayerControlsProps {
  // Playback state
  isPlaying: boolean;
  isShuffled: boolean;
  isLoopAll: boolean;
  isLoopCurrent: boolean;

  // Transport controls
  onPrevious: () => void;
  onPlayPause: () => void;
  onNext: () => void;
  onToggleShuffle: () => void;
  onToggleLoop: () => void;

  // Lyrics alignment
  currentAlignment: LyricsAlignment;
  onAlignmentChange: (alignment: LyricsAlignment) => void;

  // Font style
  currentFont: LyricsFont;
  onFontChange: (font: LyricsFont) => void;

  // Korean display
  koreanDisplay: KoreanDisplay;
  onKoreanToggle: () => void;

  // Translation
  currentTranslationCode: string | null;
  onTranslationSelect: (code: string | null) => void;
  translationLanguages: TranslationLanguageOption[];
  isLangMenuOpen: boolean;
  setIsLangMenuOpen: (open: boolean) => void;

  // View menu state
  isViewMenuOpen: boolean;
  setIsViewMenuOpen: (open: boolean) => void;

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
  isShuffled,
  isLoopAll,
  isLoopCurrent,
  onPrevious,
  onPlayPause,
  onNext,
  onToggleShuffle,
  onToggleLoop,
  currentAlignment,
  onAlignmentChange,
  currentFont,
  onFontChange,
  koreanDisplay,
  onKoreanToggle,
  currentTranslationCode,
  onTranslationSelect,
  translationLanguages,
  isLangMenuOpen,
  setIsLangMenuOpen,
  isViewMenuOpen,
  setIsViewMenuOpen,
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

  const svgSize = variant === "compact" ? 16 : 18;
  const svgSizeMd = variant === "compact" ? 16 : 22;

  const handleClick = (handler: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onInteraction?.();
    handler();
  };

  return (
    <div className="relative ipod-force-font">
      <div
        className={cn(
          "border border-white/10 backdrop-blur-sm rounded-full shadow-lg flex items-center gap-1 px-1 py-1",
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
            "flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
          )}
          title={t("apps.ipod.menu.previous")}
        >
          <SkipBack
            size={svgSize}
            className={variant === "responsive" ? `md:w-[${svgSizeMd}px] md:h-[${svgSizeMd}px]` : undefined}
            fill="currentColor"
          />
        </button>

        {/* Play/Pause */}
        <button
          type="button"
          onClick={handleClick(onPlayPause)}
          aria-label={t("apps.ipod.ariaLabels.playPause")}
          className={cn(
            buttonSize,
            "flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
          )}
          title={t("apps.ipod.ariaLabels.playPause")}
        >
          {isPlaying ? (
            <Pause
              size={svgSize}
              className={variant === "responsive" ? `md:w-[${svgSizeMd}px] md:h-[${svgSizeMd}px]` : undefined}
              fill="currentColor"
            />
          ) : (
            <Play
              size={svgSize}
              className={variant === "responsive" ? `md:w-[${svgSizeMd}px] md:h-[${svgSizeMd}px]` : undefined}
              fill="currentColor"
            />
          )}
        </button>

        {/* Next */}
        <button
          type="button"
          onClick={handleClick(onNext)}
          aria-label={t("apps.ipod.ariaLabels.nextTrack")}
          className={cn(
            buttonSize,
            "flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
          )}
          title={t("apps.ipod.menu.next")}
        >
          <SkipForward
            size={svgSize}
            className={variant === "responsive" ? `md:w-[${svgSizeMd}px] md:h-[${svgSizeMd}px]` : undefined}
            fill="currentColor"
          />
        </button>

        {/* Shuffle */}
        <button
          type="button"
          onClick={handleClick(onToggleShuffle)}
          aria-label={t("apps.ipod.menu.shuffle")}
          className={cn(
            buttonSize,
            "relative flex flex-col items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
          )}
          title={t("apps.ipod.menu.shuffle")}
        >
          <Shuffle
            size={svgSize}
            className={variant === "responsive" ? `md:w-[${svgSizeMd}px] md:h-[${svgSizeMd}px]` : undefined}
          />
          {isShuffled && (
            <span className={cn(
              "absolute bottom-1 rounded-full bg-white/60",
              variant === "compact" ? "w-0.5 h-0.5" : "w-1 h-1"
            )} />
          )}
        </button>

        {/* Repeat */}
        <button
          type="button"
          onClick={handleClick(onToggleLoop)}
          aria-label={isLoopCurrent ? t("apps.ipod.menu.repeatOne") : isLoopAll ? t("apps.ipod.menu.repeatAll") : t("apps.ipod.menu.repeatAll")}
          className={cn(
            buttonSize,
            "relative flex flex-col items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
          )}
          title={isLoopCurrent ? t("apps.ipod.menu.repeatOne") : isLoopAll ? t("apps.ipod.menu.repeatAll") : t("apps.ipod.menu.repeatAll")}
        >
          {isLoopCurrent ? (
            <Repeat1
              size={svgSize}
              className={variant === "responsive" ? `md:w-[${svgSizeMd}px] md:h-[${svgSizeMd}px]` : undefined}
            />
          ) : (
            <Repeat
              size={svgSize}
              className={variant === "responsive" ? `md:w-[${svgSizeMd}px] md:h-[${svgSizeMd}px]` : undefined}
            />
          )}
          {(isLoopCurrent || isLoopAll) && (
            <span className={cn(
              "absolute bottom-1 rounded-full bg-white/60",
              variant === "compact" ? "w-0.5 h-0.5" : "w-1 h-1"
            )} />
          )}
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
                "flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
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

        {/* View Options Menu */}
        <DropdownMenu open={isViewMenuOpen} onOpenChange={setIsViewMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onInteraction?.();
              }}
              aria-label={t("apps.ipod.menu.view")}
              className={cn(
                buttonSize,
                "flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
              )}
              title={t("apps.ipod.menu.view")}
            >
              <MoreHorizontal
                size={svgSize}
                className={variant === "responsive" ? `md:w-[${svgSizeMd}px] md:h-[${svgSizeMd}px]` : undefined}
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="center"
            sideOffset={8}
            className={cn(
              "px-0 max-h-[50vh] overflow-y-auto",
              variant === "compact" ? "w-44" : "w-48"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Layout Section */}
            <DropdownMenuCheckboxItem
              checked={currentAlignment === LyricsAlignment.FocusThree}
              onCheckedChange={(checked) => {
                if (checked) onAlignmentChange(LyricsAlignment.FocusThree);
                onInteraction?.();
              }}
              className="text-md h-6 pr-3"
            >
              {t("apps.ipod.menu.multi")}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={currentAlignment === LyricsAlignment.Center}
              onCheckedChange={(checked) => {
                if (checked) onAlignmentChange(LyricsAlignment.Center);
                onInteraction?.();
              }}
              className="text-md h-6 pr-3"
            >
              {t("apps.ipod.menu.single")}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={currentAlignment === LyricsAlignment.Alternating}
              onCheckedChange={(checked) => {
                if (checked) onAlignmentChange(LyricsAlignment.Alternating);
                onInteraction?.();
              }}
              className="text-md h-6 pr-3"
            >
              {t("apps.ipod.menu.alternating")}
            </DropdownMenuCheckboxItem>

            <DropdownMenuSeparator />

            {/* Font Section */}
            <DropdownMenuCheckboxItem
              checked={currentFont === LyricsFont.SansSerif}
              onCheckedChange={(checked) => {
                if (checked) onFontChange(LyricsFont.SansSerif);
                onInteraction?.();
              }}
              className="text-md h-6 pr-3"
            >
              {t("apps.ipod.menu.fontSansSerif")}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={currentFont === LyricsFont.Serif}
              onCheckedChange={(checked) => {
                if (checked) onFontChange(LyricsFont.Serif);
                onInteraction?.();
              }}
              className="text-md h-6 pr-3"
            >
              {t("apps.ipod.menu.fontSerif")}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={currentFont === LyricsFont.Rounded}
              onCheckedChange={(checked) => {
                if (checked) onFontChange(LyricsFont.Rounded);
                onInteraction?.();
              }}
              className="text-md h-6 pr-3"
            >
              {t("apps.ipod.menu.fontRounded")}
            </DropdownMenuCheckboxItem>

            <DropdownMenuSeparator />

            {/* Korean Display */}
            <DropdownMenuCheckboxItem
              checked={koreanDisplay === "original"}
              onCheckedChange={() => {
                onKoreanToggle();
                onInteraction?.();
              }}
              className="text-md h-6 pr-3"
            >
              {t("apps.ipod.menu.korean")}
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Fullscreen button (for non-fullscreen mode) */}
        {onFullscreen && (
          <button
            type="button"
            onClick={handleClick(onFullscreen)}
            className={cn(
              buttonSize,
              "flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
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
              "flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
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
