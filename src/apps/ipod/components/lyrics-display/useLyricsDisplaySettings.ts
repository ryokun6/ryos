import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  LyricsFont,
  JapaneseFurigana,
  KoreanDisplay,
  getLyricsFontClassName,
  type RomanizationSettings,
} from "@/types/lyrics";
import { useIpodStore } from "@/stores/useIpodStore";
import type { LyricsDisplayProps } from "./types";

export function useLyricsDisplaySettings({
  alignment: alignmentOverride,
  koreanDisplay: koreanDisplayOverride,
  japaneseFurigana: japaneseFuriganaOverride,
  fontClassName: fontClassNameFromProp,
}: Pick<
  LyricsDisplayProps,
  "alignment" | "koreanDisplay" | "japaneseFurigana" | "fontClassName"
>) {
  const {
    lyricsAlignment: storeAlignment,
    koreanDisplay: storeKoreanDisplay,
    japaneseFurigana: storeJapaneseFurigana,
    romanization: storeRomanization,
    uiVariant: storeUiVariant,
    lyricsFont: storeLyricsFont,
  } = useIpodStore(
    useShallow((s) => ({
      lyricsAlignment: s.lyricsAlignment,
      koreanDisplay: s.koreanDisplay,
      japaneseFurigana: s.japaneseFurigana,
      romanization: s.romanization,
      uiVariant: s.uiVariant,
      lyricsFont: s.lyricsFont,
    }))
  );

  const fontClassName =
    fontClassNameFromProp ??
    (storeUiVariant === "modern"
      ? storeLyricsFont === LyricsFont.SansSerif
        ? "font-ipod-modern-ui font-semibold"
        : getLyricsFontClassName(storeLyricsFont)
      : "font-geneva-12");

  const alignment = alignmentOverride ?? storeAlignment;
  const koreanDisplay = koreanDisplayOverride ?? storeKoreanDisplay;
  const japaneseFurigana = japaneseFuriganaOverride ?? storeJapaneseFurigana;

  const romanization: RomanizationSettings = useMemo(() => {
    if (storeRomanization) {
      return storeRomanization;
    }
    return {
      enabled: true,
      japaneseFurigana: japaneseFurigana === JapaneseFurigana.On,
      japaneseRomaji: false,
      korean: koreanDisplay === KoreanDisplay.Romanized,
      chinese: false,
      soramimi: false,
      soramamiTargetLanguage: "zh-TW",
    };
  }, [storeRomanization, japaneseFurigana, koreanDisplay]);

  const showKoreanRomanization = romanization.enabled && romanization.korean;

  return {
    alignment,
    fontClassName,
    romanization,
    showKoreanRomanization,
  };
}
