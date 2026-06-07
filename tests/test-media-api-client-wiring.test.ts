import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("media API client wiring", () => {
  test("YouTube title parsing uses the media API client", () => {
    const source = readFileSync("src/utils/youtubeMetadata.ts", "utf8");

    expect(source).toContain("parseVideoTitle");
    expect(source).not.toContain("/api/parse-title");
  });

  test("TV create hook uses the media API client", () => {
    const source = readFileSync("src/apps/tv/hooks/useCreateTvChannel.ts", "utf8");

    expect(source).toContain("createTvChannelPlan");
    expect(source).not.toContain("/api/tv/create-channel");
  });

  test("chat tv control uses the media API client for parse and create calls", () => {
    const source = readFileSync("src/apps/chats/tools/tvHandler.ts", "utf8");

    expect(source).toContain("parseYouTubeTitle");
    expect(source).toContain("createTvChannelPlan");
    expect(source).not.toContain("/api/parse-title");
    expect(source).not.toContain("/api/tv/create-channel");
  });
});
