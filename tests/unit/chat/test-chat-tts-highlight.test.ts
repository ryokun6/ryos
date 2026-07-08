import { describe, expect, test } from "bun:test";
import { stripMarkdownForMatching } from "../../../src/apps/chats/utils/ttsHighlight";

// stripMarkdownForMatching converts a slice of markdown source into the
// plain text we expect to find in the rendered DOM, so the CSS Custom
// Highlight overlay can locate the spoken span without splitting the
// markdown into separate Streamdown instances. These cases lock in the
// transformations the highlighter relies on.
describe("stripMarkdownForMatching", () => {
  test("unwraps bold, italic, and strikethrough markers", () => {
    expect(stripMarkdownForMatching("**hello** _world_ ~~done~~")).toBe(
      "hello world done"
    );
    expect(stripMarkdownForMatching("__strong__ *em*")).toBe("strong em");
  });

  test("collapses markdown links to their visible label", () => {
    expect(
      stripMarkdownForMatching('see [the docs](https://example.com "Title")')
    ).toBe("see the docs");
  });

  test("drops markdown image syntax", () => {
    expect(stripMarkdownForMatching("look ![alt text](img.png) here")).toBe(
      "look  here"
    );
  });

  test("removes block markers but keeps content", () => {
    expect(stripMarkdownForMatching("# Heading\n## Sub")).toBe("Heading\nSub");
    expect(stripMarkdownForMatching("- item one\n- item two")).toBe(
      "item one\nitem two"
    );
    expect(stripMarkdownForMatching("1. one\n2) two")).toBe("one\ntwo");
    expect(stripMarkdownForMatching("> quote line")).toBe("quote line");
  });

  test("preserves single-line text passed through inline code", () => {
    expect(stripMarkdownForMatching("call `fn()` to run")).toBe(
      "call fn() to run"
    );
  });

  test("removes fenced code block content (would not be inline-matched)", () => {
    expect(
      stripMarkdownForMatching("intro\n```ts\nconst x = 1\n```\noutro")
    ).toBe("intro\n \noutro");
  });

  test("leaves plain text unchanged", () => {
    expect(stripMarkdownForMatching("just a regular sentence.")).toBe(
      "just a regular sentence."
    );
  });

  test("does not mangle stray asterisks/underscores", () => {
    expect(stripMarkdownForMatching("a * b * c")).toBe("a * b * c");
    expect(stripMarkdownForMatching("snake_case_var")).toBe("snake_case_var");
  });
});
