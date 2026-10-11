#!/usr/bin/env bun
/**
 * Before/after timings for CJK dictionary lookup.
 * Writes JSON to the path in DICTIONARY_BENCH_OUT (default /tmp/dictionary-bench.json).
 *
 * DICTIONARY_DATA_DIR must point at the raw datasets. Wiktionary is optional:
 * set DICTIONARY_BENCH_WIKTIONARY=1 to time the live endpoint (one call per query).
 */
import { performance } from "node:perf_hooks";
import { getDictionaryIndex, getKanjiInfoMap, warmDictionaryIndexes } from "../api/dictionary/_helpers/_datasets.js";
import { fetchWiktionary } from "../api/dictionary/_helpers/_remote.js";
import {
  beginDictionaryLookup,
  lookupDictionary,
  type DictionaryLookupDeps,
  type DictionaryLookupTimings,
} from "../api/dictionary/_helpers/_lookup.js";
import type { DictionaryLanguage, DictionaryQueryLanguage } from "../src/shared/dictionary.js";

interface QueryCase {
  id: string;
  q: string;
  lang: DictionaryQueryLanguage;
  indexLang: Exclude<DictionaryLanguage, "en">;
}

const QUERIES: QueryCase[] = [
  { id: "zh:学习", q: "学习", lang: "zh", indexLang: "zh" },
  { id: "zh:学习中文", q: "学习中文", lang: "zh", indexLang: "zh" },
  { id: "zh:电脑", q: "电脑", lang: "zh", indexLang: "zh" },
  { id: "zh:你好", q: "你好", lang: "zh", indexLang: "zh" },
  { id: "zh:銀行", q: "銀行", lang: "zh", indexLang: "zh" },
  { id: "zh:xue2xi2", q: "xue2xi2", lang: "zh", indexLang: "zh" },
  { id: "zh:xuéxí", q: "xué xí", lang: "zh", indexLang: "zh" },
  { id: "ja:食べる", q: "食べる", lang: "ja", indexLang: "ja" },
  { id: "ja:勉強", q: "勉強", lang: "ja", indexLang: "ja" },
  { id: "ja:学習", q: "学習", lang: "ja", indexLang: "ja" },
  { id: "ja:手紙", q: "手紙", lang: "ja", indexLang: "ja" },
  { id: "ja:たべる", q: "たべる", lang: "ja", indexLang: "ja" },
  { id: "ja:東京大学", q: "東京大学", lang: "ja", indexLang: "ja" },
  { id: "auto:学习", q: "学习", lang: "auto", indexLang: "zh" },
  { id: "auto:学习中文", q: "学习中文", lang: "auto", indexLang: "zh" },
  { id: "auto:銀行", q: "銀行", lang: "auto", indexLang: "zh" },
  { id: "auto:学習", q: "学習", lang: "auto", indexLang: "zh" },
  { id: "auto:手紙", q: "手紙", lang: "auto", indexLang: "zh" },
  { id: "auto:東京大学", q: "東京大学", lang: "auto", indexLang: "zh" },
  { id: "auto:你好", q: "你好", lang: "auto", indexLang: "zh" },
];

const WARM_ITERS = 40;

function percentile(samples: number[], p: number): number {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function round(ms: number): number {
  return Math.round(ms * 100) / 100;
}

function mb(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

const deps: DictionaryLookupDeps = {
  getIndex: getDictionaryIndex,
  getKanjiInfo: getKanjiInfoMap,
  fetchWiktionary: async () => null,
};

async function timeCall(fn: () => unknown): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

async function main() {
  const memBefore = process.memoryUsage();
  const bootStart = performance.now();
  const warm = await warmDictionaryIndexes();
  const bootMs = performance.now() - bootStart;
  const memAfter = process.memoryUsage();

  const perLang: Record<string, { ms: number; entries: number }> = {};
  for (const lang of ["zh", "ja", "ko", "en"] as DictionaryLanguage[]) {
    const index = await getDictionaryIndex(lang);
    perLang[lang] = { ms: 0, entries: index.size };
  }
  const kanji = await getKanjiInfoMap();

  const rows = [];
  for (const query of QUERIES) {
    const index = await getDictionaryIndex(query.indexLang);
    const indexSearchMs = await timeCall(() => index.lookupHeadword(query.q));
    const segmentMs = await timeCall(() => index.segment(query.q));
    const compoundsMs = await timeCall(() => {
      index.findCompounds(query.q, 12);
      index.findCompoundEntries(query.q, 1200);
    });
    const kanjiMs =
      query.indexLang === "ja" ? await timeCall(() => getKanjiInfoMap()) : 0;

    let wikiMs = 0;
    if (process.env.DICTIONARY_BENCH_WIKTIONARY === "1") {
      wikiMs = await timeCall(() => fetchWiktionary(query.q, query.indexLang, null));
    }

    const firstPending = await beginDictionaryLookup(query.q, query.lang, deps);
    const firstMs = firstPending.timings.totalMs;
    const phaseSamples: DictionaryLookupTimings[] = [firstPending.timings];
    const samples: number[] = [];
    for (let i = 0; i < WARM_ITERS; i++) {
      const pending = await beginDictionaryLookup(query.q, query.lang, deps);
      samples.push(pending.timings.totalMs);
      phaseSamples.push(pending.timings);
    }
    const result = await firstPending.final;
    const medianPhases = phaseSamples[Math.floor(phaseSamples.length / 2)];
    rows.push({
      id: query.id,
      lang: result.lang,
      entries: result.entries.length,
      phrases: result.phrases.length,
      notFound: result.notFound,
      indexSearchMs: round(medianPhases.indexSearchMs),
      segmentMs: round(medianPhases.segmentMs),
      findCompoundsMs: round(medianPhases.findCompoundsMs),
      kanjidicMs: round(medianPhases.kanjidicMs),
      wiktionaryMs: round(wikiMs || medianPhases.wiktionaryMs),
      autoSecondPassMs: round(medianPhases.autoSecondPassMs),
      directIndexSearchMs: round(indexSearchMs),
      directSegmentMs: round(segmentMs),
      directCompoundsMs: round(compoundsMs),
      directKanjidicMs: round(kanjiMs),
      firstLookupMs: round(firstMs),
      warmP50Ms: round(percentile(samples, 50)),
      warmP95Ms: round(percentile(samples, 95)),
    });
    console.log(
      `${query.id} lang=${result.lang} first=${round(firstMs)}ms p50=${round(percentile(samples, 50))}ms p95=${round(percentile(samples, 95))}ms index=${round(medianPhases.indexSearchMs)} segment=${round(medianPhases.segmentMs)} compounds=${round(medianPhases.findCompoundsMs)} kanji=${round(medianPhases.kanjidicMs)} auto2=${round(medianPhases.autoSecondPassMs)} entries=${result.entries.length}`
    );
  }

  const report = {
    label: process.env.DICTIONARY_BENCH_LABEL || "before",
    bootMs: round(bootMs),
    warm,
    heapBeforeMb: mb(memBefore.heapUsed),
    heapAfterMb: mb(memAfter.heapUsed),
    rssAfterMb: mb(memAfter.rss),
    externalAfterMb: mb(memAfter.external),
    kanjiEntries: kanji.size,
    indexes: perLang,
    queries: rows,
  };
  const out = process.env.DICTIONARY_BENCH_OUT || "/tmp/dictionary-bench.json";
  await Bun.write(out, JSON.stringify(report, null, 2));
  console.log(`boot ${round(bootMs)}ms heap ${report.heapAfterMb}MB rss ${report.rssAfterMb}MB`);
  console.log(`wrote ${out}`);
}

await main();
