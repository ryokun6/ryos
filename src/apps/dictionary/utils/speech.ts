import type { DictionaryEntry, DictionaryLanguage } from "@/shared/dictionary";
import type { DictionaryChineseScript } from "@/stores/useDictionaryStore";
import { scoreSpeechVoiceQuality } from "@/utils/browserSpeech";
import { displayChineseHeadword } from "./phonetics";

type VoiceLike = Pick<SpeechSynthesisVoice, "lang" | "name" | "voiceURI" | "default">;

/**
 * Canonical lowercase tag for a voice: "zh_TW" / "cmn-Hant-TW" → "zh-tw",
 * "cmn-Hans-CN" → "zh-cn", Cantonese (zh-HK, zh-MO, yue-*) → "yue".
 */
export function normalizeVoiceLanguage(lang: string): string {
  const tag = lang.replace(/_/g, "-").toLowerCase();
  const [primary, ...rest] = tag.split("-");
  if (primary === "yue") return "yue";
  if (primary !== "zh" && primary !== "cmn") return tag;
  if (rest.some((part) => part === "hk" || part === "mo" || part === "yue")) return "yue";
  if (rest.some((part) => part === "tw" || part === "hant")) return "zh-tw";
  if (rest.some((part) => part === "cn" || part === "hans" || part === "sg")) return "zh-cn";
  return "zh";
}

/** BCP 47 tags to try for an entry, best first. */
export function dictionarySpeechTags(
  lang: DictionaryLanguage,
  chineseScript: DictionaryChineseScript
): string[] {
  switch (lang) {
    case "zh":
      return chineseScript === "traditional"
        ? ["zh-tw", "zh-cn", "zh"]
        : ["zh-cn", "zh-tw", "zh"];
    case "ja":
      return ["ja-jp", "ja"];
    case "ko":
      return ["ko-kr", "ko"];
    default:
      return ["en-us", "en-gb", "en"];
  }
}

function bestVoice<V extends VoiceLike>(voices: V[]): V | null {
  let best: V | null = null;
  let bestScore = -Infinity;
  for (const voice of voices) {
    const score = scoreSpeechVoiceQuality(voice);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Voice for reading an entry aloud. Tries the user's Control Panels voice
 * when it speaks the entry language, then each preferred tag in order, then
 * any other voice of the same language. Cantonese voices never stand in for
 * Mandarin — a dictionary should not teach the wrong pronunciation — so
 * Chinese returns null when only Cantonese is installed.
 */
export function pickDictionaryVoice<V extends VoiceLike>(
  voices: readonly V[],
  lang: DictionaryLanguage,
  chineseScript: DictionaryChineseScript,
  preferredVoiceURI?: string | null
): V | null {
  const tags = dictionarySpeechTags(lang, chineseScript);
  const primary = tags[tags.length - 1];
  const candidates = voices.filter((voice) => {
    const tag = normalizeVoiceLanguage(voice.lang);
    return tag === primary || tag.startsWith(`${primary}-`);
  });
  if (candidates.length === 0) return null;

  if (preferredVoiceURI) {
    const preferred = candidates.find((voice) => voice.voiceURI === preferredVoiceURI);
    if (preferred) return preferred;
  }
  for (const tag of tags) {
    const match = bestVoice(
      candidates.filter((voice) => normalizeVoiceLanguage(voice.lang) === tag)
    );
    if (match) return match;
  }
  return bestVoice(candidates);
}

/** What to read for a headword: kana for Japanese so kanji aren't misread. */
export function headwordSpeechText(
  entry: DictionaryEntry,
  chineseScript: DictionaryChineseScript
): string {
  if (entry.lang === "zh") return displayChineseHeadword(entry, chineseScript);
  if (entry.lang === "ja") return entry.reading || entry.headword;
  return entry.headword;
}
