import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  JOURNAL_SONG_COVER_KUGOU_SIZE,
  resolveJournalSongCover,
} from "../../../src/apps/journal/components/journalSong";
import { resolveMediaCoverUrl } from "../../../src/utils/coverArt";

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("journal song card cover", () => {
  const kugou = "http://imge.kugou.com/stdmusic/{size}/cover.jpg";
  const track = {
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    cover: kugou,
  };

  test("uses the iPod and Karaoke cover resolver at the same size", () => {
    expect(JOURNAL_SONG_COVER_KUGOU_SIZE).toBe(800);
    expect(resolveJournalSongCover(track, "https://example.com/stored.jpg")).toBe(
      resolveMediaCoverUrl(track, { kugouSize: 800 })
    );
  });

  test("falls back to the stored cover through that resolver", () => {
    const stored = "http://imge.kugou.com/stdmusic/{size}/stored.jpg";
    expect(resolveJournalSongCover(undefined, stored)).toBe(
      resolveMediaCoverUrl({ cover: stored }, { kugouSize: 800 })
    );
  });

  test("uses the YouTube thumbnail when the track has no Kugou cover", () => {
    expect(resolveJournalSongCover({ url: "https://youtu.be/dQw4w9WgXcQ" }, null)).toBe(
      "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"
    );
  });

  test("keeps an Apple Music cover as the playback apps do", () => {
    const apple = { source: "appleMusic" as const, cover: "https://example.com/am.jpg" };
    expect(resolveJournalSongCover(apple, null)).toBe(resolveMediaCoverUrl(apple, { kugouSize: 800 }));
  });
});

describe("journal song card wiring", () => {
  test("omits the date and reveals playback on the cover while hovered", () => {
    const canvas = readSource("src/apps/journal/components/FreeformCanvas.tsx");
    const song = readSource("src/apps/journal/components/journalSong.tsx");
    const daily = readSource("src/apps/journal/components/GeneratedView.tsx");

    expect(canvas).toContain('fragment.kind !== "song" && isJournalDayId(fragment.pageId)');
    expect(canvas).toContain("isJournalSongPlayControl(event.target)");
    expect(canvas).toContain("data-journal-card={fragment.id}");
    expect(canvas).toContain('fragment.kind === "song" && "group/song"');
    expect(song).toContain("group-hover/song:opacity-100");
    expect(song).toContain("data-journal-song-play");
    expect(daily).toContain("group/song flex w-full cursor-pointer");
  });
});
