/**
 * Sorted-key prefix index and suffix array for CJK headwords.
 *
 * Exact lookups stay on the headword hash map. Longest-match segmentation,
 * "starts with" compounds, and autocomplete walk this structure in O(length)
 * or O(log n). Infix compounds (伟大 contains 大) binary-search the suffix array
 * instead of scanning every entry.
 */

export type PostingList = number | number[];

export function readPostings(list: PostingList | undefined): number[] {
  if (list === undefined) return [];
  return typeof list === "number" ? [list] : list;
}

function lowerBound(keys: readonly string[], target: string, lo: number, hi: number): number {
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (keys[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

export class HeadwordPrefixIndex {
  readonly keys: string[];
  private readonly postings: PostingList[];
  /** First entry index for each key — headword-map insertion order. */
  private readonly firstEntry: Uint32Array;
  private suffixKey: Uint32Array | null = null;
  private suffixOffset: Uint32Array | null = null;
  private suffixesReady = false;

  private constructor(keys: string[], postings: PostingList[], firstEntry: Uint32Array) {
    this.keys = keys;
    this.postings = postings;
    this.firstEntry = firstEntry;
  }

  static fromMap(byHeadword: Map<string, PostingList>, buildSuffixes: boolean): HeadwordPrefixIndex {
    const keys = Array.from(byHeadword.keys()).sort();
    const postings = new Array<PostingList>(keys.length);
    const firstEntry = new Uint32Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
      const list = byHeadword.get(keys[i])!;
      postings[i] = list;
      firstEntry[i] = readPostings(list)[0] ?? 0;
    }
    const index = new HeadwordPrefixIndex(keys, postings, firstEntry);
    if (buildSuffixes) index.buildSuffixes();
    return index;
  }

  static restore(
    keys: string[],
    postings: PostingList[],
    suffixKey: Uint32Array | null,
    suffixOffset: Uint32Array | null
  ): HeadwordPrefixIndex {
    const firstEntry = new Uint32Array(keys.length);
    for (let i = 0; i < keys.length; i++) firstEntry[i] = readPostings(postings[i])[0] ?? 0;
    const index = new HeadwordPrefixIndex(keys, postings, firstEntry);
    if (suffixKey && suffixOffset && suffixKey.length === suffixOffset.length) {
      index.suffixKey = suffixKey;
      index.suffixOffset = suffixOffset;
      index.suffixesReady = true;
    }
    return index;
  }

  get size(): number {
    return this.keys.length;
  }

  postingsAt(keyIndex: number): PostingList {
    return this.postings[keyIndex];
  }

  exportSuffixes(): { key: Uint32Array; offset: Uint32Array } | null {
    if (!this.suffixesReady || !this.suffixKey || !this.suffixOffset) return null;
    return { key: this.suffixKey, offset: this.suffixOffset };
  }

  private ensureSuffixes(): void {
    if (!this.suffixesReady) this.buildSuffixes();
  }

  private buildSuffixes(): void {
    let count = 0;
    for (let i = 0; i < this.keys.length; i++) {
      const key = this.keys[i];
      for (let offset = 0; offset < key.length; offset++) {
        if (!isLowSurrogate(key.charCodeAt(offset))) count++;
      }
    }
    const keyIndex = new Uint32Array(count);
    const offset = new Uint32Array(count);
    let cursor = 0;
    for (let i = 0; i < this.keys.length; i++) {
      const key = this.keys[i];
      for (let at = 0; at < key.length; at++) {
        if (isLowSurrogate(key.charCodeAt(at))) continue;
        keyIndex[cursor] = i;
        offset[cursor] = at;
        cursor++;
      }
    }
    const order = new Uint32Array(count);
    for (let i = 0; i < count; i++) order[i] = i;
    const keys = this.keys;
    order.sort((a, b) => {
      const aKey = keys[keyIndex[a]];
      const bKey = keys[keyIndex[b]];
      const ao = offset[a];
      const bo = offset[b];
      const aLen = aKey.length - ao;
      const bLen = bKey.length - bo;
      const n = aLen < bLen ? aLen : bLen;
      for (let c = 0; c < n; c++) {
        const diff = aKey.charCodeAt(ao + c) - bKey.charCodeAt(bo + c);
        if (diff !== 0) return diff;
      }
      return aLen - bLen || a - b;
    });
    const sortedKey = new Uint32Array(count);
    const sortedOffset = new Uint32Array(count);
    for (let i = 0; i < count; i++) {
      const at = order[i];
      sortedKey[i] = keyIndex[at];
      sortedOffset[i] = offset[at];
    }
    this.suffixKey = sortedKey;
    this.suffixOffset = sortedOffset;
    this.suffixesReady = true;
  }

  prefixRange(prefix: string): [number, number] {
    if (!prefix) return [0, 0];
    const start = lowerBound(this.keys, prefix, 0, this.keys.length);
    let lo = start;
    let hi = this.keys.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.keys[mid].startsWith(prefix)) lo = mid + 1;
      else hi = mid;
    }
    return [start, lo];
  }

  /** Code-point length of the longest dictionary key starting at `chars[start]`. */
  longest(chars: readonly string[], start: number, maxLen: number): number {
    const limit = Math.min(maxLen, chars.length - start);
    if (limit <= 0 || this.keys.length === 0) return 0;
    let lo = 0;
    let hi = this.keys.length;
    let best = 0;
    let prefix = "";
    for (let len = 1; len <= limit; len++) {
      prefix += chars[start + len - 1];
      lo = lowerBound(this.keys, prefix, lo, hi);
      if (lo >= hi || !this.keys[lo].startsWith(prefix)) return best;
      if (this.keys[lo] === prefix) best = len;
      let end = hi;
      let scan = lo;
      while (scan < end) {
        const mid = (scan + end) >>> 1;
        if (this.keys[mid].startsWith(prefix)) scan = mid + 1;
        else end = mid;
      }
      hi = end;
      if (lo >= hi) return best;
    }
    return best;
  }

  exactPostings(key: string): number[] {
    const at = lowerBound(this.keys, key, 0, this.keys.length);
    if (at >= this.keys.length || this.keys[at] !== key) return [];
    return readPostings(this.postings[at]);
  }

  /**
   * Entries whose keys start with `prefix` but are not exactly `prefix`,
   * excluding entries that also have the exact key. `length` is the shortest
   * matching key in code points.
   */
  prefixCompounds(prefix: string): { index: number; length: number }[] {
    const [lo, hi] = this.prefixRange(prefix);
    if (lo === hi) return [];
    const exact = new Set(this.exactPostings(prefix));
    const best = new Map<number, number>();
    for (let i = lo; i < hi; i++) {
      const key = this.keys[i];
      if (key === prefix) continue;
      const length = Array.from(key).length;
      const list = readPostings(this.postings[i]);
      for (let p = 0; p < list.length; p++) {
        const index = list[p];
        if (exact.has(index)) continue;
        const prev = best.get(index);
        if (prev === undefined || length < prev) best.set(index, length);
      }
    }
    const matches = new Array<{ index: number; length: number }>(best.size);
    let n = 0;
    for (const [index, length] of best) matches[n++] = { index, length };
    return matches;
  }

  /** Entries whose keys contain `needle`, excluding entries that have it as a whole key. */
  containing(needle: string): number[] {
    if (!needle) return [];
    this.ensureSuffixes();
    const suffixKey = this.suffixKey;
    const suffixOffset = this.suffixOffset;
    if (!suffixKey || !suffixOffset || suffixKey.length === 0) return [];
    const exact = new Set(this.exactPostings(needle));
    const lo = this.suffixLower(needle, suffixKey, suffixOffset);
    const hi = this.suffixUpper(needle, lo, suffixKey, suffixOffset);
    const seen = new Set<number>();
    const matches: number[] = [];
    for (let i = lo; i < hi; i++) {
      const list = readPostings(this.postings[suffixKey[i]]);
      for (let p = 0; p < list.length; p++) {
        const index = list[p];
        if (exact.has(index) || seen.has(index)) continue;
        seen.add(index);
        matches.push(index);
      }
    }
    return matches;
  }

  /**
   * First `cap` headword hits in map-insertion order (smallest first entry),
   * matching the old scan's early break.
   */
  suggestEntries(prefix: string, cap: number): number[] {
    const [lo, hi] = this.prefixRange(prefix);
    if (lo === hi || cap <= 0) return [];
    const hits: { entry: number; first: number }[] = [];
    for (let i = lo; i < hi; i++) {
      if (this.keys[i] === prefix) continue;
      const entry = readPostings(this.postings[i])[0];
      if (entry === undefined) continue;
      hits.push({ entry, first: this.firstEntry[i] });
    }
    hits.sort((a, b) => a.first - b.first || a.entry - b.entry);
    const take = hits.length < cap ? hits.length : cap;
    const out = new Array<number>(take);
    for (let i = 0; i < take; i++) out[i] = hits[i].entry;
    return out;
  }

  private suffixStarts(index: number, needle: string, suffixKey: Uint32Array, suffixOffset: Uint32Array): boolean {
    const key = this.keys[suffixKey[index]];
    const offset = suffixOffset[index];
    if (key.length - offset < needle.length) return false;
    for (let c = 0; c < needle.length; c++) {
      if (key.charCodeAt(offset + c) !== needle.charCodeAt(c)) return false;
    }
    return true;
  }

  private suffixCompare(index: number, needle: string, suffixKey: Uint32Array, suffixOffset: Uint32Array): number {
    const key = this.keys[suffixKey[index]];
    const offset = suffixOffset[index];
    const aLen = key.length - offset;
    const n = aLen < needle.length ? aLen : needle.length;
    for (let c = 0; c < n; c++) {
      const diff = key.charCodeAt(offset + c) - needle.charCodeAt(c);
      if (diff !== 0) return diff;
    }
    return aLen - needle.length;
  }

  private suffixLower(needle: string, suffixKey: Uint32Array, suffixOffset: Uint32Array): number {
    let lo = 0;
    let hi = suffixKey.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.suffixCompare(mid, needle, suffixKey, suffixOffset) < 0) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private suffixUpper(needle: string, start: number, suffixKey: Uint32Array, suffixOffset: Uint32Array): number {
    let lo = start;
    let hi = suffixKey.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.suffixStarts(mid, needle, suffixKey, suffixOffset)) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
