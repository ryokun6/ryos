import type { LyricsAlignment } from "@/types/lyrics";
import type { FullscreenControlStyles } from "./types";

interface LyricsAlignmentIconProps {
  alignment: LyricsAlignment;
  styles: Pick<FullscreenControlStyles, "svgSize" | "svgSizeMd" | "svgClasses" | "variant">;
}

export function LyricsAlignmentIcon({
  alignment,
  styles: { svgSize, svgSizeMd, svgClasses, variant },
}: LyricsAlignmentIconProps) {
  const responsiveClass =
    variant === "responsive"
      ? `md:w-[${svgSizeMd}px] md:h-[${svgSizeMd}px]`
      : undefined;

  const commonProps = {
    "aria-hidden": true as const,
    xmlns: "http://www.w3.org/2000/svg",
    width: svgSize,
    height: svgSize,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: svgClasses(responsiveClass),
  };

  if (alignment === "focusThree") {
    return (
      <svg {...commonProps}>
        <line x1="6" y1="6" x2="18" y2="6" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="6" y1="18" x2="18" y2="18" />
      </svg>
    );
  }

  if (alignment === "center") {
    return (
      <svg {...commonProps}>
        <line x1="6" y1="12" x2="18" y2="12" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <line x1="4" y1="8" x2="13" y2="8" />
      <line x1="11" y1="16" x2="20" y2="16" />
    </svg>
  );
}
