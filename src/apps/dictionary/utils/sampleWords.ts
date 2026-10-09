import type { DictionaryQueryLanguage } from "@/shared/dictionary";
import type { DictionaryChineseScript } from "@/stores/useDictionaryStore";

type DictionarySampleWord =
  | { lang: Exclude<DictionaryQueryLanguage, "zh" | "auto">; word: string }
  | { lang: "zh"; simplified: string; traditional: string };

/** Welcome-screen examples. Chinese follows the Readings script setting. */
export const DICTIONARY_SAMPLE_WORDS: readonly DictionarySampleWord[] = [
  { lang: "en", word: "serendipity" },
  { lang: "zh", simplified: "学习", traditional: "學習" },
  { lang: "ja", word: "勉強" },
  { lang: "ko", word: "사랑" },
];

export function dictionarySampleLabel(
  sample: DictionarySampleWord,
  chineseScript: DictionaryChineseScript
): string {
  if (sample.lang !== "zh") return sample.word;
  return chineseScript === "traditional" ? sample.traditional : sample.simplified;
}
