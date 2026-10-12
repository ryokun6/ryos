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

const VARIANT_OF_RE = /(?:^|\()(?:old |archaic )?variant of ([^\s[|),]+)/gi;

function isVariantRow(entry: DictionaryEntry): boolean {
  return entry.senses.some((sense) =>
    sense.glosses.some((gloss) => gloss.trim().match(VARIANT_OF_RE) !== null)
  );
}

/**
 * A row whose traditional form is only a variant spelling of its own
 * simplified character (荳 豆 "variant of 豆", 攷 考 "variant of 考"). The
 * standard traditional form is the simplified character itself.
 */
export function isTraditionalVariantRow(entry: DictionaryEntry): boolean {
  const simplified = entry.simplified ?? entry.headword;
  const traditional = entry.traditional ?? simplified;
  if (traditional === simplified) return false;
  return entry.senses.some((sense) =>
    sense.glosses.some((gloss) =>
      Array.from(gloss.matchAll(VARIANT_OF_RE)).some((match) => match[1] === simplified)
    )
  );
}

function tonedPinyinKey(syllable: string): string {
  return syllable.trim().toLowerCase().replaceAll("u:", "v").replaceAll("ü", "v");
}

/** Neutral tone (le5) or no tone digit: the word's syllable, not the character's. */
function isNeutralToneSyllable(syllable: string): boolean {
  return !/[1-4]$/.test(syllable.trim());
}

/**
 * Best single-character row for the reading and gloss. Rows spelled exactly
 * like the word come first, so 豆 in 豆腐 uses 豆/豆 rather than the 荳/豆
 * variant row; then the same toned syllable (hao4 in 爱好), the same
 * syllable in any tone (fu5 → fu3 in 豆腐), then non-variant glosses.
 */
function pickHanziRow(
  hits: DictionaryEntry[],
  simp: string,
  trad: string,
  token: string | undefined
): DictionaryEntry | undefined {
  const tokenKey = token ? normalizePinyinSearchKey(token) : "";
  const tonedKey = token ? tonedPinyinKey(token) : "";
  let best: DictionaryEntry | undefined;
  let bestScore = -1;
  for (const hit of hits) {
    const hitSimplified = hit.simplified ?? hit.headword;
    const hitTraditional = hit.traditional ?? hitSimplified;
    const hitReading = hit.reading?.trim() ?? "";
    let score = 0;
    if (hitSimplified === simp && hitTraditional === trad) score += 8;
    if (tonedKey && hitReading && tonedPinyinKey(hitReading) === tonedKey) score += 4;
    if (tokenKey && hitReading && normalizePinyinSearchKey(hitReading) === tokenKey) score += 2;
    if (!isVariantRow(hit)) score += 1;
    if (score > bestScore) {
      best = hit;
      bestScore = score;
    }
  }
  return best;
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
      const chosen = pickHanziRow(unique, simp, trad, token);
      const rowSyllable = chosen?.reading?.trim().split(/\s+/)[0];
      // The glyphs come from the word, never the row: a row's other script can
      // be a variant (荳 for 豆, 裡 for 里 in 公里) that the word does not use.
      const card: DictionaryHanziInfo = {
        simplified: isHanChar(simp) ? simp : trad,
        traditional: isHanChar(trad) ? trad : simp,
      };
      // 行 keeps the word's háng in 银行, but 腐 in 豆腐 (fu5) is fǔ on its own.
      const ownReading =
        token &&
        rowSyllable &&
        isNeutralToneSyllable(token) &&
        normalizePinyinSearchKey(rowSyllable) === normalizePinyinSearchKey(token)
          ? rowSyllable
          : undefined;
      if (ownReading) card.reading = ownReading;
      else if (token) card.reading = token;
      else if (rowSyllable) card.reading = rowSyllable;
      const meaning = chosen ? shortHanziMeaning(chosen) : undefined;
      if (meaning) card.meaning = meaning;
      cards.push(card);
    }

    if (cards.length) entry.hanzi = cards;
  }
}
