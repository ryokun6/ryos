import type {
  DictionaryEntry,
  DictionaryKanjiInfo,
  DictionarySense,
} from "../../../src/shared/dictionary.js";

// ============================================================================
// CC-CEDICT — "傳統 传统 [chuan2 tong3] /tradition/traditional/"
// ============================================================================

const CEDICT_LINE_RE = /^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+\/(.*)\/\s*$/;

export function parseCedictLine(line: string): DictionaryEntry | null {
  if (!line || line.startsWith("#")) return null;
  const match = CEDICT_LINE_RE.exec(line);
  if (!match) return null;
  const [, traditional, simplified, pinyin, rawGlosses] = match;
  const glosses: string[] = [];
  const notes: string[] = [];
  for (const gloss of rawGlosses.split("/")) {
    const trimmed = gloss.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("CL:")) {
      notes.push(trimmed);
    } else {
      glosses.push(trimmed);
    }
  }
  if (glosses.length === 0 && notes.length === 0) return null;
  const sense: DictionarySense = { glosses };
  if (notes.length > 0) sense.notes = notes;
  return {
    id: `cc-cedict:${traditional}:${pinyin.replace(/\s+/g, "_")}`,
    lang: "zh",
    headword: simplified,
    traditional,
    simplified,
    reading: pinyin,
    senses: [sense],
    source: "cc-cedict",
  };
}

/** Inverse of `parseCedictLine`, used as the compact in-memory row format. */
export function formatCedictLine(entry: DictionaryEntry): string {
  const items = entry.senses.flatMap((sense) => [...sense.glosses, ...(sense.notes ?? [])]);
  return `${entry.traditional ?? entry.headword} ${entry.simplified ?? entry.headword} [${entry.reading ?? ""}] /${items.join("/")}/`;
}

export function* iterateCedict(text: string): Generator<DictionaryEntry> {
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf("\n", start);
    if (end === -1) end = text.length;
    const entry = parseCedictLine(text.slice(start, end).replace(/\r$/, ""));
    if (entry) yield entry;
    start = end + 1;
  }
}

export function parseCedict(text: string): DictionaryEntry[] {
  return Array.from(iterateCedict(text));
}

// ============================================================================
// JMdict (jmdict-simplified JSON)
// ============================================================================

interface JmdictText {
  common?: boolean;
  text: string;
  tags?: string[];
  appliesToKanji?: string[];
}

interface JmdictSense {
  partOfSpeech?: string[];
  related?: (string | number)[][];
  antonym?: (string | number)[][];
  misc?: string[];
  info?: string[];
  field?: string[];
  gloss?: { lang?: string; text: string }[];
}

export interface JmdictWord {
  id: string;
  kanji: JmdictText[];
  kana: JmdictText[];
  sense: JmdictSense[];
}

export interface JmdictFile {
  tags?: Record<string, string>;
  words: JmdictWord[];
}

const JMDICT_SHORT_TAGS: Record<string, string> = {
  n: "noun",
  "n-suf": "suffix",
  "n-pref": "prefix",
  "n-adv": "adverbial noun",
  "n-t": "temporal noun",
  vs: "suru verb",
  "vs-i": "suru verb",
  "vs-s": "suru verb",
  vt: "transitive",
  vi: "intransitive",
  v1: "ichidan verb",
  vk: "kuru verb",
  "adj-i": "i-adjective",
  "adj-ix": "i-adjective",
  "adj-na": "na-adjective",
  "adj-no": "no-adjective",
  "adj-pn": "pre-noun adjectival",
  "adj-t": "taru-adjective",
  "adj-f": "prenominal",
  adv: "adverb",
  "adv-to": "adverb (to)",
  exp: "expression",
  prt: "particle",
  suf: "suffix",
  pref: "prefix",
  int: "interjection",
  ctr: "counter",
  conj: "conjunction",
  pn: "pronoun",
  num: "numeric",
  cop: "copula",
  "aux-v": "auxiliary verb",
  "aux-adj": "auxiliary adjective",
  aux: "auxiliary",
};

/** "noun (common) (futsuumeishi)" → "noun"; keeps short tags readable. */
export function shortenJmdictTag(tag: string, tags: Record<string, string> = {}): string {
  const short = JMDICT_SHORT_TAGS[tag] ?? (/^v5/.test(tag) ? "godan verb" : undefined);
  if (short) return short;
  const description = tags[tag];
  if (!description) return tag;
  return description.replace(/\s*\([^)]*\)/g, "").trim() || tag;
}

function xrefToWord(ref: (string | number)[]): string | null {
  const word = ref.find((part) => typeof part === "string");
  return typeof word === "string" ? word : null;
}

function uniq(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values).filter(Boolean)));
}

export function jmdictWordToEntry(
  word: JmdictWord,
  tags: Record<string, string> = {}
): DictionaryEntry | null {
  const kanji = word.kanji ?? [];
  const kana = word.kana ?? [];
  const primaryKana = kana.find((item) => item.common) ?? kana[0];
  const primaryKanji = kanji.find((item) => item.common) ?? kanji[0];
  if (!primaryKana && !primaryKanji) return null;

  const headword = primaryKanji?.text ?? primaryKana!.text;
  const senses: DictionarySense[] = [];
  for (const sense of word.sense ?? []) {
    const glosses = (sense.gloss ?? [])
      .filter((gloss) => !gloss.lang || gloss.lang === "eng")
      .map((gloss) => gloss.text);
    if (glosses.length === 0) continue;
    const next: DictionarySense = { glosses };
    if (sense.partOfSpeech?.length) {
      next.partOfSpeech = uniq(sense.partOfSpeech.map((tag) => shortenJmdictTag(tag, tags))).join(", ");
    }
    const related = uniq((sense.related ?? []).map(xrefToWord).filter((w): w is string => !!w));
    if (related.length) next.synonyms = related;
    const antonyms = uniq((sense.antonym ?? []).map(xrefToWord).filter((w): w is string => !!w));
    if (antonyms.length) next.antonyms = antonyms;
    const notes = [
      ...(sense.misc ?? []).map((tag) => shortenJmdictTag(tag, tags)),
      ...(sense.field ?? []).map((tag) => shortenJmdictTag(tag, tags)),
      ...(sense.info ?? []),
    ];
    if (notes.length) next.notes = uniq(notes);
    senses.push(next);
  }
  if (senses.length === 0) return null;

  const isCommon = kanji.some((item) => item.common) || kana.some((item) => item.common);
  const entry: DictionaryEntry = {
    id: `jmdict:${word.id}`,
    lang: "ja",
    headword,
    senses,
    source: "jmdict",
  };
  if (primaryKanji && primaryKana) entry.reading = primaryKana.text;
  const alternates = kanji.map((item) => item.text).filter((text) => text !== headword);
  if (alternates.length) entry.alternates = alternates;
  const readings = kana
    .map((item) => item.text)
    .filter((text) => text !== headword && text !== entry.reading);
  if (readings.length) entry.readings = readings;
  if (isCommon) entry.tags = ["common"];
  return entry;
}

export function parseJmdict(file: JmdictFile): DictionaryEntry[] {
  const tags = file.tags ?? {};
  const entries: DictionaryEntry[] = [];
  for (const word of file.words ?? []) {
    const entry = jmdictWordToEntry(word, tags);
    if (entry) entries.push(entry);
  }
  return entries;
}

// ============================================================================
// KANJIDIC2 (jmdict-simplified JSON)
// ============================================================================

interface KanjidicCharacter {
  literal: string;
  misc?: {
    grade?: number | null;
    strokeCounts?: number[];
    frequency?: number | null;
    jlptLevel?: number | null;
  };
  readingMeaning?: {
    groups?: {
      readings?: { type: string; value: string }[];
      meanings?: { lang?: string; value: string }[];
    }[];
  } | null;
}

export interface KanjidicFile {
  characters: KanjidicCharacter[];
}

export function parseKanjidic(file: KanjidicFile): Map<string, DictionaryKanjiInfo> {
  const map = new Map<string, DictionaryKanjiInfo>();
  for (const character of file.characters ?? []) {
    const onyomi: string[] = [];
    const kunyomi: string[] = [];
    const meanings: string[] = [];
    for (const group of character.readingMeaning?.groups ?? []) {
      for (const reading of group.readings ?? []) {
        if (reading.type === "ja_on") onyomi.push(reading.value);
        if (reading.type === "ja_kun") kunyomi.push(reading.value);
      }
      for (const meaning of group.meanings ?? []) {
        if (!meaning.lang || meaning.lang === "en") meanings.push(meaning.value);
      }
    }
    const info: DictionaryKanjiInfo = {
      literal: character.literal,
      meanings,
      onyomi,
      kunyomi,
    };
    const misc = character.misc;
    if (misc?.strokeCounts?.[0]) info.strokeCount = misc.strokeCounts[0];
    if (misc?.grade) info.grade = misc.grade;
    if (misc?.jlptLevel) info.jlpt = misc.jlptLevel;
    if (misc?.frequency) info.frequency = misc.frequency;
    map.set(character.literal, info);
  }
  return map;
}

// ============================================================================
// kengdic TSV — id, surface, hanja, gloss, level, created, source
// ============================================================================

export function parseKengdic(text: string): DictionaryEntry[] {
  const grouped = new Map<string, DictionaryEntry>();
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const columns = lines[i].replace(/\r$/, "").split("\t");
    if (columns.length < 4 || (i === 0 && columns[0] === "id")) continue;
    const surface = columns[1]?.replace(/\s+/g, " ").trim();
    const hanja = columns[2]?.trim();
    const gloss = columns[3]?.replace(/\s+/g, " ").trim();
    const level = columns[4]?.trim();
    if (!surface || !gloss) continue;

    const key = `${surface}\u0000${hanja ?? ""}`;
    const existing = grouped.get(key);
    if (existing) {
      const glosses = existing.senses[0].glosses;
      if (!glosses.some((g) => g.toLowerCase() === gloss.toLowerCase())) glosses.push(gloss);
      if (level && !existing.tags?.length) existing.tags = [`level-${level.toLowerCase()}`];
      continue;
    }
    const entry: DictionaryEntry = {
      id: `kengdic:${columns[0]}`,
      lang: "ko",
      headword: surface,
      senses: [{ glosses: [gloss] }],
      source: "kengdic",
    };
    if (hanja) entry.hanja = hanja;
    if (level) entry.tags = [`level-${level.toLowerCase()}`];
    grouped.set(key, entry);
  }
  return Array.from(grouped.values());
}

// ============================================================================
// Minimal tar reader (jmdict-simplified ships single-file .tgz archives)
// ============================================================================

export function extractFirstTarFile(tar: Uint8Array): Uint8Array | null {
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) return null;
    const name = decoder.decode(header.subarray(0, 100)).replace(/\0.*$/s, "");
    const sizeOctal = decoder.decode(header.subarray(124, 136)).replace(/\0.*$/s, "").trim();
    const size = parseInt(sizeOctal || "0", 8);
    const type = String.fromCharCode(header[156] || 48);
    const dataStart = offset + 512;
    if ((type === "0" || type === "\0") && name && size > 0) {
      return tar.subarray(dataStart, dataStart + size);
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return null;
}
