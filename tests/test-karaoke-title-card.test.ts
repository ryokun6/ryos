import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LyricLine } from "@/types/lyrics";
import {
  getFirstLyricStartMs,
  shouldShowKaraokeTitleCard,
} from "@/apps/karaoke/utils/titleCard";

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

const line = (startTimeMs: string, words: string): LyricLine => ({
  startTimeMs,
  words,
});

describe("karaoke title card timing", () => {
  test("uses the first non-empty valid lyric timestamp", () => {
    expect(
      getFirstLyricStartMs([
        line("0", "   "),
        line("not-a-time", "noise"),
        line("5000", "First lyric"),
      ])
    ).toBe(5000);
  });

  test("shows when the first lyric has enough lead time", () => {
    expect(
      shouldShowKaraokeTitleCard({
        lines: [line("4500", "First lyric")],
        currentTimeMs: 0,
      })
    ).toBe(true);
  });

  test("does not show when lyrics start quickly", () => {
    expect(
      shouldShowKaraokeTitleCard({
        lines: [line("1200", "First lyric")],
        currentTimeMs: 0,
      })
    ).toBe(false);
  });

  test("keeps showing during the three-second title card window", () => {
    expect(
      shouldShowKaraokeTitleCard({
        lines: [line("4500", "First lyric")],
        currentTimeMs: 2500,
      })
    ).toBe(true);
  });

  test("does not show after the three-second title card window", () => {
    expect(
      shouldShowKaraokeTitleCard({
        lines: [line("4500", "First lyric")],
        currentTimeMs: 3000,
      })
    ).toBe(false);
  });

  test("does not show after the first lyric starts even with a longer duration override", () => {
    expect(
      shouldShowKaraokeTitleCard({
        lines: [line("4500", "First lyric")],
        currentTimeMs: 4500,
        durationMs: 5000,
      })
    ).toBe(false);
  });

  test("shows after a negative offset when first lyric is still outside the title window", () => {
    expect(
      shouldShowKaraokeTitleCard({
        lines: [line("4500", "First lyric")],
        currentTimeMs: 0,
        lyricOffsetMs: -4500,
      })
    ).toBe(true);
  });

  test("shows during pre-seek negative time when first lyric is outside the title window", () => {
    expect(
      shouldShowKaraokeTitleCard({
        lines: [line("4500", "First lyric")],
        currentTimeMs: -4500,
        lyricOffsetMs: -4500,
      })
    ).toBe(true);
  });

  test("does not show with offset when first lyric is inside the title window", () => {
    expect(
      shouldShowKaraokeTitleCard({
        lines: [line("4500", "First lyric")],
        currentTimeMs: 2000,
        lyricOffsetMs: 2000,
      })
    ).toBe(false);
  });

  test("wires title card album art click to open cover flow", () => {
    const lyricsSource = readSource("src/apps/karaoke/components/KaraokeLyricsPlayback.tsx");
    const appSource = readSource("src/apps/karaoke/components/KaraokeAppComponent.tsx");

    expect(lyricsSource.includes("onOpenCoverFlow?: () => void")).toBe(true);
    expect(lyricsSource.includes("aria-label={coverFlowLabel}")).toBe(true);
    expect(lyricsSource.includes("pointer-events-auto")).toBe(true);
    expect(lyricsSource.includes("onOpenCoverFlow()")).toBe(true);
    expect(appSource.includes("onOpenCoverFlow={handleOpenCoverFlowFromTitleCard}")).toBe(true);
  });
});
