import type { RomanizationSettings } from "@/types/lyrics";

export function getPronunciationGlyph(
  romanization: RomanizationSettings | undefined
): string {
  if (!romanization?.enabled) return "漢";
  if (romanization.soramimi && romanization.soramamiTargetLanguage === "zh-TW")
    return "空";
  if (romanization.soramimi && romanization.soramamiTargetLanguage === "en")
    return "Mi";
  if (romanization.japaneseRomaji) return "Ro";
  if (romanization.korean) return "Ko";
  if (romanization.japaneseFurigana) return "ふ";
  if (romanization.chinese) return "拼";
  return "漢";
}

export function getFontLabel(language: string): string {
  if (language === "ja") return "あ";
  if (language === "ko") return "가";
  if (language === "zh-TW") return "字";
  return "Aa";
}
