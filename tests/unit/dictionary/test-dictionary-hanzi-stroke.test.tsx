/**
 * Hanzi stroke cards must survive a failed character-data load.
 * hanzi-writer throws synchronously from pauseAnimation once loadingFailed
 * is set, which is what Dictionary hit when a synonym click unmounted a card.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React, { act, StrictMode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DictionaryEntry } from "../../../src/shared/dictionary";
import type { DictionaryLogic } from "../../../src/apps/dictionary/hooks/useDictionaryLogic";
import type { HanziCharDataLoader } from "../../../src/apps/dictionary/utils/hanziStrokeData";
import {
  DictionaryHanziCards,
  HanziCardsErrorBoundary,
  HanziStroke,
} from "../../../src/apps/dictionary/components/DictionaryHanziCards";

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

const failingLoader: HanziCharDataLoader = (_char, _onLoad, onError) => {
  onError?.(new Error("missing stroke data"));
};

function zhEntry(
  id: string,
  headword: string,
  traditional: string,
  simplified: string,
  reading: string
): DictionaryEntry {
  return {
    id,
    lang: "zh",
    headword,
    traditional,
    simplified,
    reading,
    senses: [{ glosses: ["gloss"] }],
    source: "cc-cedict",
  };
}

const learn = zhEntry("cc-cedict:學習:xue2_xi2", "学习", "學習", "学习", "xue2 xi2");
const work = zhEntry("cc-cedict:工作:gong1_zuo4", "工作", "工作", "工作", "gong1 zuo4");

const logic = {
  chineseScript: "simplified",
  phonetics: {
    pinyin: false,
    zhuyin: false,
    furigana: false,
    romaji: false,
    koreanRomanization: false,
  },
  t: (key: string, options?: { character?: string }) =>
    options?.character ? `${key}:${options.character}` : key,
} as unknown as DictionaryLogic;

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let uncaught: unknown[] = [];
let consoleErrors: unknown[][] = [];
let rejections: unknown[] = [];
let originalConsoleError: typeof console.error | null = null;

function onRejection(event: PromiseRejectionEvent) {
  rejections.push(event.reason);
  event.preventDefault();
}

function installSpies() {
  uncaught = [];
  consoleErrors = [];
  rejections = [];
  originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args);
  };
  window.addEventListener("unhandledrejection", onRejection);
}

function restoreSpies() {
  if (originalConsoleError) console.error = originalConsoleError;
  originalConsoleError = null;
  window.removeEventListener("unhandledrejection", onRejection);
}

async function mount(node: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container, {
    onUncaughtError: (error) => {
      uncaught.push(error);
    },
  });
  await act(async () => {
    root?.render(node);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function unmount() {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
}

afterEach(async () => {
  if (root) await unmount();
  restoreSpies();
});

describe("hanzi stroke writer teardown", () => {
  test("hanzi-writer pauseAnimation throws after a failed character load", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const { default: HanziWriter } = await import("hanzi-writer");
    const writer = HanziWriter.create(host, "学", {
      width: 64,
      height: 64,
      onLoadCharDataError: () => undefined,
      charDataLoader: (_char, _onLoad, onError) => {
        onError?.(new Error("missing stroke data"));
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(() => writer.pauseAnimation()).toThrow(/Failed to load character data/);
    host.remove();
  });

  test("unmounting a loaded card pauses without throwing", async () => {
    installSpies();
    const okLoader: HanziCharDataLoader = (_char, onLoad) => {
      onLoad({
        strokes: ["M 512 512 L 600 600"],
        medians: [[[512, 512], [600, 600]]],
      });
    };
    await mount(
      React.createElement(HanziStroke, {
        character: "学",
        label: "replay 学",
        charDataLoader: okLoader,
      })
    );
    expect(container?.querySelector("svg")).toBeTruthy();
    expect(container?.querySelector("span[lang='zh']")).toBeNull();
    document.dispatchEvent(new Event("visibilitychange"));
    container?.querySelector<HTMLElement>("[role='button']")?.click();
    await unmount();
    expect(uncaught).toEqual([]);
    expect(rejections).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("unmounting a card after the loader fails does not throw", async () => {
    installSpies();
    await mount(
      React.createElement(HanziStroke, {
        character: "学",
        label: "replay 学",
        charDataLoader: failingLoader,
      })
    );
    expect(container?.textContent).toContain("学");
    expect(container?.querySelector("span[lang='zh']")?.textContent).toBe("学");
    await unmount();
    expect(uncaught).toEqual([]);
    expect(rejections).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("switching entries after a failed load does not throw", async () => {
    installSpies();
    function Probe({ entry }: { entry: DictionaryEntry }) {
      return React.createElement(DictionaryHanziCards, {
        entry,
        l: logic,
        charDataLoader: failingLoader,
      });
    }
    await mount(React.createElement(Probe, { entry: learn }));
    expect(container?.textContent).toContain("学");
    expect(container?.textContent).toContain("习");
    const firstKey = container?.querySelector("[data-hanzi-key]")?.getAttribute("data-hanzi-key");
    expect(firstKey).toContain(learn.id);
    expect(firstKey).toContain(learn.headword);
    expect(firstKey).toContain("学");

    await act(async () => {
      root?.render(React.createElement(Probe, { entry: work }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container?.textContent).toContain("工");
    expect(container?.textContent).toContain("作");
    expect(container?.textContent).not.toContain("学");
    const nextKey = container?.querySelector("[data-hanzi-key]")?.getAttribute("data-hanzi-key");
    expect(nextKey).toContain(work.id);
    expect(nextKey).toContain("工");

    document.dispatchEvent(new Event("visibilitychange"));
    container?.querySelector<HTMLElement>("[role='button']")?.click();
    await unmount();
    expect(uncaught).toEqual([]);
    expect(rejections).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("a late loader callback after unmount or a character switch does not throw", async () => {
    installSpies();
    const failers: Array<((error?: unknown) => void) | undefined> = [];
    const loaders: Array<(data: Record<string, unknown>) => void> = [];
    const deferredLoader: HanziCharDataLoader = (_char, onLoad, onError) => {
      loaders.push(onLoad);
      failers.push(onError);
    };
    function Probe({ character }: { character: string }) {
      return React.createElement(HanziStroke, {
        character,
        label: `replay ${character}`,
        charDataLoader: deferredLoader,
      });
    }
    await mount(React.createElement(Probe, { character: "学" }));
    expect(failers.length).toBeGreaterThan(0);
    const firstFail = failers[0];
    const firstLoad = loaders[0];

    await act(async () => {
      root?.render(React.createElement(Probe, { character: "习" }));
    });
    await unmount();
    await act(async () => {
      firstFail?.(new Error("late failure"));
      firstLoad?.({ strokes: [], medians: [] });
      failers[failers.length - 1]?.(new Error("late failure after switch"));
    });
    expect(uncaught).toEqual([]);
    expect(rejections).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("StrictMode remounts a failing card without throwing", async () => {
    installSpies();
    await mount(
      React.createElement(
        StrictMode,
        null,
        React.createElement(HanziStroke, {
          character: "学",
          label: "replay 学",
          charDataLoader: failingLoader,
        })
      )
    );
    expect(container?.textContent).toContain("学");
    await unmount();
    expect(uncaught).toEqual([]);
    expect(rejections).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("the hanzi section boundary keeps the dictionary mounted", async () => {
    installSpies();
    function Boom() {
      throw new Error("hanzi card failed");
    }
    function Probe() {
      const [resetKey, setResetKey] = useState("word-a");
      const child = resetKey === "word-a" ? React.createElement(Boom) : React.createElement("p", null, "strokes recovered");
      return React.createElement(
        "div",
        null,
        React.createElement("p", null, "dictionary stays"),
        React.createElement(
          HanziCardsErrorBoundary,
          {
            resetKey,
            fallback: React.createElement("p", null, "static glyph"),
          },
          child
        ),
        React.createElement(
          "button",
          { type: "button", onClick: () => setResetKey("word-b") },
          "next word"
        )
      );
    }
    await mount(React.createElement(Probe));
    expect(container?.textContent).toContain("dictionary stays");
    expect(container?.textContent).toContain("static glyph");
    expect(uncaught).toEqual([]);
    await act(async () => {
      container?.querySelector("button")?.click();
    });
    expect(container?.textContent).toContain("strokes recovered");
    expect(container?.textContent).not.toContain("static glyph");
  });
});
