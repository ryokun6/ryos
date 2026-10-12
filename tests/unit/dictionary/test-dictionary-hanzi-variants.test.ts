import { describe, expect, test } from "bun:test";
import { buildChineseIndex } from "../../../api/dictionary/_helpers/_datasets";
import { isTraditionalVariantRow } from "../../../api/dictionary/_helpers/_hanzi";
import { lookupDictionary, type DictionaryLookupDeps } from "../../../api/dictionary/_helpers/_lookup";
import { parseCedict } from "../../../api/dictionary/_helpers/_parsers";
import { dictionaryCacheKey } from "../../../api/dictionary/_helpers/_remote";
import {
  hanziCardGlyph,
  hanziCardReadings,
  hanziCardVariant,
  hanziCardsForEntry,
} from "../../../src/apps/dictionary/utils/hanziCards";
import type { DictionaryHanziInfo } from "../../../src/shared/dictionary";

// Real CC-CEDICT rows. 荳 sorts before 豆 in the source file.
const CEDICT = `
荳 豆 [dou4] /legume; pulse; bean; pea (CL:顆|颗[ke1],粒[li4]) (variant of 豆[dou4])/
豆 豆 [dou4] /legume; pulse; bean; pea (CL:顆|颗[ke1],粒[li4])/(old) stemmed cup or bowl/
腐 腐 [fu3] /decay/rotten/
豆腐 豆腐 [dou4 fu5] /tofu/bean curd/
乾 乾 [qian2] /one of the Eight Trigrams 八卦[ba1 gua4], symbolizing heaven/male principle/
乾 干 [gan1] /dry/dried food/empty; hollow/
干 干 [gan1] /(bound form) to have to do with; to concern oneself with/
幹 干 [gan4] /tree trunk/main part of sth/to manage/to work/to do/
淨 净 [jing4] /clean/completely/only/
乾淨 干净 [gan1 jing4] /clean/neat/
台 台 [tai1] /used in place names/
台 台 [tai2] /(classical) you (in letters)/variant of 臺|台[tai2]/
臺 台 [tai2] /platform/stage/terrace/
檯 台 [tai2] /desk; table; counter/
灣 湾 [wan1] /bay/gulf/
臺灣 台湾 [Tai2 wan1] /Taiwan/
裏 里 [li3] /variant of 裡|里[li3]/
裡 里 [li3] /lining/interior/inside/internal/also written 裏|里[li3]/
里 里 [li3] /li, ancient measure of length, approx. 500 m/neighborhood/
這 这 [zhe4] /this/
這裡 这里 [zhe4 li3] /here/
公 公 [gong1] /public/collectively owned/
公里 公里 [gong1 li3] /kilometer/
學 学 [xue2] /to learn/to study/
習 习 [xi2] /to practice/habit/
學習 学习 [xue2 xi2] /to learn/to study/
好 好 [hao3] /good/appropriate; proper/
好 好 [hao4] /to be fond of; to have a tendency to/
愛 爱 [ai4] /to love/affection/
愛好 爱好 [ai4 hao4] /to like; to be fond of/interest; hobby/
`;

const index = buildChineseIndex(parseCedict(CEDICT));

const deps: DictionaryLookupDeps = {
  getIndex: async () => index,
};

async function cardsFor(word: string): Promise<DictionaryHanziInfo[]> {
  const result = await lookupDictionary(word, "zh", deps);
  const entry = result.entries.find((item) => item.headword === word);
  expect(entry).toBeDefined();
  return entry!.hanzi ?? [];
}

const forms = (cards: DictionaryHanziInfo[]) =>
  cards.map((card) => `${card.simplified}/${card.traditional}`);

describe("hanzi cards keep the headword's own characters", () => {
  test("豆腐 shows 豆 (not 荳) with each character's gloss and reading", async () => {
    const cards = await cardsFor("豆腐");
    expect(cards).toEqual([
      { simplified: "豆", traditional: "豆", reading: "dou4", meaning: "legume" },
      { simplified: "腐", traditional: "腐", reading: "fu3", meaning: "decay" },
    ]);
    for (const card of cards) {
      expect(hanziCardGlyph(card, "traditional")).toBe(card.simplified);
      expect(hanziCardGlyph(card, "simplified")).toBe(card.simplified);
      expect(hanziCardVariant(card, "traditional")).toBeNull();
    }
    expect(JSON.stringify(cards)).not.toContain("荳");
    expect(hanziCardReadings(cards[1], { pinyin: true, zhuyin: true })).toEqual({
      pinyin: "fǔ",
      zhuyin: "ㄈㄨˇ",
    });
  });

  test("豆 on its own resolves to the standard 豆/豆 row", async () => {
    expect(index.lookupHeadword("豆")[0]).toMatchObject({ traditional: "豆", simplified: "豆" });
    const result = await lookupDictionary("豆", "zh", deps);
    expect(result.entries[0]).toMatchObject({ headword: "豆", traditional: "豆" });
    expect(result.entries[0].hanzi).toEqual([
      { simplified: "豆", traditional: "豆", reading: "dou4", meaning: "legume" },
    ]);
    // The 荳 spelling stays its own, lower-ranked row instead of merging into 豆.
    const rows = result.entries.filter((entry) => entry.headword === "豆");
    expect(rows.map((entry) => entry.traditional)).toEqual(["豆", "荳"]);
  });

  test("干 rows with different traditional forms stay separate", async () => {
    const result = await lookupDictionary("干", "zh", deps);
    const rows = result.entries.filter((entry) => entry.headword === "干");
    expect(rows.map((entry) => `${entry.traditional} ${entry.reading}`)).toEqual([
      "乾 gan1",
      "干 gan1",
      "幹 gan4",
    ]);
    for (const entry of rows) {
      expect(entry.hanzi?.[0]).toMatchObject({ simplified: "干", traditional: entry.traditional });
    }
  });

  test("keeps traditional forms where the word genuinely differs", async () => {
    expect(forms(await cardsFor("学习"))).toEqual(["学/學", "习/習"]);
    expect(forms(await cardsFor("干净"))).toEqual(["干/乾", "净/淨"]);
    expect(forms(await cardsFor("台湾"))).toEqual(["台/臺", "湾/灣"]);
    expect(forms(await cardsFor("这里"))).toEqual(["这/這", "里/裡"]);
  });

  test("does not convert characters the word writes the same in both scripts", async () => {
    expect(forms(await cardsFor("公里"))).toEqual(["公/公", "里/里"]);
    expect(forms(await cardsFor("腐"))).toEqual(["腐/腐"]);
  });

  test("prefers the row with the word's exact tone", async () => {
    const [, hao] = await cardsFor("爱好");
    expect(hao).toEqual({
      simplified: "好",
      traditional: "好",
      reading: "hao4",
      meaning: "to be fond of",
    });
  });

  test("flags only rows whose traditional form is a variant of the same character", () => {
    const rows = parseCedict(CEDICT);
    const flagged = rows.filter(isTraditionalVariantRow).map((row) => row.traditional);
    expect(flagged).toEqual(["荳"]);
  });

  test("lookup cache keys moved past responses cached without hanzi cards", () => {
    expect(dictionaryCacheKey("lookup", "zh", "豆腐")).not.toContain(":v5:");
  });

  test("client fallback cards still use the headword's characters", () => {
    const cards = hanziCardsForEntry({
      id: "cc-cedict:豆腐:dou4_fu5",
      lang: "zh",
      headword: "豆腐",
      traditional: "豆腐",
      simplified: "豆腐",
      reading: "dou4 fu5",
      senses: [{ glosses: ["tofu"] }],
      source: "cc-cedict",
    });
    expect(forms(cards)).toEqual(["豆/豆", "腐/腐"]);
  });
});
