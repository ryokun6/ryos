#!/usr/bin/env bun
/**
 * Cold timings for the live Wiktionary REST API versus the local index.
 *
 * Modes:
 *   boot     warm the existing CEDICT/JMdict/WordNet snapshots
 *   local    p50/p95 of local index lookups (no Redis)
 *   remote   p50/p95 of fetchWiktionary with redis=null
 *   memory   heap of loading the filtered JSONL into a Map (may OOM)
 *   coverage compare local vs remote on the fixed list plus a small probe
 *
 * DICTIONARY_DATA_DIR must contain the snapshots and wiktionary.sqlite.
 * DICTIONARY_WIKTIONARY_DB overrides the sqlite path.
 */
import { performance } from "node:perf_hooks";
import { createReadStream } from "node:fs";
import readline from "node:readline";
import { createGunzip } from "node:zlib";
import { getDictionaryIndex, getKanjiInfoMap, warmDictionaryIndexes } from "../api/dictionary/_helpers/_datasets.js";
import { fetchWiktionary } from "../api/dictionary/_helpers/_remote.js";
import { lookupLocalWiktionary } from "../api/dictionary/_helpers/_wiktionary-local.js";
import { beginDictionaryLookup, type DictionaryLookupDeps } from "../api/dictionary/_helpers/_lookup.js";
import type { DictionaryLanguage, DictionaryQueryLanguage } from "../src/shared/dictionary.js";

interface WordCase {
  id: string;
  q: string;
  lang: DictionaryQueryLanguage;
  wikiLang: DictionaryLanguage;
}

const COMMON: WordCase[] = [
  ...[
    "water", "time", "people", "year", "way", "day", "man", "thing", "woman", "life",
    "child", "world", "school", "state", "family", "student", "group", "country", "problem", "hand",
    "place", "week", "company", "system", "program", "question", "work", "government", "number", "night",
  ].map((q) => ({ id: `en:${q}`, q, lang: "en" as const, wikiLang: "en" as const })),
  ...["学习", "你好", "电脑", "时间", "朋友", "水", "爱", "工作", "银行", "中国"].map((q) => ({
    id: `zh:${q}`,
    q,
    lang: "zh" as const,
    wikiLang: "zh" as const,
  })),
  ...["食べる", "勉強", "水", "人", "時間", "日本", "学校", "友達", "行く", "大きい"].map((q) => ({
    id: `ja:${q}`,
    q,
    lang: "ja" as const,
    wikiLang: "ja" as const,
  })),
];

function percentile(samples: number[], p: number): number {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function round(ms: number): number {
  return Math.round(ms * 100) / 100;
}

function summarize(samples: number[]) {
  return {
    n: samples.length,
    p50: round(percentile(samples, 50)),
    p95: round(percentile(samples, 95)),
    min: round(Math.min(...samples)),
    max: round(Math.max(...samples)),
  };
}

function mb(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

async function wikiHeadword(word: WordCase): Promise<string> {
  if (word.wikiLang === "en") return word.q.toLowerCase();
  const index = await getDictionaryIndex(word.wikiLang);
  const exact = index.lookupHeadword(word.q);
  const top = exact[0];
  if (word.wikiLang === "zh") return top?.traditional ?? word.q;
  return top?.headword ?? word.q;
}

async function boot() {
  Bun.gc(true);
  const before = process.memoryUsage();
  const started = performance.now();
  const warm = await warmDictionaryIndexes();
  const ms = performance.now() - started;
  Bun.gc(true);
  const after = process.memoryUsage();
  console.log(
    JSON.stringify(
      {
        mode: "boot",
        warm,
        ms: round(ms),
        heapBeforeMb: mb(before.heapUsed),
        heapAfterMb: mb(after.heapUsed),
        rssBeforeMb: mb(before.rss),
        rssAfterMb: mb(after.rss),
        externalMb: mb(after.external),
      },
      null,
      2
    )
  );
}

async function bootSqlite() {
  Bun.gc(true);
  const before = process.memoryUsage();
  const started = performance.now();
  const warm = await warmDictionaryIndexes();
  const openStarted = performance.now();
  const samples = ["water", "time", "school"];
  for (const word of samples) lookupLocalWiktionary(word, "en");
  lookupLocalWiktionary("學習", "zh");
  lookupLocalWiktionary("食べる", "ja");
  lookupLocalWiktionary("여자", "ko");
  const openMs = performance.now() - openStarted;
  const ms = performance.now() - started;
  Bun.gc(true);
  const after = process.memoryUsage();
  console.log(
    JSON.stringify(
      {
        mode: "boot-sqlite",
        warm,
        ms: round(ms),
        sqliteTouchMs: round(openMs),
        heapBeforeMb: mb(before.heapUsed),
        heapAfterMb: mb(after.heapUsed),
        rssBeforeMb: mb(before.rss),
        rssAfterMb: mb(after.rss),
      },
      null,
      2
    )
  );
}

async function timeLocal() {
  await warmDictionaryIndexes();
  const rows = [];
  for (const word of COMMON) {
    const head = await wikiHeadword(word);
    const started = performance.now();
    const entry = lookupLocalWiktionary(head, word.wikiLang);
    const ms = performance.now() - started;
    rows.push({
      id: word.id,
      head,
      ms: round(ms),
      found: Boolean(entry),
      gloss: entry?.senses[0]?.glosses[0] ?? "",
      examples: entry?.senses.reduce((n, sense) => n + (sense.examples?.length ?? 0), 0) ?? 0,
    });
  }
  const mem = process.memoryUsage();
  console.log(
    JSON.stringify(
      {
        mode: "local",
        summary: summarize(rows.map((row) => row.ms)),
        byLang: {
          en: summarize(rows.filter((row) => row.id.startsWith("en:")).map((row) => row.ms)),
          zh: summarize(rows.filter((row) => row.id.startsWith("zh:")).map((row) => row.ms)),
          ja: summarize(rows.filter((row) => row.id.startsWith("ja:")).map((row) => row.ms)),
        },
        heapMb: mb(mem.heapUsed),
        rssMb: mb(mem.rss),
        rows,
      },
      null,
      2
    )
  );
}

async function timeRemote() {
  process.env.DICTIONARY_WIKTIONARY_SOURCE = "remote";
  await warmDictionaryIndexes();
  await fetchWiktionary("dictionary", "en", null);
  const rows = [];
  for (const word of COMMON) {
    const head = await wikiHeadword(word);
    const started = performance.now();
    let found = false;
    let gloss = "";
    let examples = 0;
    let error = "";
    try {
      const entry = await fetchWiktionary(head, word.wikiLang, null);
      found = Boolean(entry);
      gloss = entry?.senses[0]?.glosses[0] ?? "";
      examples = entry?.senses.reduce((n, sense) => n + (sense.examples?.length ?? 0), 0) ?? 0;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    rows.push({
      id: word.id,
      head,
      ms: round(performance.now() - started),
      found,
      gloss,
      examples,
      error,
    });
  }
  console.log(
    JSON.stringify(
      {
        mode: "remote",
        summary: summarize(rows.map((row) => row.ms)),
        byLang: {
          en: summarize(rows.filter((row) => row.id.startsWith("en:")).map((row) => row.ms)),
          zh: summarize(rows.filter((row) => row.id.startsWith("zh:")).map((row) => row.ms)),
          ja: summarize(rows.filter((row) => row.id.startsWith("ja:")).map((row) => row.ms)),
        },
        rows,
      },
      null,
      2
    )
  );
}

async function timeLookupOnly() {
  await warmDictionaryIndexes();
  const source = process.env.DICTIONARY_WIKTIONARY_SOURCE || "remote";
  const deps: DictionaryLookupDeps = {
    getIndex: getDictionaryIndex,
    getKanjiInfo: getKanjiInfoMap,
    fetchWiktionary: (headword, lang) => fetchWiktionary(headword, lang, null),
  };
  const rows = [];
  for (const word of COMMON) {
    const started = performance.now();
    const pending = await beginDictionaryLookup(word.q, word.lang, deps);
    const localMs = performance.now() - started;
    const finalStarted = performance.now();
    const final = await pending.final;
    const finalMs = performance.now() - finalStarted;
    rows.push({
      id: word.id,
      localMs: round(localMs),
      enrichWaitMs: round(finalMs),
      totalMs: round(localMs + finalMs),
      enrichmentPending: pending.enrichmentPending,
      sources: final.sources,
      notFound: final.notFound,
      examples: final.entries[0]?.senses.reduce((n, sense) => n + (sense.examples?.length ?? 0), 0) ?? 0,
    });
  }
  console.log(
    JSON.stringify(
      {
        mode: `lookup-only:${source}`,
        summary: summarize(rows.map((row) => row.totalMs)),
        local: summarize(rows.map((row) => row.localMs)),
        rows,
      },
      null,
      2
    )
  );
}

async function memory() {
  const file = process.env.WIKTIONARY_FILTERED_GZ;
  if (!file) throw new Error("Set WIKTIONARY_FILTERED_GZ");
  const map = new Map<string, string>();
  const input = createReadStream(file).pipe(createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let lines = 0;
  const before = process.memoryUsage();
  for await (const line of rl) {
    lines += 1;
    const row = JSON.parse(line) as { lang: string; word: string };
    map.set(`${row.lang}\0${row.word}`, line);
    if (lines % 200_000 === 0) {
      const mem = process.memoryUsage();
      console.error(`[memory] ${lines} heap ${mb(mem.heapUsed)}MB rss ${mb(mem.rss)}MB`);
    }
  }
  const after = process.memoryUsage();
  console.log(
    JSON.stringify(
      {
        mode: "memory",
        lines,
        keys: map.size,
        heapBeforeMb: mb(before.heapUsed),
        heapAfterMb: mb(after.heapUsed),
        rssAfterMb: mb(after.rss),
      },
      null,
      2
    )
  );
  // Keep the map alive until we have printed.
  if (map.size < 0) console.log("unreachable");
}

async function e2e() {
  const base = process.env.DICTIONARY_BENCH_API || "http://127.0.0.1:3000";
  const rows = [];
  for (let index = 0; index < COMMON.length; index++) {
    const word = COMMON[index];
    const ip = `10.${index % 200}.${word.lang === "en" ? 1 : word.lang === "zh" ? 2 : 3}.${(index % 250) + 1}`;
    const headers = { "X-Forwarded-For": ip, Origin: "http://localhost:3000" };
    const q = new URLSearchParams({ q: word.q, lang: word.lang });
    const started = performance.now();
    const lookupRes = await fetch(`${base}/api/dictionary?${q}`, { headers });
    const lookupMs = performance.now() - started;
    const lookupBody = (await lookupRes.json()) as {
      sources?: string[];
      enrichmentPending?: boolean;
      notFound?: boolean;
      entries?: { senses?: { examples?: unknown[] }[] }[];
    };
    const enrichStarted = performance.now();
    const enrichRes = await fetch(`${base}/api/dictionary/enrich?${q}`, { headers });
    const enrichMs = performance.now() - enrichStarted;
    const enrichBody = (await enrichRes.json()) as {
      sources?: string[];
      notFound?: boolean;
      entries?: { senses?: { examples?: unknown[] }[] }[];
    };
    const examples =
      enrichBody.entries?.[0]?.senses?.reduce((n, sense) => n + (sense.examples?.length ?? 0), 0) ?? 0;
    rows.push({
      id: word.id,
      lookupStatus: lookupRes.status,
      enrichStatus: enrichRes.status,
      lookupMs: round(lookupMs),
      enrichMs: round(enrichMs),
      totalMs: round(lookupMs + enrichMs),
      enrichmentPending: Boolean(lookupBody.enrichmentPending),
      sources: enrichBody.sources ?? lookupBody.sources ?? [],
      notFound: Boolean(enrichBody.notFound),
      examples,
    });
  }
  console.log(
    JSON.stringify(
      {
        mode: "e2e",
        source: process.env.DICTIONARY_WIKTIONARY_SOURCE || "remote",
        lookup: summarize(rows.map((row) => row.lookupMs)),
        enrich: summarize(rows.map((row) => row.enrichMs)),
        total: summarize(rows.map((row) => row.totalMs)),
        byLang: {
          en: summarize(rows.filter((row) => row.id.startsWith("en:")).map((row) => row.totalMs)),
          zh: summarize(rows.filter((row) => row.id.startsWith("zh:")).map((row) => row.totalMs)),
          ja: summarize(rows.filter((row) => row.id.startsWith("ja:")).map((row) => row.totalMs)),
        },
        rows,
      },
      null,
      2
    )
  );
}

const mode = process.argv[2] || "boot";
if (mode === "boot") await boot();
else if (mode === "boot-sqlite") await bootSqlite();
else if (mode === "local") await timeLocal();
else if (mode === "remote") await timeRemote();
else if (mode === "lookup") await timeLookupOnly();
else if (mode === "memory") await memory();
else if (mode === "e2e") await e2e();
else {
  console.error(`unknown mode ${mode}`);
  process.exit(1);
}
