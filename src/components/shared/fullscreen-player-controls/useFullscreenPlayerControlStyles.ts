import { cn } from "@/lib/utils";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import type {
  FullscreenControlStyles,
  FullscreenControlsVariant,
} from "./types";

export function useFullscreenPlayerControlStyles(
  variant: FullscreenControlsVariant,
  bgOpacity: "35" | "60"
): FullscreenControlStyles {
  const { isMacOSTheme: isMacTheme } = useThemeFlags();

  const buttonSize =
    variant === "compact" ? "w-8 h-8" : "w-9 h-9 md:w-12 md:h-12";

  const smallIconSize =
    variant === "compact" ? "text-sm" : "text-[16px] md:text-[18px]";

  const svgSize = variant === "compact" ? 14 : 18;
  const svgSizeMd = variant === "compact" ? 14 : 22;

  const segmentClasses = isMacTheme
    ? "relative overflow-hidden rounded-full shadow-lg flex items-center gap-1 px-1 py-1"
    : cn(
        "border border-white/10 backdrop-blur-sm rounded-full shadow-lg flex items-center gap-1 px-1 py-1",
        variant === "responsive" && "md:gap-2",
        bgOpacity === "35" ? "bg-neutral-800/35" : "bg-neutral-800/60"
      );

  const aquaSegmentStyle: React.CSSProperties = isMacTheme
    ? {
        background:
          "linear-gradient(to bottom, rgba(60, 60, 60, 0.6), rgba(30, 30, 30, 0.5))",
        boxShadow:
          "0 2px 4px rgba(0, 0, 0, 0.2), inset 0 0 0 0.5px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
      }
    : {};

  const buttonClasses = isMacTheme
    ? cn(
        buttonSize,
        "flex items-center justify-center rounded-full transition-colors focus:outline-none relative z-10"
      )
    : cn(
        buttonSize,
        "flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
      );

  const iconClasses = isMacTheme
    ? "text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
    : "";

  const svgClasses = (baseClass?: string) =>
    cn(
      baseClass,
      isMacTheme && "text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
    );

  const channelStepButtonClasses = isMacTheme
    ? cn(
        variant === "compact"
          ? "h-8 shrink-0 w-max min-w-8 px-2"
          : "h-9 md:h-12 shrink-0 w-max min-w-9 md:min-w-12 px-2.5 md:px-4",
        "flex items-center justify-center rounded-full transition-colors focus:outline-none relative z-10"
      )
    : cn(
        variant === "compact"
          ? "h-8 shrink-0 w-max min-w-8 px-2"
          : "h-9 md:h-12 shrink-0 w-max min-w-9 md:min-w-12 px-2.5 md:px-4",
        "flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none whitespace-nowrap"
      );

  return {
    segmentClasses,
    aquaSegmentStyle,
    buttonClasses,
    iconClasses,
    svgClasses,
    channelStepButtonClasses,
    smallIconSize,
    svgSize,
    svgSizeMd,
    variant,
    isMacTheme,
  };
}
