import { describe, expect, test } from "bun:test";
import {
  buildTvChannelLineup,
  DEFAULT_CHANNELS,
  isDefaultChannelId,
} from "../src/apps/tv/data/channels";
import { isYouTubeUrl } from "../src/apps/tv/utils";

describe("TV default channels", () => {
  test("keeps the original three channels first", () => {
    expect(DEFAULT_CHANNELS.slice(0, 3).map((channel) => channel.id)).toEqual([
      "ryos-picks",
      "mtv",
      "taiwan",
    ]);
  });

  test("prepopulates exported channel library as built-ins", () => {
    const prepopulated = DEFAULT_CHANNELS.slice(3);
    expect(prepopulated).toHaveLength(13);
    expect(prepopulated.reduce((sum, channel) => sum + channel.videos.length, 0))
      .toBe(220);
    expect(prepopulated.every((channel) => !channel.id.startsWith("custom-")))
      .toBe(true);
  });

  test("has unique built-in ids and sequential lineup numbers", () => {
    const ids = DEFAULT_CHANNELS.map((channel) => channel.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => isDefaultChannelId(id))).toBe(true);

    expect(buildTvChannelLineup([]).map((channel) => channel.number)).toEqual(
      DEFAULT_CHANNELS.map((_, index) => index + 1)
    );
  });

  test("can hide default channels and renumber remaining channels", () => {
    const lineup = buildTvChannelLineup([], ["taiwan", "tokki-mix"]);

    expect(lineup.some((channel) => channel.id === "taiwan")).toBe(false);
    expect(lineup.some((channel) => channel.id === "tokki-mix")).toBe(false);
    expect(lineup.map((channel) => channel.number)).toEqual(
      lineup.map((_, index) => index + 1)
    );
  });

  test("only includes YouTube videos in prepopulated built-ins", () => {
    const seededVideos = DEFAULT_CHANNELS.slice(3).flatMap(
      (channel) => channel.videos
    );
    expect(seededVideos).not.toHaveLength(0);
    expect(seededVideos.every((video) => isYouTubeUrl(video.url))).toBe(true);
  });
});
