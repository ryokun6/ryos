import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LyricLine } from "@/types/lyrics";
import {
  getFirstLyricStartMs,
  shouldShowKaraokeTitleCard,
} from "@/apps/karaoke/utils/titleCard";
import { TITLE_CARD_TITLE_SHADOW_BLEED_STYLE } from "@/apps/karaoke/components/karaoke-lyrics-playback/title-card-styles";
import { getLyricsLineBleedStyle } from "@/apps/ipod/components/lyrics-display/LyricsDisplayLines";
import { LyricsAlignment } from "@/types/lyrics";

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

  test("keeps showing during the title card window", () => {
    expect(
      shouldShowKaraokeTitleCard({
        lines: [line("4500", "First lyric")],
        currentTimeMs: 2500,
      })
    ).toBe(true);
    expect(
      shouldShowKaraokeTitleCard({
        lines: [line("12000", "First lyric")],
        currentTimeMs: 4999,
      })
    ).toBe(true);
  });

  test("does not show after the title card max duration when first lyric is still later", () => {
    expect(
      shouldShowKaraokeTitleCard({
        lines: [line("12000", "First lyric")],
        currentTimeMs: 5000,
      })
    ).toBe(false);
  });

  test("does not show once the first lyric starts (even under max duration)", () => {
    expect(
      shouldShowKaraokeTitleCard({
        lines: [line("4500", "First lyric")],
        currentTimeMs: 4500,
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
    const lyricsSource = readSource(
      "src/apps/karaoke/components/karaoke-lyrics-playback/KaraokeTitleCard.tsx",
    );
    const windowSource = readSource(
      "src/apps/karaoke/components/karaoke-app/KaraokeWindowContent.tsx",
    );

    expect(lyricsSource.includes("onOpenCoverFlow?: () => void")).toBe(true);
    expect(lyricsSource.includes("aria-label={coverFlowLabel}")).toBe(true);
    expect(lyricsSource.includes("pointer-events-auto")).toBe(true);
    expect(lyricsSource.includes("onOpenCoverFlow()")).toBe(true);
    expect(
      windowSource.includes("onOpenCoverFlow={handleOpenCoverFlowFromTitleCard}"),
    ).toBe(true);
  });
});

describe("karaoke title and lyric alignment", () => {
  test("keeps title shadow bleed from shifting the left text anchor", () => {
    expect(TITLE_CARD_TITLE_SHADOW_BLEED_STYLE.paddingLeft).toBe("1.25em");
    expect(TITLE_CARD_TITLE_SHADOW_BLEED_STYLE.marginLeft).toBe("-1.25em");
    expect(TITLE_CARD_TITLE_SHADOW_BLEED_STYLE.width).toBe("calc(100% + 1.25em)");
  });

  test("keeps alternating left lyric rows from adding an extra left inset", () => {
    expect(
      getLyricsLineBleedStyle({
        alignment: LyricsAlignment.Alternating,
        lineTextAlign: "left",
        index: 0,
        visibleLinesLength: 2,
      })
    ).toEqual({
      paddingLeft: "48px",
      marginLeft: "calc(-1 * 48px)",
      width: "calc(100% + 48px)",
    });
  });
});
