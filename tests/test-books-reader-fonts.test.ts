import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BOOK_FONTS,
  buildEpubTheme,
  buildFontFaceCss,
  displayEpubTargetWithFallback,
  getBookFontCssStack,
  reflowEpubAfterFontsSettle,
  resolveEpubDisplayFallbackTarget,
  resolveBookCjkSerifStack,
} from "../src/apps/books/utils/booksReader";

const appFontsCss = readFileSync(
  join(import.meta.dir, "../public/fonts/fonts.css"),
  "utf8"
);

const settings = {
  fontId: "serif",
  fontSizePct: 100,
  columnMode: "auto" as const,
  themeOverride: "light" as const,
  lineHeight: 1.5,
};

const palette = {
  background: "#fff",
  text: "#111",
  link: "#00f",
  isDark: false,
};

describe("Books reader font choices", () => {
  test("offers the bundled rounded face in the font menu", () => {
    expect(BOOK_FONTS.map((font) => font.id)).toContain("rounded");
    expect(getBookFontCssStack("rounded")).toStartWith(
      '"ryOS VAG Rounded"'
    );
  });

  test("gives Geneva bundled CJK and emoji fallbacks", () => {
    const stack = getBookFontCssStack("geneva");

    expect(stack).toContain('"Geneva-12", Geneva, "ArkPixel"');
    expect(stack).toContain('"SerenityOS-Emoji"');
    expect(stack?.indexOf('"ArkPixel"')).toBeLessThan(
      stack?.indexOf('"SerenityOS-Emoji"') ?? -1
    );
  });

  test("loads llab light and bold rounded faces inside the app and EPUB iframes", () => {
    const css = buildFontFaceCss("https://os.example");

    for (const { file, weight } of [
      { file: "vag-rounded-light.woff2", weight: 400 },
      { file: "vag-rounded-bold.woff2", weight: 700 },
    ]) {
      expect(css).toContain(
        `font-family: "ryOS VAG Rounded";
  src: url("https://os.example/fonts/${file}") format("woff2");
  font-weight: ${weight};`
      );
      expect(appFontsCss).toContain(
        `font-family: "ryOS VAG Rounded";
  src: url("/fonts/${file}") format("woff2");
  font-weight: ${weight};`
      );
    }
    for (const oldFile of [
      "vag-rounded-100.woff2",
      "vag-rounded-400.woff2",
      "vag-rounded-700.woff2",
      "vag-rounded-900.woff2",
    ]) {
      expect(css).not.toContain(oldFile);
      expect(appFontsCss).not.toContain(oldFile);
    }
    expect(css).not.toContain("VAGRoundedStd-Bold");
    expect(appFontsCss).not.toContain("VAGRoundedStd-Bold");
  });

  test("loads bundled CJK and emoji fallbacks inside EPUB iframes", () => {
    const css = buildFontFaceCss("https://os.example");

    expect(css).toContain(
      'url("https://os.example/fonts/fusion-pixel-12px-proportional-ja.woff2")'
    );
    expect(css).toContain(
      'url("https://os.example/fonts/SerenityOS-Emoji.woff2")'
    );
  });
});

describe("Books reader settled-font pagination", () => {
  test("reflows only after fonts settle and restores the requested CFI", async () => {
    const calls: string[] = [];
    let releaseFonts = () => {};
    const fontsReady = new Promise<void>((resolve) => {
      releaseFonts = resolve;
    });
    const reflow = reflowEpubAfterFontsSettle({
      fontsReady,
      rendition: {
        spread: (spread, min) => calls.push(`spread:${spread}:${min}`),
        display: (target) => {
          calls.push(`display:${target}`);
        },
      },
      spread: "auto",
      minSpreadWidth: 560,
      target: "epubcfi(/6/8!/4/2/1:0)",
      isActive: () => true,
    });

    await Promise.resolve();
    expect(calls).toEqual([]);

    releaseFonts();
    expect(await reflow).toBe(true);
    expect(calls).toEqual([
      "spread:auto:560",
      "display:epubcfi(/6/8!/4/2/1:0)",
    ]);
  });

  test("does not touch a rendition that unmounted while fonts loaded", async () => {
    const calls: string[] = [];
    let releaseFonts = () => {};
    const fontsReady = new Promise<void>((resolve) => {
      releaseFonts = resolve;
    });
    let active = true;
    const reflow = reflowEpubAfterFontsSettle({
      fontsReady,
      rendition: {
        spread: () => calls.push("spread"),
        display: () => calls.push("display"),
      },
      spread: "auto",
      minSpreadWidth: 560,
      isActive: () => active,
    });

    active = false;
    releaseFonts();

    expect(await reflow).toBe(false);
    expect(calls).toEqual([]);
  });

  test("leaves browsers without a document font set on the initial layout", async () => {
    const calls: string[] = [];

    const reflowed = await reflowEpubAfterFontsSettle({
      fontsReady: undefined,
      rendition: {
        spread: () => calls.push("spread"),
        display: () => calls.push("display"),
      },
      spread: "none",
      minSpreadWidth: 560,
      isActive: () => true,
    });

    expect(reflowed).toBe(false);
    expect(calls).toEqual([]);
  });

  test("does not keep the reader pending if the settled-font redisplay hangs", async () => {
    const calls: string[] = [];

    const reflowed = await reflowEpubAfterFontsSettle({
      fontsReady: Promise.resolve(),
      rendition: {
        spread: () => calls.push("spread"),
        display: (target) => {
          calls.push(`display:${target}`);
          return new Promise<unknown>(() => {});
        },
      },
      spread: "auto",
      minSpreadWidth: 560,
      target: "epubcfi(/6/8!/4/2/1:0)",
      displayTimeoutMs: 1,
      isActive: () => true,
    });

    expect(reflowed).toBe(false);
    expect(calls).toEqual(["spread", "display:epubcfi(/6/8!/4/2/1:0)"]);
  });
});

describe("Books reader display recovery", () => {
  test("falls back from a saved CFI to the same spine section href", () => {
    const target = "epubcfi(/6/36!/4/2/1:0)";
    const receivedTargets: Array<string | number | undefined> = [];

    const fallback = resolveEpubDisplayFallbackTarget(
      {
        spine: {
          get: (received?: string | number) => {
            receivedTargets.push(received);
            return { href: "text/chapter-17.xhtml", index: 17 };
          },
        },
      },
      target
    );

    expect(fallback).toBe("text/chapter-17.xhtml");
    expect(receivedTargets).toEqual([target]);
  });

  test("uses the spine index when a fallback section has no href", () => {
    const fallback = resolveEpubDisplayFallbackTarget(
      {
        spine: {
          get: () => ({ index: 4 }),
        },
      },
      "epubcfi(/6/10!/4/2/1:0)"
    );

    expect(fallback).toBe(4);
  });

  test("resets the rendition and displays the fallback target after timeout", async () => {
    const calls: string[] = [];
    const stuckDisplay = new Promise<unknown>(() => {});
    const stuckRendition = {
      spread: () => {},
      display: (target?: string | number) => {
        calls.push(`initial:${target}`);
        return stuckDisplay;
      },
    };
    const fallbackRendition = {
      spread: () => {},
      display: (target?: string | number) => {
        calls.push(`fallback:${target}`);
      },
    };

    const result = await displayEpubTargetWithFallback({
      rendition: stuckRendition,
      target: "epubcfi(/6/36!/4/2/1:0)",
      fallbackTarget: "text/chapter-17.xhtml",
      initialTimeoutMs: 1,
      fallbackTimeoutMs: 50,
      isActive: () => true,
      onTimeout: () => calls.push("timeout"),
      resetAfterTimeout: () => {
        calls.push("reset");
        return fallbackRendition;
      },
    });

    expect(result.status).toBe("fallback-displayed");
    expect(result.rendition).toBe(fallbackRendition);
    expect(result.target).toBe("text/chapter-17.xhtml");
    expect(calls).toEqual([
      "initial:epubcfi(/6/36!/4/2/1:0)",
      "timeout",
      "reset",
      "fallback:text/chapter-17.xhtml",
    ]);
  });

  test("does not reset or fallback after timeout if the reader unmounted", async () => {
    const calls: string[] = [];
    const result = await displayEpubTargetWithFallback({
      rendition: {
        spread: () => {},
        display: () => new Promise<unknown>(() => {}),
      },
      target: "epubcfi(/6/36!/4/2/1:0)",
      fallbackTarget: "text/chapter-17.xhtml",
      initialTimeoutMs: 1,
      isActive: () => false,
      onTimeout: () => calls.push("timeout"),
      resetAfterTimeout: () => {
        calls.push("reset");
        return null;
      },
    });

    expect(result.status).toBe("inactive");
    expect(calls).toEqual([]);
  });
});

describe("Books reader CJK serif fonts", () => {
  test("prefers Simplified Chinese faces for zh-CN and Hans locales", () => {
    for (const language of ["zh", "zh-CN", "zh-Hans", "zh-Hans-CN", "zh-SG"]) {
      const stack = resolveBookCjkSerifStack(language);

      expect(stack).toContain('"Noto Serif SC"');
      expect(stack).toContain('"Source Han Serif SC"');
      expect(stack).toContain('"Noto Serif CJK SC"');
      expect(stack).toContain('"Songti SC"');
      expect(stack.indexOf('"Noto Serif SC"')).toBeLessThan(
        stack.indexOf('"Noto Serif JP"')
      );
    }
  });

  test("selects region-appropriate CJK faces for other locales", () => {
    const traditional = resolveBookCjkSerifStack("zh-Hant-TW");
    const japanese = resolveBookCjkSerifStack("ja-JP");
    const korean = resolveBookCjkSerifStack("ko-KR");

    expect(traditional.indexOf('"Noto Serif TC"')).toBeLessThan(
      traditional.indexOf('"Noto Serif JP"')
    );
    expect(japanese.indexOf('"Noto Serif JP"')).toBeLessThan(
      japanese.indexOf('"Noto Serif SC"')
    );
    expect(korean.indexOf('"Noto Serif KR"')).toBeLessThan(
      korean.indexOf('"Noto Serif JP"')
    );
  });

  test("adds locale-aware CJK fallbacks to both serif reading choices", () => {
    const serif = getBookFontCssStack("serif", "zh-CN");
    const garamond = getBookFontCssStack("eb-garamond", "ko");

    expect(serif).toStartWith('"Charter", "Noto Serif SC"');
    expect(serif).toContain('"Source Han Serif SC"');
    expect(garamond).toStartWith(
      '"EB Garamond", "Charter", "Noto Serif KR"'
    );
    expect(garamond).toContain('"Source Han Serif KR"');
  });

  test("applies the resolved stack throughout the epub.js serif theme", () => {
    const theme = buildEpubTheme(settings, palette, "zh-CN");

    expect(theme.body["font-family"]).toContain(
      '"Charter", "Noto Serif SC", "Source Han Serif SC"'
    );
    expect(theme.p["font-family"]).toBe(theme.body["font-family"]);
    expect(theme.h1["font-family"]).toBe(theme.body["font-family"]);

    const originalTheme = buildEpubTheme(
      { ...settings, fontId: "original" },
      palette,
      "zh-CN"
    );
    expect(originalTheme.body["font-family"]).toBeUndefined();
  });

  test("loads Noto CJK serif families inside isolated EPUB iframes", () => {
    const css = buildFontFaceCss("https://os.example");

    expect(css).toContain("family=Noto+Serif+SC:wght@400;700");
    expect(css).toContain("family=Noto+Serif+TC:wght@400;700");
    expect(css).toContain("family=Noto+Serif+JP:wght@400;700");
    expect(css).toContain("family=Noto+Serif+KR:wght@400;700");
    expect(css.indexOf("@import")).toBeLessThan(css.indexOf("@font-face"));
    expect(css).toContain(
      'url("https://os.example/fonts/EBGaramond-Latin.woff2")'
    );
  });
});
