/**
 * Collapse dictionary rows that are the same word into one entry.
 * Korean lookups used to prepend a Wiktionary row under the kengdic row;
 * enrichment now folds into the entry already on screen.
 */
import type {
  DictionaryEntry,
  DictionaryExample,
  DictionaryHanziInfo,
  DictionaryKanjiInfo,
  DictionaryLookupResponse,
  DictionarySense,
  DictionarySource,
} from "./dictionary";

const LOCAL_SOURCES = new Set<DictionarySource>(["kengdic", "cc-cedict", "jmdict", "wordnet"]);
const MAX_EXAMPLES = 6;

function headKey(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function fieldKey(value: string | undefined, foldCase: boolean): string | null {
  if (!value) return null;
  const normalized = value.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return foldCase ? normalized.toLowerCase() : normalized;
}

/** Case, whitespace, and light punctuation differences count as the same gloss. */
export function dictionaryGlossKey(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:a|an|the|to)\s+/, "");
}

function isNearDuplicateGloss(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length < 3) return false;
  return longer.startsWith(`${shorter} `);
}

function glossesMatch(left: string, right: string): boolean {
  const a = dictionaryGlossKey(left);
  const b = dictionaryGlossKey(right);
  return isNearDuplicateGloss(a, b);
}

function entryRichness(entry: DictionaryEntry): number {
  let score = 0;
  for (const sense of entry.senses) {
    score += 2;
    if (sense.partOfSpeech) score += 2;
    for (const gloss of sense.glosses) score += 2 + Math.min(gloss.length, 120) / 30;
    score += (sense.examples?.length ?? 0) * 3;
    score += sense.notes?.length ?? 0;
  }
  if (entry.hanja) score += 1;
  if (entry.reading) score += 1;
  if (entry.ipa) score += 1;
  if (entry.audioUrl) score += 1;
  score += entry.synonyms?.length ?? 0;
  return score;
}

function firstFilled(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    if (value && value.trim()) return value;
  }
  return undefined;
}

function preferredSource(anchor: DictionaryEntry, extra: DictionaryEntry): DictionarySource {
  if (LOCAL_SOURCES.has(anchor.source)) return anchor.source;
  if (LOCAL_SOURCES.has(extra.source)) return extra.source;
  return anchor.source;
}

function unionText(...groups: (readonly string[] | undefined)[]): string[] | undefined {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const value of group ?? []) {
      const key = dictionaryGlossKey(value) || headKey(value);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(value);
    }
  }
  return out.length ? out : undefined;
}

function mergeExamples(
  primary: DictionaryExample[] | undefined,
  extra: DictionaryExample[] | undefined
): DictionaryExample[] | undefined {
  const out: DictionaryExample[] = [];
  const seen = new Set<string>();
  for (const example of [...(primary ?? []), ...(extra ?? [])]) {
    const key = dictionaryGlossKey(example.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(example);
    if (out.length >= MAX_EXAMPLES) break;
  }
  return out.length ? out : undefined;
}

function glossAlreadyPresent(senses: DictionarySense[], gloss: string): boolean {
  return senses.some((sense) => sense.glosses.some((existing) => glossesMatch(existing, gloss)));
}

function cloneSense(sense: DictionarySense): DictionarySense {
  return {
    ...sense,
    glosses: sense.glosses.slice(),
    ...(sense.examples ? { examples: sense.examples.slice() } : {}),
    ...(sense.notes ? { notes: sense.notes.slice() } : {}),
    ...(sense.synonyms ? { synonyms: sense.synonyms.slice() } : {}),
    ...(sense.antonyms ? { antonyms: sense.antonyms.slice() } : {}),
  };
}

function mergeSenses(primary: DictionarySense[], secondary: DictionarySense[]): DictionarySense[] {
  const senses = primary.map(cloneSense);
  for (const extra of secondary) {
    const pos = extra.partOfSpeech?.trim();
    let targetIndex = -1;
    if (pos) {
      const posKey = dictionaryGlossKey(pos);
      targetIndex = senses.findIndex(
        (sense) => sense.partOfSpeech && dictionaryGlossKey(sense.partOfSpeech) === posKey
      );
    }
    if (targetIndex < 0) {
      targetIndex = senses.findIndex((sense) =>
        sense.glosses.some((gloss) => extra.glosses.some((candidate) => glossesMatch(gloss, candidate)))
      );
    }

    if (targetIndex < 0) {
      const novel = extra.glosses.filter((gloss) => !glossAlreadyPresent(senses, gloss));
      if (!novel.length) {
        if (senses[0] && extra.examples?.length) {
          const examples = mergeExamples(senses[0].examples, extra.examples);
          if (examples) senses[0].examples = examples;
        }
        continue;
      }
      const created: DictionarySense = { glosses: novel };
      if (pos) created.partOfSpeech = pos;
      const examples = mergeExamples(undefined, extra.examples);
      if (examples) created.examples = examples;
      const notes = unionText(extra.notes);
      if (notes) created.notes = notes;
      const synonyms = unionText(extra.synonyms);
      if (synonyms) created.synonyms = synonyms;
      const antonyms = unionText(extra.antonyms);
      if (antonyms) created.antonyms = antonyms;
      senses.push(created);
      continue;
    }

    const target = senses[targetIndex];
    if (!target.partOfSpeech && pos) target.partOfSpeech = pos;
    for (const gloss of extra.glosses) {
      if (!glossAlreadyPresent(senses, gloss)) target.glosses.push(gloss);
    }
    const examples = mergeExamples(target.examples, extra.examples);
    if (examples) target.examples = examples;
    else delete target.examples;
    const notes = unionText(target.notes, extra.notes);
    if (notes) target.notes = notes;
    else delete target.notes;
    const synonyms = unionText(target.synonyms, extra.synonyms);
    if (synonyms) target.synonyms = synonyms;
    else delete target.synonyms;
    const antonyms = unionText(target.antonyms, extra.antonyms);
    if (antonyms) target.antonyms = antonyms;
    else delete target.antonyms;
  }
  return senses.filter((sense) => sense.glosses.length > 0);
}

function unionKanji(
  primary: DictionaryKanjiInfo[] | undefined,
  extra: DictionaryKanjiInfo[] | undefined
): DictionaryKanjiInfo[] | undefined {
  if (!primary?.length && !extra?.length) return undefined;
  const out: DictionaryKanjiInfo[] = [];
  const seen = new Set<string>();
  for (const info of [...(primary ?? []), ...(extra ?? [])]) {
    if (seen.has(info.literal)) continue;
    seen.add(info.literal);
    out.push(info);
  }
  return out.length ? out : undefined;
}

function unionHanzi(
  primary: DictionaryHanziInfo[] | undefined,
  extra: DictionaryHanziInfo[] | undefined
): DictionaryHanziInfo[] | undefined {
  if (!primary?.length && !extra?.length) return undefined;
  const out: DictionaryHanziInfo[] = [];
  const seen = new Set<string>();
  for (const card of [...(primary ?? []), ...(extra ?? [])]) {
    const key = `${card.traditional}:${card.simplified}:${card.reading ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(card);
  }
  return out.length ? out : undefined;
}

function discriminatorsCompatible(a: DictionaryEntry, b: DictionaryEntry): boolean {
  const hanjaA = fieldKey(a.hanja, false);
  const hanjaB = fieldKey(b.hanja, false);
  if (hanjaA && hanjaB && hanjaA !== hanjaB) return false;
  // Same simplified headword, different words: 乾 (dry) vs 干 (to concern), 豆 vs its variant 荳.
  const traditionalA = fieldKey(a.traditional, false);
  const traditionalB = fieldKey(b.traditional, false);
  if (traditionalA && traditionalB && traditionalA !== traditionalB) return false;
  const readingA = fieldKey(a.reading, true);
  const readingB = fieldKey(b.reading, true);
  if (readingA && readingB && readingA !== readingB) return false;
  return true;
}

function sameHeadword(a: DictionaryEntry, b: DictionaryEntry): boolean {
  return a.lang === b.lang && headKey(a.headword) === headKey(b.headword);
}

/**
 * A supplement with no hanja and no reading cannot be assigned when the
 * headword already has two or more conflicting readings or hanja spellings.
 */
function isAmbiguousSupplement(existing: DictionaryEntry[], incoming: DictionaryEntry): boolean {
  if (fieldKey(incoming.hanja, false) || fieldKey(incoming.reading, true)) return false;
  const group = existing.filter((entry) => sameHeadword(entry, incoming));
  if (group.length < 2) return false;
  const hanja = new Set(group.map((entry) => fieldKey(entry.hanja, false)).filter(Boolean));
  const readings = new Set(group.map((entry) => fieldKey(entry.reading, true)).filter(Boolean));
  return hanja.size > 1 || readings.size > 1;
}

function mergePair(anchor: DictionaryEntry, extra: DictionaryEntry): DictionaryEntry {
  const richer = entryRichness(extra) > entryRichness(anchor) ? extra : anchor;
  const other = richer === anchor ? extra : anchor;
  const senses = mergeSenses(richer.senses, other.senses);
  const merged: DictionaryEntry = {
    id: anchor.id,
    lang: anchor.lang,
    headword: anchor.headword,
    senses: senses.length ? senses : richer.senses.map(cloneSense),
    source: preferredSource(anchor, extra),
  };
  const hanja = firstFilled(anchor.hanja, richer.hanja, other.hanja);
  if (hanja) merged.hanja = hanja;
  const reading = firstFilled(anchor.reading, richer.reading, other.reading);
  if (reading) merged.reading = reading;
  const ipa = firstFilled(anchor.ipa, richer.ipa, other.ipa);
  if (ipa) merged.ipa = ipa;
  const audioUrl = firstFilled(anchor.audioUrl, richer.audioUrl, other.audioUrl);
  if (audioUrl) merged.audioUrl = audioUrl;
  const traditional = firstFilled(anchor.traditional, richer.traditional, other.traditional);
  if (traditional) merged.traditional = traditional;
  const simplified = firstFilled(anchor.simplified, richer.simplified, other.simplified);
  if (simplified) merged.simplified = simplified;
  const alternates = unionText(anchor.alternates, richer.alternates, other.alternates);
  if (alternates) merged.alternates = alternates;
  const readings = unionText(anchor.readings, richer.readings, other.readings);
  if (readings) merged.readings = readings;
  const tags = unionText(anchor.tags, richer.tags, other.tags);
  if (tags) merged.tags = tags;
  const synonyms = unionText(anchor.synonyms, richer.synonyms, other.synonyms)?.slice(0, 20);
  if (synonyms?.length) merged.synonyms = synonyms;
  const kanji = unionKanji(richer.kanji, other.kanji);
  if (kanji) merged.kanji = kanji;
  const hanzi = unionHanzi(richer.hanzi, other.hanzi);
  if (hanzi) merged.hanzi = hanzi;
  return merged;
}

function canMerge(a: DictionaryEntry, b: DictionaryEntry): boolean {
  if (a.id === b.id) return true;
  if (!sameHeadword(a, b)) return false;
  return discriminatorsCompatible(a, b);
}

/**
 * Merge rows that name the same word. The earlier row keeps its id so a card
 * already on screen updates in place. Homographs with different hanja or
 * readings stay separate. An enrichment row that cannot be tied to one of
 * those homographs is dropped instead of shown as another card.
 */
export function dedupeDictionaryEntries(entries: DictionaryEntry[]): DictionaryEntry[] {
  const out: DictionaryEntry[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry.headword !== "string" || !Array.isArray(entry.senses)) {
      continue;
    }
    const byId = out.findIndex((existing) => existing.id === entry.id);
    if (byId >= 0) {
      out[byId] = mergePair(out[byId], entry);
      continue;
    }
    if (isAmbiguousSupplement(out, entry)) continue;
    const match = out.findIndex((existing) => canMerge(existing, entry));
    if (match >= 0) {
      out[match] = mergePair(out[match], entry);
      continue;
    }
    out.push(entry);
  }
  return out;
}

export function dedupeDictionaryLookup(response: DictionaryLookupResponse): DictionaryLookupResponse {
  const entries = dedupeDictionaryEntries(response.entries);
  if (
    entries.length === response.entries.length &&
    entries.every((entry, index) => entry === response.entries[index])
  ) {
    return response;
  }
  return {
    ...response,
    entries,
    notFound: entries.length === 0,
  };
}

/**
 * Apply a later lookup (Wiktionary enrichment, or a cached payload) onto the
 * rows already rendered. Existing ids win, so the open card grows instead of
 * a second card being inserted above it.
 */
export function mergeDictionaryLookup(
  current: DictionaryLookupResponse | null,
  incoming: DictionaryLookupResponse
): DictionaryLookupResponse {
  const next = dedupeDictionaryLookup(incoming);
  if (!current?.entries.length) {
    const { enrichmentPending: _pending, ...rest } = next;
    return rest;
  }
  const { enrichmentPending: _pending, ...rest } = next;
  return {
    ...rest,
    entries: dedupeDictionaryEntries([...current.entries, ...next.entries]),
  };
}
