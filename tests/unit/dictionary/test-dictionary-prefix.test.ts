#!/usr/bin/env bun
import { describe, expect, test } from "bun:test";
import { DictionaryIndex, type DictionaryIndexOptions } from "../../../api/dictionary/_helpers/_index";
import { encodeIndexSnapshot, decodeIndexSnapshot } from "../../../api/dictionary/_helpers/_snapshot";
import { buildChineseIndex } from "../../../api/dictionary/_helpers/_datasets";
import { parseCedict, parseCedictLine } from "../../../api/dictionary/_helpers/_parsers";
import type { DictionaryEntry } from "../../../src/shared/dictionary";

const CEDICT = `
學習 学习 [xue2 xi2] /to learn/to study/
學生 学生 [xue2 sheng5] /student/
學校 学校 [xue2 xiao4] /school/
學 学 [xue2] /to learn/
中文 中文 [Zhong1 wen2] /Chinese language/
我 我 [wo3] /I/me/
想 想 [xiang3] /to think/
愛 爱 [ai4] /to love/
大 大 [da4] /big/
大一統 大一统 [da4 yi1 tong3] /unification/
大丈夫 大丈夫 [da4 zhang4 fu5] /a true man/
偉大 伟大 [wei3 da4] /great/
電腦 电脑 [dian4 nao3] /computer/
你好 你好 [ni3 hao3] /hello/
`;

function entry(headword: string, gloss: string, extra: Partial<DictionaryEntry> = {}): DictionaryEntry {
  return {
    id: headword,
    lang: "zh",
    headword,
    senses: [{ glosses: [gloss] }],
    source: "cc-cedict",
    ...extra,
  };
}

interface OracleRow {
  index: number;
  rank: number;
  headword: string;
  keys: string[];
  joined: string;
}

function oracleRows(entries: DictionaryEntry[], options: DictionaryIndexOptions): OracleRow[] {
  return entries.map((item, index) => {
    const keys = Array.from(new Set([item.headword, ...(options.headwordKeys?.(item) ?? [])].filter(Boolean)));
    return {
      index,
      rank: Math.min(255, Math.max(0, options.rank?.(item) ?? 0)),
      headword: item.headword,
      keys,
      joined: keys.join("\u0001"),
    };
  });
}

/** The pre-trie scans, kept here so the prefix index has to match them. */
function linearCompounds(rows: OracleRow[], headword: string, limit: number): string[] {
  const exact = `\u0001${headword}\u0001`;
  const matches = rows
    .filter((row) => row.joined.includes(headword) && !`\u0001${row.joined}\u0001`.includes(exact))
    .sort((a, b) => {
      const aStarts = a.headword.startsWith(headword) ? 0 : 1;
      const bStarts = b.headword.startsWith(headword) ? 0 : 1;
      return a.rank - b.rank || aStarts - bStarts || a.headword.length - b.headword.length || a.index - b.index;
    });
  const seen = new Set<string>();
  const phrases: string[] = [];
  for (const row of matches) {
    if (seen.has(row.headword)) continue;
    seen.add(row.headword);
    phrases.push(row.headword);
    if (phrases.length >= limit) break;
  }
  return phrases;
}

function linearCompoundEntries(rows: OracleRow[], headword: string, limit: number): number[] {
  const matches: { index: number; length: number; rank: number }[] = [];
  for (const row of rows) {
    if (row.keys.some((key) => key === headword)) continue;
    let length = 0;
    for (const key of row.keys) {
      if (!key.startsWith(headword)) continue;
      const keyLength = Array.from(key).length;
      if (length === 0 || keyLength < length) length = keyLength;
    }
    if (length === 0) continue;
    matches.push({ index: row.index, length, rank: row.rank });
  }
  matches.sort((a, b) => a.rank - b.rank || a.length - b.length || a.index - b.index);
  return matches.slice(0, limit).map((match) => match.index);
}

function linearSegment(keys: Set<string>, text: string, maxWordLength = 8): string[] {
  const chars = Array.from(text);
  const words: string[] = [];
  let i = 0;
  while (i < chars.length) {
    let matched = "";
    for (let length = Math.min(maxWordLength, chars.length - i); length >= 1; length--) {
      const candidate = chars.slice(i, i + length).join("");
      if (keys.has(candidate)) {
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

function linearSuggest(rows: OracleRow[], prefix: string, limit = 8): string[] {
  const byHeadword = new Map<string, number>();
  for (const row of rows) {
    for (const key of row.keys) {
      if (!byHeadword.has(key)) byHeadword.set(key, row.index);
    }
  }
  const results: number[] = [];
  for (const [key, index] of byHeadword) {
    if (key !== prefix && key.startsWith(prefix)) results.push(index);
    if (results.length > limit * 20) break;
  }
  const ranked = [...results].sort(
    (a, b) => rows[a].rank - rows[b].rank || rows[a].headword.length - rows[b].headword.length
  );
  return Array.from(new Set(ranked.map((index) => rows[index].headword))).slice(0, limit);
}

const options: DictionaryIndexOptions = {
  headwordKeys: (item) => [item.traditional ?? "", item.simplified ?? ""].filter(Boolean),
  rank: (item) => (item.tags?.includes("late") ? 2 : 0),
};

describe("prefix segmentation and compounds", () => {
  const entries = [
    entry("学习", "to learn", { traditional: "學習", simplified: "学习" }),
    entry("学", "to learn", { traditional: "學", simplified: "学" }),
    entry("学生", "student", { traditional: "學生", simplified: "学生" }),
    entry("中文", "Chinese"),
    entry("我", "I"),
    entry("想", "to think"),
    entry("大", "big"),
    entry("大一统", "unification"),
    entry("大丈夫", "a true man"),
    entry("伟大", "great", { tags: ["late"] }),
    entry("电脑", "computer"),
    entry("你好", "hello"),
  ];
  const index = new DictionaryIndex("zh", entries, options);
  const rows = oracleRows(entries, options);
  const keys = new Set(rows.flatMap((row) => row.keys));

  test("longest-match segmentation matches the linear scan", () => {
    for (const text of ["我想学习中文", "学习中文", "学", "电脑你好", "zzz学", "大一统伟大"]) {
      expect(index.segment(text)).toEqual(linearSegment(keys, text));
    }
    expect(index.segment("我想学习中文")).toEqual(["我", "想", "学习", "中文"]);
    expect(index.segment("学习中文", 1)).toEqual(linearSegment(keys, "学习中文", 1));
  });

  test("prefix compounds and infix phrases match the linear scans", () => {
    for (const headword of ["大", "学", "学习", "你", "伟", "文"]) {
      expect(index.findCompounds(headword, 12).map((phrase) => phrase.headword)).toEqual(
        linearCompounds(rows, headword, 12)
      );
      expect(index.findCompoundEntries(headword, 20).map((item) => item.id)).toEqual(
        linearCompoundEntries(rows, headword, 20).map((index) => entries[index].id)
      );
    }
    expect(index.findCompoundEntries("大").map((item) => item.headword)).toEqual(["大一统", "大丈夫"]);
    expect(index.findCompounds("大").map((phrase) => phrase.headword)).toEqual(
      expect.arrayContaining(["大一统", "大丈夫", "伟大"])
    );
  });

  test("suggestions keep the old insertion-order cap", () => {
    const many = Array.from({ length: 200 }, (_, n) =>
      entry(`学${String(n).padStart(3, "0")}`, "item", { tags: n % 5 === 0 ? ["late"] : undefined })
    );
    const withRoot = [entry("学", "root"), ...many];
    const wide = new DictionaryIndex("zh", withRoot, options);
    const wideRows = oracleRows(withRoot, options);
    expect(wide.suggest("学", 8)).toEqual(linearSuggest(wideRows, "学", 8));
    expect(index.suggest("学", 8)).toEqual(linearSuggest(rows, "学", 8));
  });

  test("snapshot round-trip keeps segmentation, compounds, and readings", () => {
    const built = buildChineseIndex(parseCedict(CEDICT));
    const restored = DictionaryIndex.restore({
      ...decodeIndexSnapshot(encodeIndexSnapshot(built.exportParts())).parts,
      materialize: (row) => parseCedictLine(row)!,
    });
    expect(restored.size).toBe(built.size);
    for (const query of ["学习", "电脑", "你好", "大", "銀行"]) {
      expect(restored.lookupHeadword(query).map((item) => item.id)).toEqual(
        built.lookupHeadword(query).map((item) => item.id)
      );
      expect(restored.findCompounds(query, 12)).toEqual(built.findCompounds(query, 12));
      expect(restored.findCompoundEntries(query, 40).map((item) => item.id)).toEqual(
        built.findCompoundEntries(query, 40).map((item) => item.id)
      );
      expect(restored.segment(query)).toEqual(built.segment(query));
    }
    expect(restored.segment("我想学习中文")).toEqual(["我", "想", "学习", "中文"]);
    expect(restored.lookupReading("xuexi").map((item) => item.headword)).toEqual(
      built.lookupReading("xuexi").map((item) => item.headword)
    );
  });
});
