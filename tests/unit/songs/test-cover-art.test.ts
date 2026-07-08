import { describe, expect, test } from "bun:test";
import {
  formatKugouImageUrl,
  resolveMediaCoverUrl,
} from "../../../src/utils/coverArt";
import { resolveTrackCoverUrl } from "../../../src/apps/ipod/constants";

describe("formatKugouImageUrl", () => {
  test("substitutes size and upgrades http URLs", () => {
    expect(
      formatKugouImageUrl("http://imge.kugou.com/stdmusic/{size}/cover.jpg", 100)
    ).toBe("https://imge.kugou.com/stdmusic/100/cover.jpg");
  });
});

describe("resolveMediaCoverUrl", () => {
  test("returns null for empty input", () => {
    expect(resolveMediaCoverUrl(null)).toBeNull();
  });

  test("uses Apple Music cover directly", () => {
    expect(
      resolveMediaCoverUrl({
        source: "appleMusic",
        cover: "https://example.com/am.jpg",
      })
    ).toBe("https://example.com/am.jpg");
  });

  test("prefers Kugou cover over YouTube fallback", () => {
    expect(
      resolveMediaCoverUrl(
        {
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          cover: "http://imge.kugou.com/stdmusic/{size}/cover.jpg",
        },
        { kugouSize: 800 }
      )
    ).toBe("https://imge.kugou.com/stdmusic/800/cover.jpg");
  });

  test("falls back to YouTube thumbnail", () => {
    expect(
      resolveMediaCoverUrl(
        { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
        { youtubeQuality: "mqdefault" }
      )
    ).toBe("https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg");
  });

  test("keeps iPod resolveTrackCoverUrl compatibility", () => {
    expect(
      resolveTrackCoverUrl({
        url: "https://youtu.be/dQw4w9WgXcQ",
      })
    ).toBe("https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg");
  });
});
