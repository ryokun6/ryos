import { useIpodStore } from "@/stores/useIpodStore";
import {
  LyricsFont,
  getLyricsFontClassName,
} from "@/types/lyrics";
import { useShallow } from "zustand/react/shallow";
import type { LyricsDisplayProps } from "./types";

/** Small iPod LCD lyrics always use sans-serif; ignore stored lyric style. */
export function getIpodSmallScreenLyricsFontClassName(
  uiVariant: "classic" | "modern" | "aqua"
): string {
  return uiVariant !== "classic"
    ? "font-ipod-modern-ui font-semibold"
    : "font-geneva-12";
}

export function useLyricsDisplaySettings({
  alignment: alignmentOverride,
  fontClassName: fontClassNameFromProp,
}: Pick<LyricsDisplayProps, "alignment" | "fontClassName">) {
  const {
    lyricsAlignment: storeAlignment,
    romanization,
    uiVariant: storeUiVariant,
    lyricsFont: storeLyricsFont,
  } = useIpodStore(
    useShallow((s) => ({
      lyricsAlignment: s.lyricsAlignment,
      romanization: s.romanization,
      uiVariant: s.uiVariant,
      lyricsFont: s.lyricsFont,
    }))
  );

  const fontClassName =
    fontClassNameFromProp ??
    (storeUiVariant !== "classic"
      ? storeLyricsFont === LyricsFont.SansSerif
        ? "font-ipod-modern-ui font-semibold"
        : getLyricsFontClassName(storeLyricsFont)
      : "font-geneva-12");

  const alignment = alignmentOverride ?? storeAlignment;
  const showKoreanRomanization = romanization.enabled && romanization.korean;

  return {
    alignment,
    fontClassName,
    romanization,
    showKoreanRomanization,
  };
}
