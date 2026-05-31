import { cn } from "@/lib/utils";
import { AquaShineOverlays } from "./AquaShineOverlays";
import type {
  FullscreenControlClickHandler,
  FullscreenControlStyles,
} from "./types";

interface ChannelStepIslandProps {
  onChannelUp: () => void;
  onChannelDown: () => void;
  channelUpTitle?: string;
  channelDownTitle?: string;
  channelUpLabel: string;
  channelDownLabel: string;
  styles: FullscreenControlStyles;
  handleClick: FullscreenControlClickHandler;
}

export function ChannelStepIsland({
  onChannelUp,
  onChannelDown,
  channelUpTitle,
  channelDownTitle,
  channelUpLabel,
  channelDownLabel,
  styles,
  handleClick,
}: ChannelStepIslandProps) {
  const {
    segmentClasses,
    aquaSegmentStyle,
    channelStepButtonClasses,
    smallIconSize,
    iconClasses,
    variant,
    isMacTheme,
  } = styles;

  return (
    <div className={segmentClasses} style={aquaSegmentStyle}>
      {isMacTheme && <AquaShineOverlays variant={variant} />}
      <button
        type="button"
        onClick={handleClick(onChannelDown)}
        aria-label={channelDownTitle ?? channelDownLabel}
        className={channelStepButtonClasses}
        title={channelDownTitle ?? channelDownLabel}
      >
        <span
          className={cn(
            smallIconSize,
            "font-semibold tabular-nums tracking-tight whitespace-nowrap",
            iconClasses
          )}
        >
          {channelDownLabel}
        </span>
      </button>
      <button
        type="button"
        onClick={handleClick(onChannelUp)}
        aria-label={channelUpTitle ?? channelUpLabel}
        className={channelStepButtonClasses}
        title={channelUpTitle ?? channelUpLabel}
      >
        <span
          className={cn(
            smallIconSize,
            "font-semibold tabular-nums tracking-tight whitespace-nowrap",
            iconClasses
          )}
        >
          {channelUpLabel}
        </span>
      </button>
    </div>
  );
}
