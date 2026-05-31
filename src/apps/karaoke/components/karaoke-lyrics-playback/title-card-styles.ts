import type { CSSProperties } from "react";

export const TITLE_CARD_BASE_SHADOW = "0 0 6px rgba(0,0,0,0.5), 0 0 6px rgba(0,0,0,0.5)";
export const TITLE_CARD_GOLD_GLOW_COLOR_FALLBACK = "#FFD700";
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
  "color" | "filter" | "lineHeight" | "paintOrder" | "textShadow" | "WebkitTextStroke"
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

function titleCardHexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return [255, 215, 0];
  return [
    Number.parseInt(match[1]!, 16),
    Number.parseInt(match[2]!, 16),
    Number.parseInt(match[3]!, 16),
  ];
}

function titleCardRgbSaturation(r: number, g: number, b: number): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  if (max === min) return 0;
  const lightness = (max + min) / 2;
  return lightness > 0.5
    ? (max - min) / (2 - max - min)
    : (max - min) / (max + min);
}

function pickTitleCardPrimaryColor(palette: string[]): string {
  let best = palette[0] ?? TITLE_CARD_GOLD_GLOW_COLOR_FALLBACK;
  let bestScore = -1;

  for (const hex of palette) {
    const [r, g, b] = titleCardHexToRgb(hex);
    const saturation = titleCardRgbSaturation(r, g, b);
    const lightness = (r + g + b) / (3 * 255);
    const lightnessBoost = 1 - Math.abs(lightness - 0.5) * 2;
    const score = saturation * 0.7 + lightnessBoost * 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = hex;
    }
  }

  return best;
}

function boostTitleCardGlowColor(hex: string): string {
  const [r, g, b] = titleCardHexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let hue = 0;
  const lightness = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  if (delta !== 0) {
    if (max === rn) hue = ((gn - bn) / delta + 6) % 6;
    else if (max === gn) hue = (bn - rn) / delta + 2;
    else hue = (rn - gn) / delta + 4;
    hue /= 6;
  }

  const boostedSaturation = Math.max(saturation, 0.85);
  const boostedLightness = Math.max(Math.min(lightness, 0.65), 0.55);
  const hslToRgb = (p: number, q: number, t: number) => {
    let nextT = t;
    if (nextT < 0) nextT += 1;
    if (nextT > 1) nextT -= 1;
    if (nextT < 1 / 6) return p + (q - p) * 6 * nextT;
    if (nextT < 1 / 2) return q;
    if (nextT < 2 / 3) return p + (q - p) * (2 / 3 - nextT) * 6;
    return p;
  };
  const q =
    boostedLightness < 0.5
      ? boostedLightness * (1 + boostedSaturation)
      : boostedLightness + boostedSaturation - boostedLightness * boostedSaturation;
  const p = 2 * boostedLightness - q;
  const ro = Math.round(hslToRgb(p, q, hue + 1 / 3) * 255);
  const go = Math.round(hslToRgb(p, q, hue) * 255);
  const bo = Math.round(hslToRgb(p, q, hue - 1 / 3) * 255);
  return `#${ro.toString(16).padStart(2, "0")}${go.toString(16).padStart(2, "0")}${bo.toString(16).padStart(2, "0")}`;
}

export function makeTitleCardGlow(hex: string) {
  const [r, g, b] = titleCardHexToRgb(hex);
  return {
    color: hex,
    shadow: `0 0 8px rgba(${r},${g},${b},0.8), 0 0 16px rgba(${r},${g},${b},0.4), 0 0 6px rgba(0,0,0,0.5)`,
    filter: `drop-shadow(0 0 8px rgba(${r},${g},${b},0.5))`,
    baseColor: `rgba(${r},${g},${b},0.6)`,
  };
}

export function pickBoostedTitleCardGlow(palette: string[]) {
  return makeTitleCardGlow(boostTitleCardGlowColor(pickTitleCardPrimaryColor(palette)));
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
/** Extra room under stroked/glow titles so `ScrollingText` avoids clipping glyphs */
export const TITLE_CARD_TITLE_LINE_HEIGHT = 1.22;

export const TITLE_CARD_REGULAR_OUTLINE_STYLE: TitleCardLineStyle = {
  color: "#fff",
  lineHeight: TITLE_CARD_TITLE_LINE_HEIGHT,
  WebkitTextStroke: "0.12em rgba(0,0,0,0.7)",
  paintOrder: "stroke fill",
  textShadow: "none",
};
export const TITLE_CARD_REGULAR_GRADIENT_STYLE: TitleCardLineStyle = {
  color: "rgba(255, 255, 255, 0.78)",
  lineHeight: TITLE_CARD_TITLE_LINE_HEIGHT,
  textShadow: TITLE_CARD_BASE_SHADOW,
};
