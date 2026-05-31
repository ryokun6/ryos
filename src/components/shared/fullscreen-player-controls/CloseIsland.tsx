import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { X } from "@phosphor-icons/react";
import { AquaShineOverlays } from "./AquaShineOverlays";
import type {
  FullscreenControlClickHandler,
  FullscreenControlStyles,
} from "./types";

interface CloseIslandProps {
  onClose: () => void;
  styles: FullscreenControlStyles;
  handleClick: FullscreenControlClickHandler;
}

export function CloseIsland({
  onClose,
  styles,
  handleClick,
}: CloseIslandProps) {
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
    <div
      className={cn(segmentClasses, "hidden md:flex")}
      style={aquaSegmentStyle}
    >
      {isMacTheme && <AquaShineOverlays variant={variant} />}
      <button
        type="button"
        onClick={handleClick(onClose)}
        className={buttonClasses}
        aria-label={t("apps.ipod.ariaLabels.closeFullscreen")}
        title={t("common.dialog.close")}
      >
        <X
          weight="bold"
          size={svgSize}
          className={svgClasses(responsiveSvgClass)}
        />
      </button>
    </div>
  );
}
