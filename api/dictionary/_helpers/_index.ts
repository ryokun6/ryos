import type {
  DictionaryEntry,
  DictionaryLanguage,
  DictionaryPhrase,
} from "../../../src/shared/dictionary.js";
import {
  HeadwordPrefixIndex,
  readPostings,
  type PostingList,
} from "./_prefix.js";

export type { PostingList } from "./_prefix.js";

export interface DictionaryIndexOptions {
  /** Prebuilt parts. Skips parsing `entries`. */
  restore?: DictionaryIndexRestore;
  /** Extra keys (besides headword) that should resolve to the entry. */
  headwordKeys?: (entry: DictionaryEntry) => string[];
  /** Normalized phonetic keys (toneless pinyin, hiragana). */
  readingKeys?: (entry: DictionaryEntry) => string[];
  /** Lower rank sorts first (0-255). */
  rank?: (entry: DictionaryEntry) => number;
  /**
   * Index gloss text for reverse lookup. English WordNet glosses are full
   * sentences, so that index is skipped there; synonyms come from synsets.
   */
  indexGlosses?: boolean;
  /** Compact row encoding; defaults to JSON. */
  serialize?: (entry: DictionaryEntry) => string;
  materialize?: (row: string) => DictionaryEntry;
  /** `cedict` rows round-trip through `formatCedictLine`. */
  rowEncoding?: "json" | "cedict";
  /**
   * Build the infix suffix array used by compound phrases. WordNet never
   * lists compounds, so English skips it and builds lazily if asked.
   */
  compounds?: boolean;
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

export interface DictionaryIndexParts {
  lang: DictionaryLanguage;
  rowEncoding: "json" | "cedict";
  rows: string[];
  ranks: Uint8Array;
  headwords: string[];
  headKeys: string[];
  headPostings: PostingList[];
  readings: [string, PostingList][];
  glosses: [string, PostingList][];
  suffixKey: Uint32Array | null;
  suffixOffset: Uint32Array | null;
}

export interface DictionaryIndexRestore extends DictionaryIndexParts {
  materialize: (row: string) => DictionaryEntry;
}

/**
 * In-memory lookup index over one dictionary. Entries are kept as compact
 * serialized rows (raw CC-CEDICT lines / minimal JSON) and materialized on
 * demand so ~120k-entry datasets stay at tens of MB instead of hundreds.
 * Every lookup returns fresh objects that callers may mutate.
 *
 * Prefix and infix scans use {@link HeadwordPrefixIndex}. Reading keys stay
 * on a hash map: pinyin and kana lookup is an exact normalized key, not a scan.
 */
export class DictionaryIndex {
  readonly lang: DictionaryLanguage;
  readonly rowEncoding: "json" | "cedict";
  private readonly rows: string[];
  private readonly materializeRow: (row: string) => DictionaryEntry;
  private readonly ranks: Uint8Array;
  private readonly headwords: string[];
  private readonly byHeadword = new Map<string, PostingList>();
  private readonly byReading = new Map<string, PostingList>();
  private readonly byGloss = new Map<string, PostingList>();
  private readonly prefix: HeadwordPrefixIndex;

  constructor(
    lang: DictionaryLanguage,
    entries: Iterable<DictionaryEntry>,
    options: DictionaryIndexOptions = {}
  ) {
    this.lang = lang;
    if (options.restore) {
      const parts = options.restore;
      this.rowEncoding = parts.rowEncoding;
      this.rows = parts.rows;
      this.materializeRow = parts.materialize;
      this.ranks = parts.ranks;
      this.headwords = parts.headwords;
      this.byReading = new Map(parts.readings);
      this.byGloss = new Map(parts.glosses);
      for (let i = 0; i < parts.headKeys.length; i++) {
        this.byHeadword.set(parts.headKeys[i], parts.headPostings[i]);
      }
      this.prefix = HeadwordPrefixIndex.restore(
        parts.headKeys,
        parts.headPostings,
        parts.suffixKey,
        parts.suffixOffset
      );
      return;
    }
    this.rowEncoding = options.rowEncoding ?? "json";
    const serialize = options.serialize ?? ((entry: DictionaryEntry) => JSON.stringify(entry));
    this.materializeRow = options.materialize ?? ((row: string) => JSON.parse(row) as DictionaryEntry);
    this.rows = [];
    this.headwords = [];
    const ranks: number[] = [];
    let index = 0;
    for (const entry of entries) {
      this.rows.push(serialize(entry));
      this.headwords.push(entry.headword);
      ranks.push(Math.min(255, Math.max(0, options.rank?.(entry) ?? 0)));
      const keys = Array.from(new Set([entry.headword, ...(options.headwordKeys?.(entry) ?? [])]));
      for (const key of keys) pushIndex(this.byHeadword, key, index);
      for (const key of options.readingKeys?.(entry) ?? []) pushIndex(this.byReading, key, index);
      if (options.indexGlosses !== false) {
        for (const sense of entry.senses) {
          for (const gloss of sense.glosses) {
            for (const key of glossKeys(gloss)) pushIndex(this.byGloss, key, index);
          }
        }
      }
      index++;
    }
    this.ranks = Uint8Array.from(ranks);
    this.prefix = HeadwordPrefixIndex.fromMap(this.byHeadword, options.compounds !== false);
  }

  static restore(parts: DictionaryIndexRestore): DictionaryIndex {
    return new DictionaryIndex(parts.lang, [], { restore: parts });
  }

  exportParts(): DictionaryIndexParts {
    const suffixes = this.prefix.exportSuffixes();
    return {
      lang: this.lang,
      rowEncoding: this.rowEncoding,
      rows: this.rows,
      ranks: this.ranks,
      headwords: this.headwords,
      headKeys: this.prefix.keys,
      headPostings: this.prefix.keys.map((_, i) => this.prefix.postingsAt(i)),
      readings: Array.from(this.byReading.entries()),
      glosses: Array.from(this.byGloss.entries()),
      suffixKey: suffixes?.key ?? null,
      suffixOffset: suffixes?.offset ?? null,
    };
  }

  get size(): number {
    return this.rows.length;
  }

  entryAt(index: number): DictionaryEntry {
    return this.materializeRow(this.rows[index]);
  }

  private headwordAt(index: number): string {
    return this.headwords[index] ?? "";
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
    return this.sorted(readPostings(this.byHeadword.get(query)));
  }

  lookupReading(key: string): DictionaryEntry[] {
    return this.sorted(readPostings(this.byReading.get(key)));
  }

  /** English → target language ("learn" → 学习, 学, ...). */
  lookupGloss(english: string, limit = 40): DictionaryEntry[] {
    const key = glossKeys(english)[0];
    if (!key) return [];
    return this.sortedIndexes(readPostings(this.byGloss.get(key)))
      .slice(0, limit)
      .map((index) => this.entryAt(index));
  }

  /**
   * Full entries for words that start with `headword` (大 → 大一统, 大丈夫),
   * excluding the headword itself. Shorter, higher-ranked compounds come first.
   */
  findCompoundEntries(headword: string, limit = 40): DictionaryEntry[] {
    if (!headword) return [];
    const matches = this.prefix.prefixCompounds(headword);
    matches.sort(
      (a, b) => this.ranks[a.index] - this.ranks[b.index] || a.length - b.length || a.index - b.index
    );
    const entries: DictionaryEntry[] = [];
    const cap = Math.min(limit, matches.length);
    for (let i = 0; i < cap; i++) entries.push(this.entryAt(matches[i].index));
    return entries;
  }

  /** Words whose written form contains `headword` (compounds, set phrases). */
  findCompounds(headword: string, limit = 12): DictionaryPhrase[] {
    if (!headword) return [];
    const matches = this.prefix.containing(headword);
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
      const hits = readPostings(this.byGloss.get(key));
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
      const matched = this.prefix.longest(chars, i, maxWordLength);
      if (matched > 0) {
        words.push(chars.slice(i, i + matched).join(""));
        i += matched;
      } else {
        i += 1;
      }
    }
    return words;
  }

  /** Headwords starting with `prefix` (autocomplete / "did you mean"). */
  suggest(prefix: string, limit = 8): string[] {
    if (!prefix) return [];
    // The previous scan stopped one past `limit * 20` matches, in insertion order.
    const cap = limit * 20 + 1;
    const results = this.prefix.suggestEntries(prefix, cap);
    return Array.from(
      new Set(
        results
          .sort(
            (a, b) => this.ranks[a] - this.ranks[b] || this.headwordAt(a).length - this.headwordAt(b).length
          )
          .map((index) => this.headwordAt(index))
      )
    ).slice(0, limit);
  }
}
