import { describe, expect, test } from "bun:test";
import { parseYouTubeVideoId } from "../../../src/utils/youtubeUrl";

describe("parseYouTubeVideoId legacy caller options", () => {
  const VID = "dQw4w9WgXcQ";

  test("keeps strict defaults for new callers", () => {
    expect(parseYouTubeVideoId(`youtube://${VID}`)).toBeNull();
    expect(parseYouTubeVideoId(`yt:${VID}`)).toBeNull();
    expect(parseYouTubeVideoId(`youtube.com/watch?v=${VID}`)).toBeNull();
    expect(
      parseYouTubeVideoId(`https://notyoutube.com/watch?v=${VID}`)
    ).toBeNull();
  });

  test("supports Winamp legacy shortcuts when explicitly enabled", () => {
    const options = {
      allowBareHost: true,
      allowProtocolAliases: true,
    };

    expect(parseYouTubeVideoId(`youtube://${VID}`, options)).toBe(VID);
    expect(parseYouTubeVideoId(`youtube:/${VID}`, options)).toBe(VID);
    expect(parseYouTubeVideoId(`yt:${VID}`, options)).toBe(VID);
    expect(parseYouTubeVideoId(`youtube.com/watch?v=${VID}`, options)).toBe(
      VID
    );
    expect(parseYouTubeVideoId(`https://youtube.com/e/${VID}`, options)).toBe(
      VID
    );
    expect(
      parseYouTubeVideoId(`https://notyoutube.com/watch?v=${VID}`, options)
    ).toBeNull();
  });

  test("rejects substring-confusable hosts for all callers", () => {
    expect(parseYouTubeVideoId(`https://youtube.com/watch?v=${VID}`)).toBe(VID);
    expect(
      parseYouTubeVideoId(`https://evil-youtube.com/watch?v=${VID}`)
    ).toBeNull();
    expect(
      parseYouTubeVideoId(`https://notyoutube.com/watch?v=${VID}`, {
        allowBareHost: true,
        allowProtocolAliases: true,
      })
    ).toBeNull();
  });
});
