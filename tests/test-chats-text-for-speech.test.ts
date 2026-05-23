import { describe, expect, test } from "bun:test";
import { cleanTextForSpeech } from "../src/apps/chats/utils/textForSpeech";

describe("cleanTextForSpeech", () => {
  test("strips code fences entirely", () => {
    const input = "Here is code:\n```ts\nconst x = 1;\n```\nDone.";
    expect(cleanTextForSpeech(input)).toBe("Here is code:\n\nDone.");
  });

  test("strips raw HTML tags but keeps text content", () => {
    expect(cleanTextForSpeech("hello <b>world</b>")).toBe("hello world");
  });

  test("collapses markdown images to nothing", () => {
    expect(cleanTextForSpeech("see ![alt](https://x/y.png) here")).toBe(
      "see here"
    );
  });

  test("collapses markdown links to just their label", () => {
    expect(
      cleanTextForSpeech("read [the docs](https://example.com) now")
    ).toBe("read the docs now");
  });

  test("drops bare URLs entirely", () => {
    expect(cleanTextForSpeech("visit https://os.ryo.lu later")).toBe(
      "visit later"
    );
  });

  test("drops bare www.* URLs", () => {
    expect(cleanTextForSpeech("see www.example.com soon")).toBe("see soon");
  });

  test("drops bare email addresses", () => {
    expect(cleanTextForSpeech("ping me at me@example.com please")).toBe(
      "ping me at please"
    );
  });

  test("collapses runs of spaces left behind by URL stripping", () => {
    expect(cleanTextForSpeech("foo    bar")).toBe("foo bar");
  });

  test("trims leading punctuation noise from chunk boundaries", () => {
    expect(cleanTextForSpeech("！ hello")).toBe("hello");
    expect(cleanTextForSpeech("... yes")).toBe("yes");
  });

  test("returns empty string for input that only contains stripped tokens", () => {
    expect(cleanTextForSpeech("```ts\nconst x = 1;\n```")).toBe("");
    expect(cleanTextForSpeech("<div></div>")).toBe("");
  });
});
