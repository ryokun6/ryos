import { useMemo } from "react";
import { useCoverGlowColor } from "@/hooks/useCoverGlowColor";
import {
  GLOW_FILTER,
  GLOW_SHADOW,
  GRADIENT_COLORS,
  GRADIENT_GLOW_FILTER,
  GRADIENT_GLOW_SHADOW,
  OLD_SCHOOL_HIGHLIGHT_COLOR,
  SERIF_RED_HIGHLIGHT_COLOR,
  getStyleCategory,
} from "./constants";
import {
  makeGlowFromColor,
  makeOutlineFillFromGlowColor,
  normalizeCoverColor,
} from "./colorUtils";

export function useLyricsDisplayKaraokeStyle(
  fontClassName: string,
  coverUrl: string | null | undefined,
  coverColor: string | null | undefined,
  onCoverColorResolved?: (coverColor: string, coverUrl: string) => void
) {
  const styleCategory = useMemo(
    () => getStyleCategory(fontClassName),
    [fontClassName]
  );
  const isOldSchoolKaraoke =
    styleCategory === "outline-blue" || styleCategory === "outline-red";
  const hasAdaptiveOutlineColor =
    isOldSchoolKaraoke &&
    (Boolean(coverUrl) || Boolean(normalizeCoverColor(coverColor)));
  const glowColor = useCoverGlowColor({
    coverUrl,
    coverColor,
    enabled: styleCategory === "glow-gold" || hasAdaptiveOutlineColor,
    onResolved: onCoverColorResolved,
  });
  const primaryGlow = useMemo(() => {
    return makeGlowFromColor(glowColor);
  }, [glowColor]);
  const outlineFillColor = useMemo(
    () =>
      hasAdaptiveOutlineColor
        ? makeOutlineFillFromGlowColor(primaryGlow.color)
        : undefined,
    [hasAdaptiveOutlineColor, primaryGlow.color]
  );

  const styleProps = useMemo(() => {
    const isOutline =
      styleCategory === "outline-blue" || styleCategory === "outline-red";
    const isColoredGlow =
      styleCategory === "glow-gold" || styleCategory === "glow-gradient";
    const isGradient = styleCategory === "glow-gradient";

    let highlight: string;
    switch (styleCategory) {
      case "outline-blue":
        highlight = outlineFillColor ?? OLD_SCHOOL_HIGHLIGHT_COLOR;
        break;
      case "outline-red":
        highlight = outlineFillColor ?? SERIF_RED_HIGHLIGHT_COLOR;
        break;
      case "glow-gold":
        highlight = primaryGlow.color;
        break;
      case "glow-gradient":
        highlight = GRADIENT_COLORS;
        break;
      default:
        highlight = "rgba(255, 255, 255, 1)";
    }

    let shadowHighlight: string;
    if (isOutline) {
      shadowHighlight = "none";
    } else if (styleCategory === "glow-gold") {
      shadowHighlight = primaryGlow.shadow;
    } else if (styleCategory === "glow-gradient") {
      shadowHighlight = GRADIENT_GLOW_SHADOW;
    } else {
      shadowHighlight = GLOW_SHADOW;
    }

    let filter: string;
    if (isOutline) {
      filter = "none";
    } else if (styleCategory === "glow-gold") {
      filter = primaryGlow.filter;
    } else if (styleCategory === "glow-gradient") {
      filter = GRADIENT_GLOW_FILTER;
    } else {
      filter = GLOW_FILTER;
    }

    const base =
      styleCategory === "glow-gold" ? primaryGlow.baseColor : undefined;

    return {
      highlightColor: highlight,
      isColoredGlow,
      isGradientStyle: isGradient,
      glowShadowHighlight: shadowHighlight,
      glowFilterStr: filter,
      baseColorResolved: base,
    };
  }, [styleCategory, primaryGlow, outlineFillColor]);

  return {
    isOldSchoolKaraoke,
    ...styleProps,
  };
}
