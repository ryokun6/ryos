import type { DictionaryEntry, DictionaryHanziInfo } from "../../../src/shared/dictionary.js";
import { normalizePinyinSearchKey } from "../../../src/utils/zhuyin.js";
import type { DictionaryIndex } from "./_index.js";

const HAN_CHAR_RE = /^[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]$/u;
const NON_CHARACTER_GLOSS_RE =
  /^(variant of|old variant of|archaic variant of|see |see also|surname |abbr\.|used in |japanese variant|erhua variant)/i;
const MAX_HANZI_CARDS = 12;
const MAX_MEANING_LENGTH = 56;

function isHanChar(value: string | undefined): value is string {
  return typeof value === "string" && HAN_CHAR_RE.test(value);
}

function charsOf(text: string | undefined): string[] {
  return text ? Array.from(text) : [];
}

/** First useful CC-CEDICT gloss, shortened for a character card. */
export function shortHanziMeaning(entry: DictionaryEntry): string | undefined {
  const glosses = entry.senses.flatMap((sense) => sense.glosses);
  const preferred = glosses.find((gloss) => !NON_CHARACTER_GLOSS_RE.test(gloss.trim())) ?? glosses[0];
  if (!preferred) return undefined;
  const cleaned = preferred
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const clause = cleaned.split(";")[0]?.trim() ?? "";
  if (!clause) return undefined;
  return clause.length > MAX_MEANING_LENGTH
    ? `${clause.slice(0, MAX_MEANING_LENGTH - 1).trimEnd()}…`
    : clause;
}

function singleCharacterHits(index: DictionaryIndex, char: string): DictionaryEntry[] {
  if (!isHanChar(char)) return [];
  return index.lookupHeadword(char).filter((entry) => {
    const simplified = entry.simplified ?? entry.headword;
    const traditional = entry.traditional ?? simplified;
    return isHanChar(simplified) && isHanChar(traditional);
  });
}

/**
 * Attach per-character CC-CEDICT cards to Chinese entries. Readings follow the
 * word when the pinyin lines up with the characters; the gloss prefers the
 * single-character row with that reading (行 is háng in 银行, xíng alone).
 */
export function attachChineseHanzi(entries: DictionaryEntry[], index: DictionaryIndex): void {
  const cache = new Map<string, DictionaryEntry[]>();
  const hitsFor = (char: string) => {
    let hits = cache.get(char);
    if (!hits) {
      hits = singleCharacterHits(index, char);
      cache.set(char, hits);
    }
    return hits;
  };

  for (const entry of entries) {
    if (entry.lang !== "zh") continue;
    const simplified = charsOf(entry.simplified ?? entry.headword);
    const traditional = charsOf(entry.traditional ?? entry.simplified ?? entry.headword);
    const head = charsOf(entry.headword);
    const alignedScripts = simplified.length > 0 && simplified.length === traditional.length;
    const sequence = alignedScripts ? simplified : head;
    const tokens = entry.reading?.trim().split(/\s+/).filter(Boolean) ?? [];
    const alignedReading = tokens.length === sequence.length;
    const cards: DictionaryHanziInfo[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < sequence.length && cards.length < MAX_HANZI_CARDS; i++) {
      const simp = alignedScripts ? simplified[i] : sequence[i];
      const trad = alignedScripts ? traditional[i] : sequence[i];
      if (!isHanChar(simp) && !isHanChar(trad)) continue;
      const key = `${trad}:${simp}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const pool = hitsFor(simp);
      const extra = trad !== simp ? hitsFor(trad) : [];
      const unique: DictionaryEntry[] = [];
      const ids = new Set<string>();
      for (const hit of [...pool, ...extra]) {
        if (ids.has(hit.id)) continue;
        ids.add(hit.id);
        unique.push(hit);
      }

      const token = alignedReading ? tokens[i] : undefined;
      const tokenKey = token ? normalizePinyinSearchKey(token) : "";
      const matched = tokenKey
        ? unique.find((hit) => hit.reading && normalizePinyinSearchKey(hit.reading) === tokenKey)
        : undefined;
      const chosen = matched ?? unique[0];
      const chosenSimplified = chosen?.simplified ?? chosen?.headword;
      const chosenTraditional = chosen?.traditional ?? chosenSimplified;
      const card: DictionaryHanziInfo = {
        simplified: isHanChar(chosenSimplified) ? chosenSimplified : simp,
        traditional: isHanChar(chosenTraditional) ? chosenTraditional : trad,
      };
      if (token) card.reading = token;
      else if (chosen?.reading) card.reading = chosen.reading.split(/\s+/)[0];
      const meaning = chosen ? shortHanziMeaning(chosen) : undefined;
      if (meaning) card.meaning = meaning;
      cards.push(card);
    }

    if (cards.length) entry.hanzi = cards;
  }
}
