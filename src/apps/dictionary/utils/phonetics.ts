import { pinyin } from "pinyin-pro";
import { toRomaji } from "wanakana";
import type { DictionaryEntry } from "@/shared/dictionary";
import type { DictionaryChineseScript } from "@/stores/useDictionaryStore";
import type { ChinesePhoneticSystem } from "@/types/lyrics";
import { alignFuriganaReading, type FuriganaSegmentLike } from "@/utils/furigana";
import { getKoreanPronunciationOnly } from "@/utils/romanization";
import {
  hanziToZhuyinReadings,
  numberedPinyinSyllableToToneMarks,
  numberedPinyinSyllableToZhuyin,
  numberedPinyinToToneMarks,
  numberedPinyinToZhuyin,
} from "@/utils/zhuyin";

/**
 * Per-character readings for a Chinese word. CC-CEDICT numbered pinyin is
 * used when it lines up 1:1 with the characters (it is more accurate than
 * pinyin-pro for polyphones like 行 / 長); otherwise pinyin-pro fills in.
 */
export function chineseCharacterReadings(
  text: string,
  numberedReading: string | undefined,
  system: ChinesePhoneticSystem
): string[] {
  const chars = [...text];
  const tokens = numberedReading?.trim().split(/\s+/) ?? [];
  if (tokens.length === chars.length && tokens.length > 0) {
    return tokens.map((token) =>
      system === "zhuyin"
        ? numberedPinyinSyllableToZhuyin(token)
        : numberedPinyinSyllableToToneMarks(token)
    );
  }
  return system === "zhuyin"
    ? hanziToZhuyinReadings(text)
    : pinyin(text, { type: "array" });
}

export function formatChineseReading(
  numberedReading: string,
  system: ChinesePhoneticSystem
): string {
  return system === "zhuyin"
    ? numberedPinyinToZhuyin(numberedReading)
    : numberedPinyinToToneMarks(numberedReading);
}

/** Pinyin line for arbitrary Chinese text (example sentences, AI output). */
export function chineseTextToPinyin(text: string): string {
  return pinyin(text, { type: "string", nonZh: "consecutive" });
}

export function displayChineseHeadword(
  entry: Pick<DictionaryEntry, "headword" | "traditional" | "simplified">,
  script: DictionaryChineseScript
): string {
  return script === "traditional"
    ? entry.traditional ?? entry.headword
    : entry.simplified ?? entry.headword;
}

/** The other script's spelling, when it differs from what is displayed. */
export function alternateChineseHeadword(
  entry: Pick<DictionaryEntry, "headword" | "traditional" | "simplified">,
  script: DictionaryChineseScript
): string | null {
  const shown = displayChineseHeadword(entry, script);
  const other =
    script === "traditional" ? entry.simplified : entry.traditional;
  return other && other !== shown ? other : null;
}

export function japaneseHeadwordSegments(
  headword: string,
  reading: string | undefined
): FuriganaSegmentLike[] {
  if (!reading || reading === headword) return [{ text: headword }];
  return alignFuriganaReading(headword, reading);
}

export function japaneseRomaji(kana: string): string {
  return toRomaji(kana);
}

export function koreanRomanization(text: string): string {
  return getKoreanPronunciationOnly(text);
}
