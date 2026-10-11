#!/usr/bin/env bun
/**
 * Stream the English Wiktionary wiktextract dump and write a SQLite index of
 * the fields ryOS actually renders.
 *
 * Source (en.wiktionary.org, same edition as the REST API):
 *   https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz
 *
 * Kept languages: en, zh, ja, ko.
 * Kept fields: headword, part of speech, glosses, example text / translation /
 * romanization / Japanese ruby, and redirect titles.
 *
 * The raw dump is not copied into the runtime image. Output is
 * `$DICTIONARY_DATA_DIR/wiktionary.sqlite`.
 *
 *   DICTIONARY_DATA_DIR=/tmp/ryos-dictionary \
 *     bun scripts/build-wiktionary-index.ts /path/to/raw-wiktextract-data.jsonl.gz
 *
 * `--limit N` stops after N input lines (smoke test).
 */
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { createGzip, createGunzip } from "node:zlib";
import { Database } from "bun:sqlite";
import { stripHtml, shortenEnglishGloss } from "../api/dictionary/_helpers/_remote.js";
import {
  WIKTIONARY_INDEX_INDEXES,
  WIKTIONARY_INDEX_SCHEMA,
} from "../api/dictionary/_helpers/_wiktionary-local.js";

const KEEP_LANG = new Set(["en", "zh", "ja", "ko"]);
const QUERY_MAX = 64;
const GLOSS_MAX = { en: 5, zh: 8, ja: 8, ko: 8 } as const;
const EXAMPLE_MAX = { en: 2, zh: 4, ja: 4, ko: 4 } as const;

const POS_LABEL: Record<string, string> = {
  noun: "Noun",
  verb: "Verb",
  adj: "Adjective",
  adv: "Adverb",
  name: "Proper noun",
  phrase: "Phrase",
  character: "Character",
  prefix: "Prefix",
  suffix: "Suffix",
  pron: "Pronoun",
  particle: "Particle",
  interj: "Interjection",
  intj: "Interjection",
  conj: "Conjunction",
  prep: "Preposition",
  num: "Numeral",
  det: "Determiner",
  article: "Article",
  proverb: "Proverb",
  contraction: "Contraction",
  postp: "Postposition",
  punct: "Punctuation",
  symbol: "Symbol",
  affix: "Affix",
  counter: "Counter",
  classifier: "Classifier",
};

interface ExampleIn {
  text?: unknown;
  translation?: unknown;
  english?: unknown;
  roman?: unknown;
  type?: unknown;
  ruby?: unknown;
}

interface SenseIn {
  glosses?: unknown;
  examples?: unknown;
  tags?: unknown;
}

interface EntryIn {
  word?: unknown;
  lang_code?: unknown;
  lang?: unknown;
  pos?: unknown;
  senses?: unknown;
  redirects?: unknown;
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  let text = value.replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.includes("<") || text.includes("&")) text = stripHtml(text);
  if (text.length > max) text = `${text.slice(0, max).trim()}`;
  return text;
}

function posLabel(pos: unknown): string {
  if (typeof pos !== "string" || !pos.trim()) return "";
  const key = pos.trim().toLowerCase();
  return POS_LABEL[key] ?? pos.trim();
}

function rubyPairs(value: unknown): [string, string][] | undefined {
  if (!Array.isArray(value)) return undefined;
  const pairs: [string, string][] = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const base = typeof item[0] === "string" ? item[0] : "";
    const reading = typeof item[1] === "string" ? item[1] : "";
    if (!base || !reading) continue;
    pairs.push([base, reading]);
    if (pairs.length >= 40) break;
  }
  return pairs.length ? pairs : undefined;
}

function redirectList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const text = typeof item === "string" ? item : null;
    if (!text) continue;
    const key = text.normalize("NFKC").trim();
    if (!key || key.length > QUERY_MAX) continue;
    out.push(key);
  }
  return out;
}

interface BuiltUsage {
  partOfSpeech?: string;
  language?: string;
  definitions: {
    definition: string;
    parsedExamples?: {
      example: string;
      translation?: string;
      transliteration?: string;
      ruby?: [string, string][];
    }[];
  }[];
}

function buildUsage(entry: EntryIn, lang: "en" | "zh" | "ja" | "ko"): BuiltUsage | null {
  const senses = Array.isArray(entry.senses) ? (entry.senses as SenseIn[]) : [];
  const glosses: string[] = [];
  const seen = new Set<string>();
  const preferred: NonNullable<BuiltUsage["definitions"][0]["parsedExamples"]> = [];
  const quotations: NonNullable<BuiltUsage["definitions"][0]["parsedExamples"]> = [];
  const glossCap = GLOSS_MAX[lang];
  const exampleCap = EXAMPLE_MAX[lang];

  for (const sense of senses) {
    const tags = Array.isArray(sense.tags) ? sense.tags : [];
    const rawGlosses = Array.isArray(sense.glosses) ? sense.glosses : [];
    if (tags.includes("no-gloss") && rawGlosses.length === 0) continue;
    for (const raw of rawGlosses) {
      if (glosses.length >= glossCap) break;
      let gloss = cleanText(raw, lang === "en" ? 2000 : 500);
      if (!gloss) continue;
      if (lang === "en") {
        gloss = shortenEnglishGloss(gloss);
        if (gloss.length <= 1) continue;
      }
      const dedupe = gloss.toLowerCase();
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      glosses.push(gloss);
    }
    const rawExamples = Array.isArray(sense.examples) ? (sense.examples as ExampleIn[]) : [];
    for (const raw of rawExamples) {
      if (preferred.length >= exampleCap) break;
      const example = cleanText(raw.text, 400);
      if (!example) continue;
      const translation = cleanText(raw.translation ?? raw.english, 400);
      const roman = cleanText(raw.roman, 200);
      const item: NonNullable<BuiltUsage["definitions"][0]["parsedExamples"]>[number] = { example };
      if (translation) item.translation = translation;
      if (roman) item.transliteration = roman;
      const ruby = lang === "ja" ? rubyPairs(raw.ruby) : undefined;
      if (ruby) item.ruby = ruby;
      if (raw.type === "quotation") quotations.push(item);
      else preferred.push(item);
    }
  }

  if (glosses.length === 0) return null;
  const examples = [...preferred, ...quotations].slice(0, exampleCap);
  const usage: BuiltUsage = {
    definitions: glosses.map((definition, index) =>
      index === 0 && examples.length ? { definition, parsedExamples: examples } : { definition }
    ),
  };
  const pos = posLabel(entry.pos);
  if (pos) usage.partOfSpeech = pos;
  if (lang === "en") usage.language = "English";
  return usage;
}

async function main() {
  const gzPath = process.argv.find((arg) => arg.endsWith(".gz") || arg.endsWith(".jsonl"));
  if (!gzPath) {
    console.error("usage: bun scripts/build-wiktionary-index.ts <raw.jsonl.gz> [--limit N]");
    process.exit(1);
  }
  const limit = Number(argValue("--limit") || "0");
  const dir = process.env.DICTIONARY_DATA_DIR || path.join(process.cwd(), "data", "dictionary");
  await mkdir(dir, { recursive: true });
  const sqlitePath = path.join(dir, "wiktionary.sqlite");
  const filteredPath =
    process.env.WIKTIONARY_FILTERED_GZ || path.join(dir, "wiktionary-filtered.jsonl.gz");
  await mkdir(path.dirname(filteredPath), { recursive: true });

  const db = new Database(sqlitePath);
  db.exec("PRAGMA journal_mode = OFF");
  db.exec("PRAGMA synchronous = OFF");
  db.exec("PRAGMA temp_store = MEMORY");
  db.exec("PRAGMA cache_size = -131072");
  db.exec("DROP TABLE IF EXISTS sense");
  db.exec("DROP TABLE IF EXISTS alias");
  db.exec("DROP TABLE IF EXISTS meta");
  db.exec(WIKTIONARY_INDEX_SCHEMA);
  const insertSense = db.prepare("INSERT INTO sense (lang, word, pos, body) VALUES (?, ?, ?, ?)");
  const insertAlias = db.prepare("INSERT OR IGNORE INTO alias (lang, alias, word) VALUES (?, ?, ?)");

  const filtered = createGzip({ level: 6 });
  const filteredOut = createWriteStream(filteredPath);
  filtered.pipe(filteredOut);

  const started = performance.now();
  let lines = 0;
  let parsed = 0;
  let keptRows = 0;
  let aliasRows = 0;
  let filteredBytes = 0;
  let rawBytes = 0;
  const byLang: Record<string, number> = { en: 0, zh: 0, ja: 0, ko: 0 };
  let pending = 0;
  db.exec("BEGIN");

  const writeFiltered = async (line: string) => {
    filteredBytes += Buffer.byteLength(line);
    if (!filtered.write(line)) {
      await new Promise<void>((resolve) => filtered.once("drain", () => resolve()));
    }
  };

  const fileStream = createReadStream(gzPath, { highWaterMark: 1024 * 1024 });
  const input = fileStream.pipe(createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  for await (const line of rl) {
    lines += 1;
    rawBytes += Buffer.byteLength(line) + 1;
    if (limit && lines > limit) {
      rl.close();
      fileStream.destroy();
      break;
    }
    if (lines % 250_000 === 0) {
      const sec = (performance.now() - started) / 1000;
      console.log(
        `[wiktionary] ${lines} lines in ${sec.toFixed(1)}s, kept ${keptRows} rows, ${(rawBytes / 1024 / 1024).toFixed(0)}MB raw`
      );
    }
    if (!line.includes('"lang_code": "en"') && !line.includes('"lang_code": "zh"') && !line.includes('"lang_code": "ja"') && !line.includes('"lang_code": "ko"')) {
      continue;
    }
    let entry: EntryIn;
    try {
      entry = JSON.parse(line) as EntryIn;
      parsed += 1;
    } catch {
      continue;
    }
    const lang = entry.lang_code;
    if (typeof lang !== "string" || !KEEP_LANG.has(lang)) continue;
    const code = lang as "en" | "zh" | "ja" | "ko";
    if (code === "en" && entry.lang !== "English") continue;
    if (typeof entry.word !== "string") continue;
    const word = entry.word.normalize("NFKC").trim();
    if (!word || word.length > QUERY_MAX) continue;

    for (const alias of redirectList(entry.redirects)) {
      if (alias === word) continue;
      insertAlias.run(code, alias, word);
      aliasRows += 1;
    }
    if (code === "en") {
      const lower = word.toLowerCase();
      if (lower !== word) {
        insertAlias.run(code, lower, word);
        aliasRows += 1;
      }
    }

    const usage = buildUsage(entry, code);
    if (!usage) continue;
    const body = JSON.stringify(usage);
    insertSense.run(code, word, usage.partOfSpeech ?? "", body);
    keptRows += 1;
    byLang[code] += 1;
    const filteredLine = `${JSON.stringify({ lang: code, word, pos: usage.partOfSpeech ?? "", glosses: usage.definitions.map((d) => d.definition), examples: usage.definitions[0]?.parsedExamples ?? [] })}\n`;
    await writeFiltered(filteredLine);
    pending += 1;
    if (pending >= 4000) {
      db.exec("COMMIT");
      db.exec("BEGIN");
      pending = 0;
    }
  }
  db.exec("COMMIT");
  filtered.end();
  await new Promise<void>((resolve, reject) => {
    filteredOut.on("finish", () => resolve());
    filteredOut.on("error", reject);
  });

  console.log("[wiktionary] indexing...");
  const indexStarted = performance.now();
  db.exec(WIKTIONARY_INDEX_INDEXES);
  const indexMs = performance.now() - indexStarted;

  const counts = db
    .query("SELECT lang, COUNT(*) AS rows, COUNT(DISTINCT word) AS words FROM sense GROUP BY lang")
    .all() as { lang: string; rows: number; words: number }[];
  db.exec("INSERT INTO meta (key, value) VALUES ('source', 'https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz')");
  db.exec(
    "INSERT INTO meta (key, value) VALUES ('dump_last_modified', 'Sat, 03 Oct 2026 08:24:38 GMT')"
  );

  const sqliteBytes = (await stat(sqlitePath)).size;
  const filteredGzBytes = (await stat(filteredPath)).size;
  const rawGzBytes = (await stat(gzPath)).size;
  const elapsedMs = performance.now() - started;
  const stats = {
    rawGzBytes,
    rawUncompressedBytes: rawBytes,
    lines,
    parsed,
    keptRows,
    aliasRows,
    byLang,
    distinct: counts,
    filteredBytes,
    filteredGzBytes,
    sqliteBytes,
    indexMs: Math.round(indexMs),
    elapsedMs: Math.round(elapsedMs),
    sqlitePath,
    filteredPath,
    limit: limit || null,
  };
  const statsPath = path.join(dir, "wiktionary-build-stats.json");
  await Bun.write(statsPath, JSON.stringify(stats, null, 2));
  console.log(JSON.stringify(stats, null, 2));
  db.close();
}

await main();
