import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { WordTimingHighlight } from "../../../src/apps/ipod/components/lyrics-display/WordTimingHighlight";
import { SERIF_RED_HIGHLIGHT_COLOR } from "../../../src/apps/ipod/components/lyrics-display/constants";

const words = ["아직도 ", "아름다운지"].map((text, i) => ({
  text,
  startTimeMs: i * 1000,
  durationMs: 1000,
}));

const { document } = new Window();

function renderLayers(isOldSchoolKaraoke: boolean): HTMLElement[] {
  const html = renderToStaticMarkup(
    <WordTimingHighlight
      wordTimings={words}
      lineStartTimeMs={0}
      currentTimeMs={500}
      processText={(text) => text}
      koreanRomanized
      isOldSchoolKaraoke={isOldSchoolKaraoke}
      highlightColor={isOldSchoolKaraoke ? SERIF_RED_HIGHLIGHT_COLOR : undefined}
    />
  );
  const root = document.createElement("div");
  root.innerHTML = html;
  return Array.from(root.querySelectorAll(".lyrics-word-highlight")) as unknown as HTMLElement[];
}

describe("WordTimingHighlight layers", () => {
  for (const isOldSchoolKaraoke of [true, false]) {
    describe(isOldSchoolKaraoke ? "outline styles" : "glow styles", () => {
      test("masked fill is its own formatting context so ruby lines match the base layer", () => {
        const wordsEls = renderLayers(isOldSchoolKaraoke);
        expect(wordsEls).toHaveLength(2);
        for (const word of wordsEls) {
          const [base, highlight] = Array.from(word.children) as HTMLElement[];
          const fill = highlight.firstElementChild as HTMLElement;
          expect(base.className).toContain("lyrics-word-layer");
          expect(highlight.className).toContain("lyrics-word-layer");
          // Chromium 152 (Electron 44) shifts a leading <ruby> line by the
          // fill's padding-top when the fill is a plain nested block.
          expect(fill.style.display).toBe("flow-root");
          expect(fill.style.paddingTop).toBe(base.style.paddingTop);
          expect(fill.style.marginTop).toBe(base.style.marginTop);
          expect(fill.innerHTML).toBe(base.innerHTML);
          expect(fill.querySelector("rt.lyrics-korean-rt")).not.toBeNull();
        }
      });
    });
  }
});
