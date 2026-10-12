/**
 * Pressing a hanzi or kanji card looks that character up. The hanzi stroke box
 * stays the replay control, and a lookup that swaps the word must not throw
 * from Hanzi Writer teardown (#2008).
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DictionaryEntry } from "../../../src/shared/dictionary";
import type { DictionaryLogic } from "../../../src/apps/dictionary/hooks/useDictionaryLogic";
import type { HanziCharDataLoader } from "../../../src/apps/dictionary/utils/hanziStrokeData";
import { DictionaryHanziCards } from "../../../src/apps/dictionary/components/DictionaryHanziCards";
import { DictionaryKanjiCards } from "../../../src/apps/dictionary/components/DictionaryKanjiCards";

let registeredDomHere = false;
const originalActEnvironment = Object.getOwnPropertyDescriptor(
  globalThis,
  "IS_REACT_ACT_ENVIRONMENT"
);

beforeAll(() => {
  if (typeof document === "undefined") {
    GlobalRegistrator.register();
    registeredDomHere = true;
  }
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    writable: true,
    value: true,
  });
});

afterAll(() => {
  if (originalActEnvironment) {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", originalActEnvironment);
  } else {
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  }
  if (registeredDomHere && GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

const tofu: DictionaryEntry = {
  id: "cc-cedict:豆腐:dou4_fu5",
  lang: "zh",
  headword: "豆腐",
  traditional: "豆腐",
  simplified: "豆腐",
  reading: "dou4 fu5",
  senses: [{ glosses: ["tofu"] }],
  source: "cc-cedict",
  hanzi: [
    { simplified: "豆", traditional: "豆", reading: "dou4", meaning: "legume" },
    { simplified: "腐", traditional: "腐", reading: "fu3", meaning: "decay" },
  ],
};

const bean: DictionaryEntry = {
  id: "cc-cedict:豆:dou4",
  lang: "zh",
  headword: "豆",
  traditional: "豆",
  simplified: "豆",
  reading: "dou4",
  senses: [{ glosses: ["legume"] }],
  source: "cc-cedict",
  hanzi: [{ simplified: "豆", traditional: "豆", reading: "dou4", meaning: "legume" }],
};

const learn: DictionaryEntry = {
  id: "cc-cedict:學習:xue2_xi2",
  lang: "zh",
  headword: "学习",
  traditional: "學習",
  simplified: "学习",
  reading: "xue2 xi2",
  senses: [{ glosses: ["to learn"] }],
  source: "cc-cedict",
};

const study: DictionaryEntry = {
  id: "jmdict:1",
  lang: "ja",
  headword: "勉強",
  reading: "べんきょう",
  senses: [{ glosses: ["study"] }],
  source: "jmdict",
  kanji: [
    { literal: "勉", meanings: ["exertion"], onyomi: ["ベン"], kunyomi: [], strokeCount: 10 },
    { literal: "強", meanings: ["strong"], onyomi: ["キョウ"], kunyomi: ["つよ.い"], strokeCount: 11 },
  ],
};

type Search = [word: string, lang: string | undefined];

function makeLogic(
  searches: Search[],
  script: "simplified" | "traditional" = "simplified",
  onSearch?: (word: string) => void
): DictionaryLogic {
  return {
    chineseScript: script,
    phonetics: { pinyin: true, zhuyin: false, furigana: false, romaji: false, koreanRomanization: false },
    t: (key: string, options?: { character?: string; defaultValue?: string }) =>
      options?.character ? `${key}:${options.character}` : (options?.defaultValue ?? key),
    searchFor: (word: string, lang?: string) => {
      searches.push([word, lang]);
      onSearch?.(word);
    },
  } as unknown as DictionaryLogic;
}

const strokeData = {
  strokes: ["M 512 512 L 600 600"],
  medians: [[[512, 512], [600, 600]]],
};
const loadedLoader: HanziCharDataLoader = (_char, onLoad) => onLoad(strokeData);

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let uncaught: unknown[] = [];
let consoleErrors: unknown[][] = [];
let originalConsoleError: typeof console.error | null = null;

async function mount(node: React.ReactNode) {
  uncaught = [];
  consoleErrors = [];
  originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args);
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container, { onUncaughtError: (error) => uncaught.push(error) });
  await act(async () => {
    root?.render(node);
  });
  await settle();
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function click(element: Element | null | undefined) {
  expect(element).toBeTruthy();
  await act(async () => {
    (element as HTMLElement).click();
  });
  await settle();
}

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
  if (originalConsoleError) console.error = originalConsoleError;
  originalConsoleError = null;
});

describe("hanzi card lookup", () => {
  test("pressing a card looks up just that character", async () => {
    const searches: Search[] = [];
    await mount(
      React.createElement(DictionaryHanziCards, {
        entry: tofu,
        l: makeLogic(searches),
        charDataLoader: loadedLoader,
      })
    );
    const lookup = container?.querySelector("[data-hanzi-lookup='豆']");
    expect(lookup?.tagName).toBe("BUTTON");
    expect(lookup?.getAttribute("type")).toBe("button");
    expect(lookup?.getAttribute("aria-label")).toBe("apps.dictionary.ariaLabels.lookUpCharacter:豆");
    await click(lookup);
    expect(searches).toEqual([["豆", "zh"]]);
  });

  test("uses the character shown in the current script", async () => {
    const searches: Search[] = [];
    await mount(
      React.createElement(DictionaryHanziCards, {
        entry: learn,
        l: makeLogic(searches, "traditional"),
        charDataLoader: loadedLoader,
      })
    );
    await click(container?.querySelector("[data-hanzi-lookup='學']"));
    expect(searches).toEqual([["學", "zh"]]);
  });

  test("the stroke box replays instead of searching", async () => {
    const searches: Search[] = [];
    await mount(
      React.createElement(DictionaryHanziCards, {
        entry: tofu,
        l: makeLogic(searches),
        charDataLoader: loadedLoader,
      })
    );
    const replay = container?.querySelector<HTMLElement>(".dictionary-hanzi-stroke");
    expect(replay?.getAttribute("role")).toBe("button");
    expect(replay?.closest("button")).toBeNull();
    await click(replay);
    await act(async () => {
      replay?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(searches).toEqual([]);
  });

  test("a lookup that swaps the word does not throw from stroke teardown", async () => {
    const searches: Search[] = [];
    const pending: Array<() => void> = [];
    const deferredLoader: HanziCharDataLoader = (_char, onLoad, onError) => {
      pending.push(() => {
        onLoad(strokeData);
        onError?.(new Error("late"));
      });
    };
    function Probe() {
      const [entry, setEntry] = useState(tofu);
      const [loaded, setLoaded] = useState(true);
      const l = makeLogic(searches, "simplified", () => {
        setEntry(bean);
        setLoaded(false);
      });
      return React.createElement(DictionaryHanziCards, {
        entry,
        l,
        charDataLoader: loaded ? loadedLoader : deferredLoader,
      });
    }
    await mount(React.createElement(Probe));
    expect(container?.querySelectorAll("svg").length).toBeGreaterThan(0);

    await click(container?.querySelector("[data-hanzi-lookup='豆']"));
    expect(searches).toEqual([["豆", "zh"]]);
    expect(container?.querySelectorAll("[data-hanzi-key]").length).toBe(1);
    expect(container?.querySelector("[data-hanzi-key]")?.getAttribute("data-hanzi-key")).toContain(
      bean.id
    );

    // Press again while the new card's stroke data is still loading, then let
    // the stale load land after the cards are gone.
    await click(container?.querySelector("[data-hanzi-lookup='豆']"));
    await act(async () => {
      root?.unmount();
    });
    root = null;
    await act(async () => {
      for (const resolve of pending) resolve();
    });
    expect(uncaught).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

describe("kanji card lookup", () => {
  test("pressing a kanji card looks up just that kanji in Japanese", async () => {
    const searches: Search[] = [];
    await mount(React.createElement(DictionaryKanjiCards, { entry: study, l: makeLogic(searches) }));
    const card = container?.querySelector("[data-kanji-lookup='強']");
    expect(card?.tagName).toBe("BUTTON");
    expect(card?.getAttribute("type")).toBe("button");
    expect(card?.getAttribute("aria-label")).toBe("apps.dictionary.ariaLabels.lookUpCharacter:強");
    expect(card?.textContent).toContain("strong");
    await click(card);
    expect(searches).toEqual([["強", "ja"]]);
  });

  test("renders nothing without kanji rows", async () => {
    await mount(React.createElement(DictionaryKanjiCards, { entry: learn, l: makeLogic([]) }));
    expect(container?.innerHTML).toBe("");
  });
});
