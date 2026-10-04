import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { LyricLine, RomanizationSettings } from "../../../src/types/lyrics";
import { renderLyricsWithAnnotations } from "../../../src/utils/renderLyricsWithAnnotations";
import { renderChineseWithPhonetics } from "../../../src/utils/romanization";
import { hanziToZhuyinReadings, splitZhuyinSyllable } from "../../../src/utils/zhuyin";

const INDEX_CSS = readFileSync(join(import.meta.dir, "../../../src/index.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

function cssRule(selector: string): string {
  const start = INDEX_CSS.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return INDEX_CSS.slice(start, INDEX_CSS.indexOf("}", start));
}

const romanization: RomanizationSettings = {
  enabled: true,
  japaneseFurigana: false,
  japaneseRomaji: false,
  korean: false,
  chinese: false,
  chineseZhuyin: true,
  chineseLyricsLanguage: "auto",
  soramimi: false,
  soramamiTargetLanguage: "zh-TW",
};

const line: LyricLine = { startTimeMs: "1000", words: "我愛你" };

describe("splitZhuyinSyllable", () => {
  test("moves second, third and fourth tone marks into the side track", () => {
    expect(splitZhuyinSyllable("ㄨㄛˇ")).toEqual({ letters: ["ㄨ", "ㄛ"], tone: "ˇ" });
    expect(splitZhuyinSyllable("ㄊㄞˊ")).toEqual({ letters: ["ㄊ", "ㄞ"], tone: "ˊ" });
    expect(splitZhuyinSyllable("ㄞˋ")).toEqual({ letters: ["ㄞ"], tone: "ˋ" });
  });

  test("keeps first-tone syllables and the neutral-tone dot in the column", () => {
    expect(splitZhuyinSyllable("ㄔㄨㄤ")).toEqual({ letters: ["ㄔ", "ㄨ", "ㄤ"], tone: "" });
    expect(splitZhuyinSyllable("˙ㄉㄜ")).toEqual({ letters: ["˙", "ㄉ", "ㄜ"], tone: "" });
    expect(splitZhuyinSyllable("")).toEqual({ letters: [], tone: "" });
  });
});

describe("Zhuyin ruby markup", () => {
  test("renders one block per letter plus a separate tone track", () => {
    const html = renderToStaticMarkup(<>{renderChineseWithPhonetics("我", "t", "zhuyin")}</>);
    expect(html).toBe(
      '<ruby class="lyrics-furigana lyrics-zhuyin-ruby">我<rp>(</rp>' +
        '<rt class="lyrics-furigana-rt lyrics-zhuyin-rt"><span class="lyrics-zhuyin-annotation">' +
        '<span class="lyrics-zhuyin-letters"><span>ㄨ</span><span>ㄛ</span></span>' +
        '<span class="lyrics-zhuyin-tone">ˇ</span></span></rt><rp>)</rp></ruby>'
    );
  });

  test("keeps the ruby text equal to the reading", () => {
    const text = "我愛台灣的窗";
    const html = renderToStaticMarkup(<>{renderChineseWithPhonetics(text, "t", "zhuyin")}</>);
    const rtTexts = [...html.matchAll(/<rt[^>]*>(.*?)<\/rt>/g)].map((match) =>
      match[1].replace(/<[^>]+>/g, "")
    );
    expect(rtTexts).toEqual(hanziToZhuyinReadings(text));
  });

  test("leaves hanzi without a reading unannotated", () => {
    const html = renderToStaticMarkup(<>{renderChineseWithPhonetics("我㐀", "t", "zhuyin")}</>);
    expect(html.match(/<ruby/g)?.length).toBe(1);
    expect(html).toContain("<span>㐀</span>");
  });

  test("leaves pinyin ruby markup untouched", () => {
    const html = renderToStaticMarkup(<>{renderChineseWithPhonetics("你好", "t", "pinyin")}</>);
    expect(html).toBe(
      '<ruby class="lyrics-furigana lyrics-pinyin-ruby">你<rp>(</rp><rt class="lyrics-furigana-rt lyrics-pinyin-rt">ni</rt><rp>)</rp></ruby>' +
        '<ruby class="lyrics-furigana lyrics-pinyin-ruby">好<rp>(</rp><rt class="lyrics-furigana-rt lyrics-pinyin-rt">hao</rt><rp>)</rp></ruby>'
    );
  });

  test("pronunciation-only Zhuyin stays a plain horizontal run", () => {
    const html = renderToStaticMarkup(
      <>
        {renderLyricsWithAnnotations(line, line.words, {
          romanization: { ...romanization, pronunciationOnly: true },
          isShowingOriginal: true,
          furiganaMap: new Map(),
          soramimiMap: new Map(),
        })}
      </>
    );
    expect(html).not.toContain("<ruby");
    expect(html).not.toContain("lyrics-zhuyin");
    expect(html).toBe(`<span>${hanziToZhuyinReadings(line.words).join("")}</span>`);
  });

  test("ruby view renders every hanzi with a side Zhuyin column", () => {
    const html = renderToStaticMarkup(
      <>
        {renderLyricsWithAnnotations(line, line.words, {
          romanization,
          isShowingOriginal: true,
          furiganaMap: new Map(),
          soramimiMap: new Map(),
        })}
      </>
    );
    expect(html.match(/class="lyrics-furigana lyrics-zhuyin-ruby"/g)?.length).toBe(3);
    expect(html.match(/class="lyrics-zhuyin-annotation"/g)?.length).toBe(3);
  });
});

describe("Zhuyin ruby CSS", () => {
  test("lays the column out by hand instead of inter-character ruby", () => {
    expect(INDEX_CSS).not.toMatch(/ruby-position:\s*inter-character/);
    expect(cssRule("ruby.lyrics-zhuyin-ruby")).toContain("display: inline-block");
    expect(cssRule(".lyrics-zhuyin-annotation")).toContain("position: absolute");
  });

  test("does not position <rt> itself (WebKit forces it static)", () => {
    const rt = cssRule(":root ruby.lyrics-zhuyin-ruby > rt.lyrics-zhuyin-rt");
    expect(rt).toContain("display: contents");
    expect(rt).not.toContain("position:");
  });

  test("stacks letters without vertical writing mode", () => {
    expect(cssRule(".lyrics-zhuyin-letters")).toContain("flex-direction: column");
    expect(INDEX_CSS).not.toMatch(/\.lyrics-zhuyin[^{]*\{[^}]*writing-mode/);
  });

  test("keeps other phonetics on the interlinear over position", () => {
    expect(cssRule("ruby.lyrics-furigana")).toContain("ruby-position: over");
  });
});
