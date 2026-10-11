import { gunzipSync } from "node:zlib";
import type { DictionaryEntry, DictionarySense } from "../../../src/shared/dictionary.js";
import { englishLemmaCandidates } from "./_english.js";
import { DictionaryIndex } from "./_index.js";

/**
 * Princeton WordNet 3.1 (`wn3.1.dict.tar.gz`).
 * WordNet 3.1 Copyright 2011 by Princeton University. All rights reserved.
 * Used under the WordNet License.
 */

const POS_FILES = [
  { data: "data.noun", index: "index.noun", exc: "noun.exc" },
  { data: "data.verb", index: "index.verb", exc: "verb.exc" },
  { data: "data.adj", index: "index.adj", exc: "adj.exc" },
  { data: "data.adv", index: "index.adv", exc: "adv.exc" },
] as const;

const PART_OF_SPEECH: Record<string, string> = {
  n: "noun",
  v: "verb",
  a: "adjective",
  s: "adjective",
  r: "adverb",
};

const MAX_SENSES = 8;
const MAX_PRIMARY_SENSES = 6;
const MAX_SENSE_SYNONYMS = 6;
const MAX_ENTRY_SYNONYMS = 12;
const MAX_LEMMA_CANDIDATES = 6;

const exceptionsByIndex = new WeakMap<DictionaryIndex, Map<string, string[]>>();

export function wordNetExceptions(index: DictionaryIndex): Map<string, string[]> | undefined {
  return exceptionsByIndex.get(index);
}

export function setWordNetExceptions(
  index: DictionaryIndex,
  exceptions: Map<string, string[]>
): void {
  exceptionsByIndex.set(index, exceptions);
}

export interface WordNetTexts {
  "data.noun": string;
  "data.verb": string;
  "data.adj": string;
  "data.adv": string;
  "index.noun": string;
  "index.verb": string;
  "index.adj": string;
  "index.adv": string;
  "noun.exc": string;
  "verb.exc": string;
  "adj.exc": string;
  "adv.exc": string;
}

interface Synset {
  partOfSpeech: string;
  words: string[];
  gloss: string;
  examples: string[];
}

function lemmaKey(raw: string): string {
  return raw.replace(/_/g, " ").toLowerCase();
}

/** Split a WordNet gloss into the lead definition and at most one quoted example. */
export function splitWordNetGloss(raw: string): { gloss: string; examples: string[] } {
  const examples: string[] = [];
  const text = raw.replace(/"([^"]*)"/g, (_match, example: string) => {
    const trimmed = example.trim();
    if (trimmed && examples.length < 1) examples.push(trimmed);
    return " ";
  });
  const cleaned = text.replace(/\s+/g, " ").trim();
  const parts = cleaned
    .split(";")
    .map((part) => part.trim().replace(/[;,\s]+$/g, ""))
    .filter((part) => part.length >= 8);
  let gloss = parts[0] ?? cleaned.replace(/[;,\s]+$/g, "");
  if (gloss.length > 320) {
    const sentence = gloss.match(/^.{12,320}?[.!?]/);
    gloss = (sentence ? sentence[0] : gloss.slice(0, 320)).trim();
  }
  return { gloss, examples };
}

export function parseWordNetData(text: string): Map<string, Synset> {
  const synsets = new Map<string, Synset>();
  for (const line of text.split("\n")) {
    if (!/^\d{8}\s/.test(line)) continue;
    const bar = line.indexOf("|");
    if (bar < 0) continue;
    const meta = line.slice(0, bar).trim().split(/\s+/);
    const offset = meta[0];
    const partOfSpeech = PART_OF_SPEECH[meta[2] ?? ""];
    const wordCount = parseInt(meta[3] ?? "", 16);
    if (!offset || !partOfSpeech || !Number.isFinite(wordCount) || wordCount < 1) continue;
    const words: string[] = [];
    for (let i = 0; i < wordCount; i++) {
      const raw = meta[4 + i * 2];
      if (!raw) break;
      words.push(lemmaKey(raw));
    }
    if (!words.length) continue;
    const { gloss, examples } = splitWordNetGloss(line.slice(bar + 1));
    if (!gloss) continue;
    synsets.set(offset, { partOfSpeech, words, gloss, examples });
  }
  return synsets;
}

export function parseWordNetIndex(text: string): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const line of text.split("\n")) {
    if (!line || line[0] === " " || line[0] === "\t") continue;
    const parts = line.trim().split(/\s+/);
    const pos = parts[1];
    if (!parts[0] || (pos !== "n" && pos !== "v" && pos !== "a" && pos !== "r")) continue;
    const synsetCount = parseInt(parts[2] ?? "", 10);
    const pointerCount = parseInt(parts[3] ?? "", 10);
    if (!Number.isFinite(synsetCount) || !Number.isFinite(pointerCount) || synsetCount < 1) continue;
    const offsetAt = 4 + pointerCount + 2;
    const offsets = parts.slice(offsetAt, offsetAt + synsetCount).filter((offset) => /^\d{8}$/.test(offset));
    if (offsets.length) index.set(lemmaKey(parts[0]), offsets);
  }
  return index;
}

/** `took take` / `better good well` → inflected form → lemma list. */
export function parseWordNetExceptions(text: string): Map<string, string[]> {
  const exceptions = new Map<string, string[]>();
  for (const line of text.split("\n")) {
    if (!line || line[0] === " " || line[0] === "\t") continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const form = lemmaKey(parts[0]);
    const lemmas = parts.slice(1).map(lemmaKey).filter((lemma) => lemma && lemma !== form);
    if (!lemmas.length) continue;
    const existing = exceptions.get(form) ?? [];
    for (const lemma of lemmas) {
      if (!existing.includes(lemma)) existing.push(lemma);
    }
    exceptions.set(form, existing);
  }
  return exceptions;
}

function mergeExceptions(target: Map<string, string[]>, extra: Map<string, string[]>) {
  for (const [form, lemmas] of extra) {
    const existing = target.get(form) ?? [];
    for (const lemma of lemmas) {
      if (!existing.includes(lemma)) existing.push(lemma);
    }
    target.set(form, existing);
  }
}

interface SenseGroup {
  /** Synsets in the index, before the per-entry cap. */
  total: number;
  /** Lower sorts first when two parts of speech are equally common. */
  posRank: number;
  senses: DictionarySense[];
}

const POS_RANK: Record<string, number> = { verb: 0, noun: 1, adjective: 2, adverb: 3 };

function pickSenses(groups: SenseGroup[]): DictionarySense[] {
  const ordered = groups
    .filter((group) => group.senses.length > 0)
    .sort((a, b) => b.total - a.total || a.posRank - b.posRank);
  if (!ordered.length) return [];
  const picked = ordered[0].senses.slice(0, MAX_PRIMARY_SENSES);
  for (const group of ordered.slice(1)) {
    for (const sense of group.senses) {
      if (picked.length >= MAX_SENSES) return picked;
      picked.push(sense);
    }
  }
  for (const sense of ordered[0].senses.slice(MAX_PRIMARY_SENSES)) {
    if (picked.length >= MAX_SENSES) break;
    picked.push(sense);
  }
  return picked;
}

export function buildWordNetEntries(texts: WordNetTexts): {
  entries: DictionaryEntry[];
  exceptions: Map<string, string[]>;
} {
  const exceptions = new Map<string, string[]>();
  const sensesByLemma = new Map<string, SenseGroup[]>();

  for (const file of POS_FILES) {
    mergeExceptions(exceptions, parseWordNetExceptions(texts[file.exc]));
    const synsets = parseWordNetData(texts[file.data]);
    const index = parseWordNetIndex(texts[file.index]);
    for (const [lemma, offsets] of index) {
      const senses: DictionarySense[] = [];
      let total = 0;
      for (const offset of offsets) {
        const synset = synsets.get(offset);
        if (!synset) continue;
        total += 1;
        if (senses.length >= MAX_SENSES) continue;
        const sense: DictionarySense = {
          partOfSpeech: synset.partOfSpeech,
          glosses: [synset.gloss],
        };
        if (synset.examples.length) {
          sense.examples = synset.examples.map((text) => ({ text }));
        }
        const synonyms = synset.words.filter((word) => word !== lemma).slice(0, MAX_SENSE_SYNONYMS);
        if (synonyms.length) sense.synonyms = synonyms;
        senses.push(sense);
      }
      if (!senses.length) continue;
      const groups = sensesByLemma.get(lemma) ?? [];
      groups.push({ total, posRank: POS_RANK[senses[0].partOfSpeech ?? ""] ?? 9, senses });
      sensesByLemma.set(lemma, groups);
    }
  }

  const entries: DictionaryEntry[] = [];
  for (const [lemma, groups] of sensesByLemma) {
    const senses = pickSenses(groups);
    if (!senses.length) continue;
    const synonyms: string[] = [];
    for (const sense of senses) {
      for (const synonym of sense.synonyms ?? []) {
        if (!synonyms.includes(synonym)) synonyms.push(synonym);
        if (synonyms.length >= MAX_ENTRY_SYNONYMS) break;
      }
      if (synonyms.length >= MAX_ENTRY_SYNONYMS) break;
    }
    const entry: DictionaryEntry = {
      id: `wordnet:${lemma}`,
      lang: "en",
      headword: lemma,
      senses,
      source: "wordnet",
    };
    if (synonyms.length) entry.synonyms = synonyms;
    entries.push(entry);
  }
  return { entries, exceptions };
}

export function buildEnglishIndex(texts: WordNetTexts): DictionaryIndex {
  const { entries, exceptions } = buildWordNetEntries(texts);
  const index = new DictionaryIndex("en", entries, {
    indexGlosses: false,
    compounds: false,
    rank: (entry) => Math.min(255, Math.max(0, MAX_SENSES - entry.senses.length)),
  });
  exceptionsByIndex.set(index, exceptions);
  return index;
}

function extractTarText(tar: Uint8Array, wanted: Set<string>): Map<string, string> {
  const decoder = new TextDecoder();
  const found = new Map<string, string>();
  let offset = 0;
  while (offset + 512 <= tar.length && found.size < wanted.size) {
    const header = tar.subarray(offset, offset + 512);
    if (header[0] === 0) break;
    const name = decoder.decode(header.subarray(0, 100)).replace(/\0.*$/s, "");
    const size = parseInt(decoder.decode(header.subarray(124, 136)).replace(/\0.*$/s, "").trim() || "0", 8);
    const type = String.fromCharCode(header[156] || 48);
    if (!Number.isFinite(size) || size < 0) break;
    const dataStart = offset + 512;
    const magic = decoder.decode(header.subarray(257, 262));
    let fullName = name;
    if (magic === "ustar") {
      const prefix = decoder.decode(header.subarray(345, 500)).replace(/\0.*$/s, "");
      if (prefix) fullName = `${prefix}/${name}`;
    }
    const base = fullName.split("/").pop() ?? fullName;
    if ((type === "0" || type === "\0") && wanted.has(base) && size > 0) {
      found.set(base, decoder.decode(tar.subarray(dataStart, dataStart + size)));
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return found;
}

export function buildEnglishDictionary(gzippedTar: Uint8Array): DictionaryIndex {
  const tar = gunzipSync(gzippedTar);
  const wanted = new Set<string>(POS_FILES.flatMap((file) => [file.data, file.index, file.exc]));
  const files = extractTarText(new Uint8Array(tar.buffer, tar.byteOffset, tar.byteLength), wanted);
  const missing = [...wanted].filter((name) => !files.has(name));
  if (missing.length) {
    throw new Error(`WordNet archive missing ${missing.join(", ")}`);
  }
  return buildEnglishIndex(Object.fromEntries(files) as WordNetTexts);
}

/** Exact lemma, then WordNet exception list, then the suffix fallback (`running` → `run`). */
export function wordNetLemmaCandidates(index: DictionaryIndex, word: string): string[] {
  const exceptions = exceptionsByIndex.get(index)?.get(word) ?? [];
  const candidates: string[] = [];
  const seen = new Set<string>([word]);
  for (const lemma of [...exceptions, ...englishLemmaCandidates(word)]) {
    if (!lemma || seen.has(lemma)) continue;
    seen.add(lemma);
    candidates.push(lemma);
    if (candidates.length >= MAX_LEMMA_CANDIDATES) break;
  }
  return candidates;
}

export function lookupWordNet(index: DictionaryIndex, word: string): DictionaryEntry | null {
  const surface = word.toLowerCase();
  const exact = index.lookupHeadword(surface);
  if (exact.length) return exact[0];
  for (const lemma of wordNetLemmaCandidates(index, surface)) {
    const hit = index.lookupHeadword(lemma);
    if (hit.length) return hit[0];
  }
  return null;
}
