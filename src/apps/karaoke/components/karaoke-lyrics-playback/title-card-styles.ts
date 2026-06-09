import type { CSSProperties } from "react";
import {
  boostGlowColor,
  makeGlowFromColor,
  makeOutlineFillFromGlowColor,
  pickPrimaryColor,
} from "@/apps/ipod/components/lyrics-display/colorUtils";

export const TITLE_CARD_BASE_SHADOW = "0 0 6px rgba(0,0,0,0.5), 0 0 6px rgba(0,0,0,0.5)";
export const TITLE_CARD_MOVEMENT_TRANSITION = {
  type: "spring" as const,
  stiffness: 200,
  damping: 30,
  mass: 1,
};

export type TitleCardStyleCategory =
  | "outline-blue"
  | "outline-red"
  | "glow-white"
  | "glow-gold"
  | "glow-gradient";
export type TitleCardLineStyle = Pick<
  CSSProperties,
  | "color"
  | "filter"
  | "lineHeight"
  | "marginBottom"
  | "marginLeft"
  | "marginTop"
  | "maxWidth"
  | "paddingBottom"
  | "paddingLeft"
  | "paddingTop"
  | "paintOrder"
  | "textShadow"
  | "WebkitTextStroke"
  | "width"
>;

export function getTitleCardStyleCategory(className: string): TitleCardStyleCategory {
  if (className.includes("font-lyrics-rounded") && !className.includes("gold-glow")) {
    return "outline-blue";
  }
  if (className.includes("font-lyrics-serif-red")) return "outline-red";
  if (className.includes("font-lyrics-gold-glow")) return "glow-gold";
  if (className.includes("font-lyrics-gradient")) return "glow-gradient";
  return "glow-white";
}

export function makeTitleCardGlow(hex: string) {
  return makeGlowFromColor(hex);
}

export function pickBoostedTitleCardGlow(palette: string[]) {
  return makeTitleCardGlow(boostGlowColor(pickPrimaryColor(palette)));
}

export const TITLE_CARD_SECONDARY_TEXT_STYLE: CSSProperties = {
  lineHeight: 1.1,
  opacity: 0.55,
};
export const TITLE_CARD_COVER_SLEEVE_STYLE: CSSProperties = {
  background: "#1a1a1a",
  borderRadius: "1%",
  boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
};
export const TITLE_CARD_COVER_REFLECTION_STYLE: CSSProperties = {
  transform: "scaleY(-1)",
  opacity: 0.3,
  maskImage:
    "linear-gradient(to top, rgba(0,0,0,1) 0%, transparent 50%)",
  WebkitMaskImage:
    "linear-gradient(to top, rgba(0,0,0,1) 0%, transparent 50%)",
  borderRadius: "1%",
};
export const TITLE_CARD_COVER_REFLECTION_WRAPPER_STYLE: CSSProperties = {
  height: "50%",
};
export const TITLE_CARD_COVER_IMAGE_STYLE_FULLSCREEN: CSSProperties = {
  width: "clamp(120px, min(24vw, 24vh), 320px)",
  height: "clamp(120px, min(24vw, 24vh), 320px)",
};
export const TITLE_CARD_COVER_IMAGE_STYLE_WINDOW: CSSProperties = {
  width: "clamp(96px, 18cqw, 220px)",
  height: "clamp(96px, 18cqw, 220px)",
};
export const TITLE_CARD_CONTENT_STYLE_FULLSCREEN: CSSProperties = {
  gap: "clamp(22px, min(5vw, 5vh), 64px)",
};
export const TITLE_CARD_CONTENT_STYLE_WINDOW: CSSProperties = {
  gap: "clamp(22px, 5cqw, 64px)",
};
export const TITLE_CARD_OUTER_STYLE_FULLSCREEN: CSSProperties = {
  paddingLeft: "clamp(24px, min(6vw, 6vh), 80px)",
};
export const TITLE_CARD_OUTER_STYLE_WINDOW: CSSProperties = {
  paddingLeft: "clamp(24px, 6cqw, 80px)",
};
export const TITLE_CARD_TITLE_LINE_HEIGHT = 1.22;
const TITLE_CARD_TITLE_SHADOW_BLEED = "0.18em";
const TITLE_CARD_TITLE_LEFT_BLEED = "0.35em";
export const TITLE_CARD_TITLE_SHADOW_BLEED_STYLE = {
  paddingLeft: TITLE_CARD_TITLE_LEFT_BLEED,
  paddingTop: TITLE_CARD_TITLE_SHADOW_BLEED,
  paddingBottom: TITLE_CARD_TITLE_SHADOW_BLEED,
  marginLeft: `-${TITLE_CARD_TITLE_LEFT_BLEED}`,
  marginTop: `-${TITLE_CARD_TITLE_SHADOW_BLEED}`,
  marginBottom: `-${TITLE_CARD_TITLE_SHADOW_BLEED}`,
  width: `calc(100% + ${TITLE_CARD_TITLE_LEFT_BLEED})`,
  maxWidth: `calc(100% + ${TITLE_CARD_TITLE_LEFT_BLEED})`,
} satisfies TitleCardLineStyle;

export const TITLE_CARD_ROUNDED_OUTLINE_COLOR = "#0066FF";
export const TITLE_CARD_SERIF_OUTLINE_COLOR = "#CC0000";
export const TITLE_CARD_COLORED_OUTLINE_STROKE = "0.12em rgba(255,255,255,0.6)";

export function makeTitleCardColoredOutlineStyle(
  fillColor: string
): TitleCardLineStyle {
  return {
    ...TITLE_CARD_TITLE_SHADOW_BLEED_STYLE,
    color: fillColor,
    lineHeight: TITLE_CARD_TITLE_LINE_HEIGHT,
    WebkitTextStroke: TITLE_CARD_COLORED_OUTLINE_STROKE,
    paintOrder: "stroke fill",
    textShadow: "none",
  };
}

export function makeTitleCardOutlineFillFromGlowColor(hex: string): string {
  return makeOutlineFillFromGlowColor(hex);
}

export const TITLE_CARD_REGULAR_GRADIENT_STYLE: TitleCardLineStyle = {
  ...TITLE_CARD_TITLE_SHADOW_BLEED_STYLE,
  color: "rgba(255, 255, 255, 0.78)",
  lineHeight: TITLE_CARD_TITLE_LINE_HEIGHT,
  textShadow: TITLE_CARD_BASE_SHADOW,
};
