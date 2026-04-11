import { describe, expect, test } from "bun:test";
import {
  coalesceChatMarkdownTokens,
  parseChatMarkdownInline,
  segmentChatMarkdownText,
} from "../src/lib/chatMarkdown";

describe("chat markdown parsing", () => {
  test("parses parenthesized markdown citations as citation tokens", () => {
    expect(
      parseChatMarkdownInline(
        "dispute. ([straitstimes.com](https://example.com/story?utm_source=openai))"
      )
    ).toEqual([
      { type: "text", content: "dispute" },
      { type: "text", content: "." },
      { type: "text", content: " " },
      {
        type: "citation",
        content: "straitstimes.com",
        url: "https://example.com/story?utm_source=openai",
      },
    ]);
  });

  test("keeps plain markdown links inline", () => {
    expect(
      parseChatMarkdownInline(
        "see [the article](https://example.com/story) for context"
      )
    ).toEqual([
      { type: "text", content: "see" },
      { type: "text", content: " " },
      {
        type: "link",
        content: "the article",
        url: "https://example.com/story",
      },
      { type: "text", content: " " },
      { type: "text", content: "for" },
      { type: "text", content: " " },
      { type: "text", content: "context" },
    ]);
  });

  test("trims trailing punctuation from bare urls", () => {
    expect(
      parseChatMarkdownInline("read https://example.com/story)). next")
    ).toEqual([
      { type: "text", content: "read" },
      { type: "text", content: " " },
      {
        type: "link",
        content: "https://example.com/story",
        url: "https://example.com/story",
      },
      { type: "text", content: "))." },
      { type: "text", content: " " },
      { type: "text", content: "next" },
    ]);
  });

  test("preserves newlines while parsing links", () => {
    expect(
      segmentChatMarkdownText("first line\n([source](https://example.com))")
    ).toEqual([
      { type: "text", content: "first" },
      { type: "text", content: " " },
      { type: "text", content: "line" },
      { type: "text", content: "\n" },
      {
        type: "citation",
        content: "source",
        url: "https://example.com",
      },
    ]);
  });

  test("coalesces adjacent plain text tokens without merging links", () => {
    const tokens = segmentChatMarkdownText(
      "see [the article](https://example.com/story) please"
    );

    expect(coalesceChatMarkdownTokens(tokens)).toEqual([
      { type: "text", content: "see " },
      {
        type: "link",
        content: "the article",
        url: "https://example.com/story",
      },
      { type: "text", content: " please" },
    ]);
  });
});
