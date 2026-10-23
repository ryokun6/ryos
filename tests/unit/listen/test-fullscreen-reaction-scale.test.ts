import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  FULLSCREEN_LYRICS_FONT_MAX_PX,
  FULLSCREEN_LYRICS_FONT_MIN_PX,
  fullscreenLyricsFontSizePx,
  fullscreenLyricsScale,
  scaleSessionReactionMotion,
} from "../../../src/components/listen/fullscreenReactionScale";

const LYRIC_CLAMP = `clamp(${FULLSCREEN_LYRICS_FONT_MIN_PX}px, min(10vw, 10vh), ${FULLSCREEN_LYRICS_FONT_MAX_PX}px)`;

describe("fullscreen lyric clamp", () => {
  test("matches the stylesheet rules reactions scale from", () => {
    const indexCss = readFileSync(
      new URL("../../../src/index.css", import.meta.url),
      "utf8",
    );
    const aquaCss = readFileSync(
      new URL("../../../src/styles/themes/aqua.css", import.meta.url),
      "utf8",
    );
    expect(indexCss).toContain(`.fullscreen-lyrics-text {\n    font-size: ${LYRIC_CLAMP};`);
    expect(aquaCss).toContain(`font-size: ${LYRIC_CLAMP} !important;`);
  });

  test("follows clamp(32px, min(10vw, 10vh), 120px)", () => {
    expect(fullscreenLyricsFontSizePx(0, 0)).toBe(32);
    expect(fullscreenLyricsFontSizePx(200, 400)).toBe(32);
    expect(fullscreenLyricsFontSizePx(390, 844)).toBeCloseTo(39);
    expect(fullscreenLyricsFontSizePx(800, 600)).toBe(60);
    expect(fullscreenLyricsFontSizePx(1920, 1080)).toBe(108);
    expect(fullscreenLyricsFontSizePx(1400, 900)).toBe(90);
    expect(fullscreenLyricsFontSizePx(3840, 2160)).toBe(120);
  });

  test("scale is the lyric size divided by the 32px floor", () => {
    expect(fullscreenLyricsScale(390, 844)).toBeCloseTo(39 / 32);
    expect(fullscreenLyricsScale(1920, 1080)).toBeCloseTo(108 / 32);
    expect(fullscreenLyricsScale(3840, 2160)).toBeCloseTo(120 / 32);
  });
});

describe("scaleSessionReactionMotion", () => {
  const physics = {
    xOffset: 40,
    scale: 1.2,
    floatHeight: 150,
    wobble: -8,
  };

  test("viewport scale 1 keeps the windowed size and distances", () => {
    const laidOut = scaleSessionReactionMotion(physics, 1, {
      width: 100,
      height: 100,
    });
    expect(laidOut.iconSize).toBe(Math.round(22 * 1.2));
    expect(laidOut.xOffset).toBe(40);
    expect(laidOut.floatHeight).toBe(150);
    expect(laidOut.wobble).toBe(-8);
    expect(laidOut.enterOffset).toBe(16);
    expect(laidOut.enterKeyframe).toBe(14);
  });

  test("grows the glyph and the float with the lyric scale", () => {
    const viewportScale = fullscreenLyricsScale(1920, 1080);
    const laidOut = scaleSessionReactionMotion(physics, viewportScale, {
      width: 1920,
      height: 1080,
    });
    expect(laidOut.iconSize).toBe(Math.round(22 * 1.2 * viewportScale));
    expect(laidOut.floatHeight).toBeCloseTo(150 * viewportScale);
    expect(laidOut.xOffset).toBeCloseTo(40 * viewportScale);
    expect(laidOut.wobble).toBeCloseTo(-8 * viewportScale);
    expect(laidOut.enterOffset).toBeCloseTo(16 * viewportScale);
    expect(laidOut.iconSize).toBeGreaterThan(Math.round(22 * 1.2) * 3);
  });

  test("pulls a too-wide float inside the viewport, wobble included", () => {
    const laidOut = scaleSessionReactionMotion(
      { xOffset: 500, scale: 1.4, floatHeight: 5000, wobble: 200 },
      3,
      { width: 400, height: 300 },
    );
    const halfIcon = (laidOut.iconSize * 1.4) / 2;
    const xLimit = 400 / 2 - halfIcon - 16;
    expect(Math.abs(laidOut.xOffset) + Math.abs(laidOut.wobble)).toBeCloseTo(xLimit);
    const topHalf = (laidOut.iconSize * 1.4 * 0.66) / 2;
    expect(laidOut.floatHeight).toBeCloseTo(300 - topHalf - 16);
    expect(laidOut.floatHeight).toBeLessThan(300);
  });

  test("treats a non-positive viewport scale as the windowed size", () => {
    expect(scaleSessionReactionMotion(physics, 0).iconSize).toBe(
      Math.round(22 * 1.2),
    );
    expect(scaleSessionReactionMotion(physics, Number.NaN).floatHeight).toBe(150);
  });
});
