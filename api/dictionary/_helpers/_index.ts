import type {
  DictionaryEntry,
  DictionaryLanguage,
  DictionaryPhrase,
} from "../../../src/shared/dictionary.js";

export interface DictionaryIndexOptions {
  /** Extra keys (besides headword) that should resolve to the entry. */
  headwordKeys?: (entry: DictionaryEntry) => string[];
  /** Normalized phonetic keys (toneless pinyin, hiragana). */
  readingKeys?: (entry: DictionaryEntry) => string[];
  /** Lower rank sorts first (0-255). */
  rank?: (entry: DictionaryEntry) => number;
  /** Compact row encoding; defaults to JSON. */
  serialize?: (entry: DictionaryEntry) => string;
  materialize?: (row: string) => DictionaryEntry;
}

const NON_MEANING_GLOSS_RE =
  /^(variant of|old variant of|archaic variant of|see |see also|surname |abbr\. for|used in |japanese variant of|erhua variant of|cl:)/i;

/**
 * Turn a gloss item into reverse-lookup keys: "to learn; to study" →
 * ["learn", "study"]. Parentheticals and leading "to " are dropped; only
 * short phrases are kept so "similar words" means a real shared meaning.
 */
export function glossKeys(gloss: string): string[] {
  if (NON_MEANING_GLOSS_RE.test(gloss.trim())) return [];
  const keys: string[] = [];
  for (const part of gloss.split(/[;,]/)) {
    const key = part
      .replace(/\([^)]*\)/g, " ")
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/^\s*(to|a|an|the)\s+/i, "")
      .replace(/[.!?"]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (key && key.split(" ").length <= 3 && key.length <= 40) keys.push(key);
  }
  return keys;
}

type PostingList = number | number[];

function pushIndex(map: Map<string, PostingList>, key: string, index: number) {
  if (!key) return;
  const list = map.get(key);
  if (list === undefined) {
    map.set(key, index);
  } else if (typeof list === "number") {
    if (list !== index) map.set(key, [list, index]);
  } else if (list[list.length - 1] !== index) {
    list.push(index);
  }
}

function postings(list: PostingList | undefined): number[] {
  if (list === undefined) return [];
  return typeof list === "number" ? [list] : list;
}

const KEY_SEPARATOR = "\u0001";

export function firstGloss(entry: DictionaryEntry): string {
  return entry.senses[0]?.glosses.slice(0, 2).join("; ") ?? "";
}

export function toPhrase(entry: DictionaryEntry): DictionaryPhrase {
  const phrase: DictionaryPhrase = {
    headword: entry.headword,
    gloss: firstGloss(entry),
    lang: entry.lang,
  };
  if (entry.reading) phrase.reading = entry.reading;
  if (entry.traditional) phrase.traditional = entry.traditional;
  if (entry.simplified) phrase.simplified = entry.simplified;
  return phrase;
}

/**
 * In-memory lookup index over one dictionary. Entries are kept as compact
 * serialized rows (raw CC-CEDICT lines / minimal JSON) and materialized on
 * demand so ~120k-entry datasets stay at tens of MB instead of hundreds.
 * Every lookup returns fresh objects that callers may mutate.
 */
export class DictionaryIndex {
  readonly lang: DictionaryLanguage;
  private readonly rows: string[];
  private readonly materializeRow: (row: string) => DictionaryEntry;
  private readonly ranks: Uint8Array;
  private readonly keyStrings: string[];
  private readonly byHeadword = new Map<string, PostingList>();
  private readonly byReading = new Map<string, PostingList>();
  private readonly byGloss = new Map<string, PostingList>();

  constructor(
    lang: DictionaryLanguage,
    entries: Iterable<DictionaryEntry>,
    options: DictionaryIndexOptions = {}
  ) {
    this.lang = lang;
    const serialize = options.serialize ?? ((entry: DictionaryEntry) => JSON.stringify(entry));
    this.materializeRow = options.materialize ?? ((row: string) => JSON.parse(row) as DictionaryEntry);
    this.rows = [];
    this.keyStrings = [];
    const ranks: number[] = [];
    let index = 0;
    for (const entry of entries) {
      this.rows.push(serialize(entry));
      ranks.push(Math.min(255, Math.max(0, options.rank?.(entry) ?? 0)));
      const keys = Array.from(new Set([entry.headword, ...(options.headwordKeys?.(entry) ?? [])]));
      this.keyStrings.push(keys.join(KEY_SEPARATOR));
      for (const key of keys) pushIndex(this.byHeadword, key, index);
      for (const key of options.readingKeys?.(entry) ?? []) pushIndex(this.byReading, key, index);
      for (const sense of entry.senses) {
        for (const gloss of sense.glosses) {
          for (const key of glossKeys(gloss)) pushIndex(this.byGloss, key, index);
        }
      }
      index++;
    }
    this.ranks = Uint8Array.from(ranks);
  }

  get size(): number {
    return this.rows.length;
  }

  entryAt(index: number): DictionaryEntry {
    return this.materializeRow(this.rows[index]);
  }

  private headwordAt(index: number): string {
    const keys = this.keyStrings[index];
    const separator = keys.indexOf(KEY_SEPARATOR);
    return separator === -1 ? keys : keys.slice(0, separator);
  }

  private sortedIndexes(indexes: Iterable<number>): number[] {
    return Array.from(new Set(indexes)).sort((a, b) => this.ranks[a] - this.ranks[b] || a - b);
  }

  private sorted(indexes: Iterable<number>): DictionaryEntry[] {
    return this.sortedIndexes(indexes).map((index) => this.entryAt(index));
  }

  hasHeadword(query: string): boolean {
    return this.byHeadword.has(query);
  }

  lookupHeadword(query: string): DictionaryEntry[] {
    return this.sorted(postings(this.byHeadword.get(query)));
  }

  lookupReading(key: string): DictionaryEntry[] {
    return this.sorted(postings(this.byReading.get(key)));
  }

  /** English → target language ("learn" → 学习, 学, ...). */
  lookupGloss(english: string, limit = 40): DictionaryEntry[] {
    const key = glossKeys(english)[0];
    if (!key) return [];
    return this.sortedIndexes(postings(this.byGloss.get(key)))
      .slice(0, limit)
      .map((index) => this.entryAt(index));
  }

  /**
   * Full entries for words that start with `headword` (大 → 大一统, 大丈夫),
   * excluding the headword itself. Shorter, higher-ranked compounds come first.
   */
  findCompoundEntries(headword: string, limit = 40): DictionaryEntry[] {
    if (!headword) return [];
    const matches: { index: number; length: number }[] = [];
    for (let index = 0; index < this.keyStrings.length; index++) {
      const keys = this.keyStrings[index].split(KEY_SEPARATOR);
      if (keys.some((key) => key === headword)) continue;
      let length = 0;
      for (const key of keys) {
        if (!key.startsWith(headword)) continue;
        const keyLength = Array.from(key).length;
        if (length === 0 || keyLength < length) length = keyLength;
      }
      if (length === 0) continue;
      matches.push({ index, length });
    }
    matches.sort(
      (a, b) =>
        this.ranks[a.index] - this.ranks[b.index] || a.length - b.length || a.index - b.index
    );
    const entries: DictionaryEntry[] = [];
    for (const { index } of matches) {
      entries.push(this.entryAt(index));
      if (entries.length >= limit) break;
    }
    return entries;
  }

  /** Words whose written form contains `headword` (compounds, set phrases). */
  findCompounds(headword: string, limit = 12): DictionaryPhrase[] {
    if (!headword) return [];
    const exact = `${KEY_SEPARATOR}${headword}${KEY_SEPARATOR}`;
    const matches: number[] = [];
    for (let index = 0; index < this.keyStrings.length; index++) {
      const keys = this.keyStrings[index];
      if (!keys.includes(headword)) continue;
      if (`${KEY_SEPARATOR}${keys}${KEY_SEPARATOR}`.includes(exact)) continue;
      matches.push(index);
    }
    matches.sort((a, b) => {
      const aw = this.headwordAt(a);
      const bw = this.headwordAt(b);
      const aStarts = aw.startsWith(headword) ? 0 : 1;
      const bStarts = bw.startsWith(headword) ? 0 : 1;
      return this.ranks[a] - this.ranks[b] || aStarts - bStarts || aw.length - bw.length || a - b;
    });
    const seen = new Set<string>();
    const phrases: DictionaryPhrase[] = [];
    for (const index of matches) {
      const word = this.headwordAt(index);
      if (seen.has(word)) continue;
      seen.add(word);
      phrases.push(toPhrase(this.entryAt(index)));
      if (phrases.length >= limit) break;
    }
    return phrases;
  }

  /** Entries sharing a meaning with `entry` (used as CJK synonyms). */
  findSimilar(entry: DictionaryEntry, limit = 10): DictionaryPhrase[] {
    const scores = new Map<number, number>();
    const keys = new Set((entry.senses[0]?.glosses ?? []).flatMap((gloss) => glossKeys(gloss)));
    for (const key of keys) {
      const hits = postings(this.byGloss.get(key));
      if (hits.length > 200) continue;
      for (const index of hits) scores.set(index, (scores.get(index) ?? 0) + 1);
    }
    const seen = new Set<string>([entry.headword, entry.traditional ?? "", entry.simplified ?? ""]);
    const phrases: DictionaryPhrase[] = [];
    const ranked = Array.from(scores.entries()).sort(
      (a, b) => b[1] - a[1] || this.ranks[a[0]] - this.ranks[b[0]] || a[0] - b[0]
    );
    for (const [index] of ranked) {
      const candidate = this.entryAt(index);
      if (seen.has(candidate.headword) || (candidate.traditional && seen.has(candidate.traditional))) continue;
      seen.add(candidate.headword);
      phrases.push(toPhrase(candidate));
      if (phrases.length >= limit) break;
    }
    return phrases;
  }

  /**
   * Greedy longest-match segmentation for phrases/sentences that have no
   * exact entry: 我想学习中文 → 我 / 想 / 学习 / 中文.
   */
  segment(text: string, maxWordLength = 8): string[] {
    const chars = Array.from(text);
    const words: string[] = [];
    let i = 0;
    while (i < chars.length) {
      let matched = "";
      for (let length = Math.min(maxWordLength, chars.length - i); length >= 1; length--) {
        const candidate = chars.slice(i, i + length).join("");
        if (this.byHeadword.has(candidate)) {
          matched = candidate;
          break;
        }
      }
      if (matched) {
        words.push(matched);
        i += Array.from(matched).length;
      } else {
        i += 1;
      }
    }
    return words;
  }

  /** Headwords starting with `prefix` (autocomplete / "did you mean"). */
  suggest(prefix: string, limit = 8): string[] {
    if (!prefix) return [];
    const results: number[] = [];
    for (const [key, list] of this.byHeadword) {
      if (key !== prefix && key.startsWith(prefix)) results.push(postings(list)[0]);
      if (results.length > limit * 20) break;
    }
    return Array.from(
      new Set(
        results
          .sort((a, b) => this.ranks[a] - this.ranks[b] || this.headwordAt(a).length - this.headwordAt(b).length)
          .map((index) => this.headwordAt(index))
      )
    ).slice(0, limit);
  }
}
