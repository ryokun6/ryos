import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hanziCharDataLoader } from "../../../src/apps/dictionary/utils/hanziStrokeData";
import type { DictionaryEntry } from "../../../src/shared/dictionary";
import {
  hanziCardGlyph,
  hanziCardReadings,
  hanziCardVariant,
  hanziCardsForEntry,
} from "../../../src/apps/dictionary/utils/hanziCards";

const root = join(import.meta.dir, "../../..");

function zhEntry(overrides: Partial<DictionaryEntry> = {}): DictionaryEntry {
  return {
    id: "cc-cedict:學習:xue2_xi2",
    lang: "zh",
    headword: "学习",
    traditional: "學習",
    simplified: "学习",
    reading: "xue2 xi2",
    senses: [{ glosses: ["to learn"] }],
    source: "cc-cedict",
    ...overrides,
  };
}

describe("hanzi cards", () => {
  test("derives per-character cards from a Chinese entry", () => {
    const cards = hanziCardsForEntry(zhEntry());
    expect(cards).toEqual([
      { simplified: "学", traditional: "學", reading: "xue2" },
      { simplified: "习", traditional: "習", reading: "xi2" },
    ]);
    expect(hanziCardGlyph(cards[0], "traditional")).toBe("學");
    expect(hanziCardGlyph(cards[0], "simplified")).toBe("学");
    expect(hanziCardVariant(cards[0], "traditional")).toBe("学");
    expect(hanziCardVariant(cards[0], "simplified")).toBe("學");
  });

  test("hides the variant when both scripts match", () => {
    const [card] = hanziCardsForEntry(
      zhEntry({
        headword: "中",
        traditional: "中",
        simplified: "中",
        reading: "zhong1",
      })
    );
    expect(hanziCardVariant(card, "traditional")).toBeNull();
    expect(hanziCardVariant(card, "simplified")).toBeNull();
  });

  test("follows the pinyin and zhuyin settings", () => {
    const [card] = hanziCardsForEntry(zhEntry());
    expect(hanziCardReadings(card, { pinyin: true, zhuyin: false }).pinyin).toBe("xué");
    expect(hanziCardReadings(card, { pinyin: true, zhuyin: false }).zhuyin).toBeNull();
    expect(hanziCardReadings(card, { pinyin: false, zhuyin: true }).zhuyin).toBe("ㄒㄩㄝˊ");
    expect(hanziCardReadings(card, { pinyin: false, zhuyin: false })).toEqual({
      pinyin: null,
      zhuyin: null,
    });
  });

  test("prefers attached CC-CEDICT rows and skips Japanese", () => {
    const attached = hanziCardsForEntry(
      zhEntry({
        hanzi: [{ simplified: "学", traditional: "學", reading: "xue2", meaning: "to learn" }],
      })
    );
    expect(attached).toEqual([
      { simplified: "学", traditional: "學", reading: "xue2", meaning: "to learn" },
    ]);
    expect(
      hanziCardsForEntry({
        id: "jmdict:1",
        lang: "ja",
        headword: "学",
        senses: [{ glosses: ["learning"] }],
        source: "jmdict",
      })
    ).toEqual([]);
  });

  test("loads hanzi-writer only from the card component", () => {
    const component = readFileSync(
      join(root, "src/apps/dictionary/components/DictionaryHanziCards.tsx"),
      "utf8"
    );
    const loader = readFileSync(
      join(root, "src/apps/dictionary/utils/hanziStrokeData.ts"),
      "utf8"
    );
    expect(component).not.toMatch(/^import HanziWriter/m);
    expect(component).toContain('import("hanzi-writer")');
    expect(component).toContain("charDataLoader");
    expect(component).toContain("loopCharacterAnimation");
    expect(component).toContain("onLoadCharDataSuccess");
    expect(component).toContain("onLoadCharDataError");
    expect(component).toContain("HanziCardsErrorBoundary");
    expect(component).toContain("entry.headword");
    expect(loader).toContain("hanzi-writer-data@2.0.1");
    expect(loader).toContain("onError");
    expect(loader).toContain("AbortSignal");
  });

  test("an aborted stroke load does not deliver character data", () => {
    const controller = new AbortController();
    controller.abort();
    let loaded = false;
    let errored = false;
    hanziCharDataLoader(
      "字",
      () => {
        loaded = true;
      },
      () => {
        errored = true;
      },
      controller.signal
    );
    expect(loaded).toBe(false);
    expect(errored).toBe(true);
  });
});

describe("handwriting iOS selection", () => {
  test("disables selection on the pad, canvas, and candidates only", () => {
    const pad = readFileSync(
      join(root, "src/apps/dictionary/components/DictionaryHandwritingPad.tsx"),
      "utf8"
    );
    const css = readFileSync(join(root, "src/index.css"), "utf8");
    const entry = readFileSync(
      join(root, "src/apps/dictionary/components/DictionaryEntryView.tsx"),
      "utf8"
    );
    expect(pad).toContain("dictionary-handwriting");
    expect(pad).toContain("dictionary-handwriting-canvas");
    expect(pad).toContain("dictionary-handwriting-candidates");
    expect(pad).toContain('addEventListener("touchstart", preventTextGesture, { passive: false })');
    expect(pad).toContain('addEventListener("pointerdown", preventTextGesture, { passive: false })');
    expect(pad).toContain("event.preventDefault()");
    expect(css).toMatch(
      /\.dictionary-handwriting,\s*\n\s*\.dictionary-handwriting-canvas,\s*\n\s*\.dictionary-handwriting-candidates,\s*\n\s*\.dictionary-handwriting-candidates \* \{[\s\S]*-webkit-user-select: none;[\s\S]*user-select: none;[\s\S]*-webkit-touch-callout: none;/
    );
    expect(css).toMatch(/\.dictionary-handwriting-canvas \{[\s\S]*touch-action: none;/);
    expect(entry).toContain("select-text");
    expect(entry).not.toContain("dictionary-handwriting");
  });
});
