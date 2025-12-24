import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { LyricsAlignment, RomanizationSettings } from "@/types/lyrics";
import { LyricsFont } from "@/types/lyrics";
import { getTranslationBadge } from "@/apps/ipod/constants";
import { Globe, Maximize2, X, Check, Circle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";

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

  const translationBadge = getTranslationBadge(currentTranslationCode);

  // Custom dropdown content that can render to a specific container (for fullscreen mode)
  // When in native fullscreen, portals to document.body are hidden, so we need to render inside the fullscreen element
  const FullscreenDropdownContent = ({
    children,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>) => {
    const content = (
      <DropdownMenuPrimitive.Content
        sideOffset={8}
        className={cn(
          "z-[10003] min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className
        )}
        {...props}
      >
        {children}
      </DropdownMenuPrimitive.Content>
    );

    // When we have a portal container, render inside it to work with native fullscreen
    if (portalContainer) {
      return (
        <DropdownMenuPortal container={portalContainer}>
          {content}
        </DropdownMenuPortal>
      );
    }

    // Default behavior - portal to document.body
    return <DropdownMenuPortal>{content}</DropdownMenuPortal>;
  };

  // Custom checkbox item for fullscreen dropdown
  const FullscreenCheckboxItem = ({
    children,
    checked,
    onCheckedChange,
    disabled,
    className,
  }: {
    children: React.ReactNode;
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <DropdownMenuPrimitive.CheckboxItem
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn(
        "relative flex cursor-default select-none items-center py-1.5 pl-8 pr-2 text-sm outline-none transition-colors",
        "rounded-sm focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
    >
      <span className="absolute left-3 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );

  // Custom radio item for fullscreen dropdown
  const FullscreenRadioItem = ({
    children,
    value,
    className,
  }: {
    children: React.ReactNode;
    value: string;
    className?: string;
  }) => (
    <DropdownMenuPrimitive.RadioItem
      value={value}
      className={cn(
        "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Circle className="h-2 w-2 fill-current" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );

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
          <span className={cn(
            smallIconSize,
            currentFont === LyricsFont.Rounded
              ? "font-lyrics-rounded"
              : currentFont === LyricsFont.Serif
              ? "font-lyrics-serif"
              : "font-lyrics-sans"
          )}>
            {getFontLabel()}
          </span>
        </button>

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
                className={cn(
                  buttonSize,
                  "flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
                )}
                title={t("apps.ipod.menu.pronunciation")}
              >
                {romanization.enabled ? (
                  <ruby className={cn(smallIconSize, "ruby-align-center")} style={{ rubyPosition: "over" }}>
                    文
                    <rt style={{ fontSize: variant === "compact" ? "8px" : "9px", opacity: 0.7, paddingBottom: "1px" }}>
                      Aa
                    </rt>
                  </ruby>
                ) : (
                  <span className={smallIconSize}>文</span>
                )}
              </button>
            </DropdownMenuTrigger>
            {portalContainer ? (
              <FullscreenDropdownContent
                side="top"
                align="center"
                className="px-0 w-max min-w-40 max-w-none"
                onClick={(e) => e.stopPropagation()}
              >
                <FullscreenCheckboxItem
                  checked={romanization.enabled}
                  onCheckedChange={(checked) => {
                    onRomanizationChange({ enabled: checked });
                    onInteraction?.();
                  }}
                  className="text-md h-6 px-3 whitespace-nowrap"
                >
                  {t("apps.ipod.menu.pronunciation")}
                </FullscreenCheckboxItem>
                <DropdownMenuSeparator />
                <FullscreenCheckboxItem
                  checked={romanization.japaneseFurigana}
                  onCheckedChange={(checked) => {
                    onRomanizationChange({ japaneseFurigana: checked });
                    onInteraction?.();
                  }}
                  disabled={!romanization.enabled || romanization.japaneseRomaji}
                  className="text-md h-6 px-3 whitespace-nowrap"
                >
                  {t("apps.ipod.menu.japaneseFurigana")}
                </FullscreenCheckboxItem>
                <FullscreenCheckboxItem
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
                </FullscreenCheckboxItem>
                <FullscreenCheckboxItem
                  checked={romanization.korean}
                  onCheckedChange={(checked) => {
                    onRomanizationChange({ korean: checked });
                    onInteraction?.();
                  }}
                  disabled={!romanization.enabled}
                  className="text-md h-6 px-3 whitespace-nowrap"
                >
                  {t("apps.ipod.menu.koreanRomanization")}
                </FullscreenCheckboxItem>
                <FullscreenCheckboxItem
                  checked={romanization.chinese}
                  onCheckedChange={(checked) => {
                    onRomanizationChange({ chinese: checked });
                    onInteraction?.();
                  }}
                  disabled={!romanization.enabled}
                  className="text-md h-6 px-3 whitespace-nowrap"
                >
                  {t("apps.ipod.menu.chinesePinyin")}
                </FullscreenCheckboxItem>
              </FullscreenDropdownContent>
            ) : (
              <DropdownMenuContent
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
              </DropdownMenuContent>
            )}
          </DropdownMenu>
        )}

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
                <Globe
                  size={svgSize}
                  className={variant === "responsive" ? `md:w-[${svgSizeMd}px] md:h-[${svgSizeMd}px]` : undefined}
                />
              )}
            </button>
          </DropdownMenuTrigger>
          {portalContainer ? (
            <FullscreenDropdownContent
              side="top"
              align="center"
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
                    <FullscreenRadioItem
                      key={lang.code || "off"}
                      value={lang.code || "off"}
                      className="text-md h-6 pr-3"
                    >
                      {lang.label}
                    </FullscreenRadioItem>
                  );
                })}
              </DropdownMenuRadioGroup>
            </FullscreenDropdownContent>
          ) : (
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
          )}
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
