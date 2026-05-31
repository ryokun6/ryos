import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { DisplayMode } from "@/types/lyrics";
import {
  Pause,
  Play,
  Shuffle,
  SkipBack,
  SkipForward,
  Video,
} from "@phosphor-icons/react";
import { AquaShineOverlays } from "./AquaShineOverlays";
import type {
  FullscreenControlClickHandler,
  FullscreenControlStyles,
} from "./types";

interface PlaybackControlsIslandProps {
  isPlaying: boolean;
  onPrevious: () => void;
  onPlayPause: () => void;
  onNext: () => void;
  isShuffled?: boolean;
  onToggleShuffle?: () => void;
  displayMode?: DisplayMode;
  onDisplayModeSelect?: (mode: DisplayMode) => void;
  displayModeOptions?: { value: DisplayMode; label: string }[];
  styles: FullscreenControlStyles;
  handleClick: FullscreenControlClickHandler;
}

export function PlaybackControlsIsland({
  isPlaying,
  onPrevious,
  onPlayPause,
  onNext,
  isShuffled,
  onToggleShuffle,
  displayMode,
  onDisplayModeSelect,
  displayModeOptions,
  styles,
  handleClick,
}: PlaybackControlsIslandProps) {
  const { t } = useTranslation();
  const {
    segmentClasses,
    aquaSegmentStyle,
    buttonClasses,
    svgClasses,
    svgSize,
    svgSizeMd,
    variant,
    isMacTheme,
  } = styles;

  const responsiveSvgClass =
    variant === "responsive"
      ? `md:w-[${svgSizeMd}px] md:h-[${svgSizeMd}px]`
      : undefined;

  return (
    <div className={segmentClasses} style={aquaSegmentStyle}>
      {isMacTheme && <AquaShineOverlays variant={variant} />}
      <button
        type="button"
        onClick={handleClick(onPrevious)}
        aria-label={t("apps.ipod.ariaLabels.previousTrack")}
        className={buttonClasses}
        title={t("apps.ipod.menu.previous")}
      >
        <SkipBack
          weight="fill"
          size={svgSize}
          className={svgClasses(responsiveSvgClass)}
        />
      </button>

      <button
        type="button"
        onClick={handleClick(onPlayPause)}
        aria-label={t("apps.ipod.ariaLabels.playPause")}
        className={buttonClasses}
        title={t("apps.ipod.ariaLabels.playPause")}
      >
        {isPlaying ? (
          <Pause
            weight="fill"
            size={svgSize}
            className={svgClasses(responsiveSvgClass)}
          />
        ) : (
          <Play
            weight="fill"
            size={svgSize}
            className={svgClasses(responsiveSvgClass)}
          />
        )}
      </button>

      <button
        type="button"
        onClick={handleClick(onNext)}
        aria-label={t("apps.ipod.ariaLabels.nextTrack")}
        className={buttonClasses}
        title={t("apps.ipod.menu.next")}
      >
        <SkipForward
          weight="fill"
          size={svgSize}
          className={svgClasses(responsiveSvgClass)}
        />
      </button>

      {onToggleShuffle && (
        <button
          type="button"
          onClick={handleClick(onToggleShuffle)}
          aria-label={t("apps.ipod.menu.shuffle", "Shuffle")}
          className={cn(buttonClasses, "relative hidden md:flex")}
          title={t("apps.ipod.menu.shuffle", "Shuffle")}
        >
          <Shuffle
            weight="bold"
            size={svgSize}
            className={cn(
              svgClasses(responsiveSvgClass),
              isShuffled && "text-white"
            )}
          />
          {isShuffled && (
            <span
              className={cn(
                "absolute rounded-full left-1/2 -translate-x-1/2",
                variant === "compact"
                  ? "w-0.5 h-0.5 bottom-1"
                  : "w-0.5 h-0.5 bottom-1 md:w-1 md:h-1 md:bottom-1",
                isMacTheme ? "bg-white/90" : "bg-white"
              )}
            />
          )}
        </button>
      )}

      {displayMode !== undefined &&
        onDisplayModeSelect &&
        displayModeOptions &&
        displayModeOptions.length > 0 &&
        (() => {
          const currentOpt =
            displayModeOptions.find((o) => o.value === displayMode) ??
            displayModeOptions[0];
          const currentIndex = displayModeOptions.findIndex(
            (o) => o.value === displayMode
          );
          const nextIndex =
            ((currentIndex >= 0 ? currentIndex : 0) + 1) %
            displayModeOptions.length;
          const nextMode = displayModeOptions[nextIndex]!;
          return (
            <button
              type="button"
              onClick={handleClick(() => onDisplayModeSelect(nextMode.value))}
              aria-label={t("apps.ipod.menu.display", "Display")}
              className={buttonClasses}
              title={`${t("apps.ipod.menu.display", "Display")}: ${currentOpt?.label}`}
            >
              <Video
                weight="bold"
                size={svgSize}
                className={svgClasses(responsiveSvgClass)}
              />
            </button>
          );
        })()}
    </div>
  );
}
