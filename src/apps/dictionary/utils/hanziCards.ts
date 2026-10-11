import type { DictionaryEntry, DictionaryHanziInfo } from "@/shared/dictionary";
import type { DictionaryChineseScript } from "@/stores/useDictionaryStore";
import {
  numberedPinyinSyllableToToneMarks,
  numberedPinyinSyllableToZhuyin,
} from "@/utils/zhuyin";
import { formatChineseReading } from "./phonetics";

const HAN_CHAR_RE = /^[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]$/u;
const MAX_HANZI_CARDS = 12;

function isHanChar(value: string | undefined): value is string {
  return typeof value === "string" && HAN_CHAR_RE.test(value);
}

function isHanziCard(value: DictionaryHanziInfo): boolean {
  return isHanChar(value.simplified) && isHanChar(value.traditional);
}

/** Cards from the headword when the lookup did not attach CC-CEDICT rows. */
function deriveHanziCards(entry: DictionaryEntry): DictionaryHanziInfo[] {
  const simplified = Array.from(entry.simplified ?? entry.headword);
  const traditional = Array.from(entry.traditional ?? entry.simplified ?? entry.headword);
  const aligned = simplified.length > 0 && simplified.length === traditional.length;
  const sequence = aligned ? simplified : Array.from(entry.headword);
  const tokens = entry.reading?.trim().split(/\s+/).filter(Boolean) ?? [];
  const alignedReading = tokens.length === sequence.length;
  const cards: DictionaryHanziInfo[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < sequence.length && cards.length < MAX_HANZI_CARDS; i++) {
    const simp = aligned ? simplified[i] : sequence[i];
    const trad = aligned ? traditional[i] : sequence[i];
    if (!isHanChar(simp) && !isHanChar(trad)) continue;
    const key = `${trad}:${simp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const card: DictionaryHanziInfo = {
      simplified: isHanChar(simp) ? simp : trad,
      traditional: isHanChar(trad) ? trad : simp,
    };
    if (alignedReading && tokens[i]) card.reading = tokens[i];
    cards.push(card);
  }
  return cards;
}

/** Per-character cards for a Chinese result. Japanese entries return none. */
export function hanziCardsForEntry(entry: DictionaryEntry): DictionaryHanziInfo[] {
  if (entry.lang !== "zh") return [];
  const provided = entry.hanzi?.filter(isHanziCard) ?? [];
  if (provided.length) return provided.slice(0, MAX_HANZI_CARDS);
  return deriveHanziCards(entry);
}

export function hanziCardGlyph(card: DictionaryHanziInfo, script: DictionaryChineseScript): string {
  const glyph = script === "traditional" ? card.traditional : card.simplified;
  return glyph || card.simplified || card.traditional;
}

/** The other script, when it differs from the glyph being shown. */
export function hanziCardVariant(
  card: DictionaryHanziInfo,
  script: DictionaryChineseScript
): string | null {
  const shown = hanziCardGlyph(card, script);
  const other = script === "traditional" ? card.simplified : card.traditional;
  return other && other !== shown ? other : null;
}

export function hanziCardReadings(
  card: DictionaryHanziInfo,
  phonetics: { pinyin: boolean; zhuyin: boolean }
): { pinyin: string | null; zhuyin: string | null } {
  const reading = card.reading?.trim();
  if (!reading) return { pinyin: null, zhuyin: null };
  const format = (system: "pinyin" | "zhuyin") =>
    reading.includes(" ")
      ? formatChineseReading(reading, system)
      : system === "zhuyin"
        ? numberedPinyinSyllableToZhuyin(reading)
        : numberedPinyinSyllableToToneMarks(reading);
  return {
    pinyin: phonetics.pinyin ? format("pinyin") : null,
    zhuyin: phonetics.zhuyin ? format("zhuyin") : null,
  };
}
