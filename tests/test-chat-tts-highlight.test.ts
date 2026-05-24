import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { stripMarkdownForMatching } from "../src/apps/chats/utils/ttsHighlight";

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

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

// When the final spoken segment ends, the per-message React effect cleanup
// in ChatMessages.tsx is responsible for calling `clearTtsHighlight`. In
// practice that cleanup can be deferred — backgrounded tabs throttle the
// scheduler, and ryOS app windows can sit on a stale commit until something
// else forces a re-render. The fallback is to wipe the global CSS Custom
// Highlight registry directly from the speak() onEnd callback as soon as the
// queue empties, mirroring what `stopSpeech` already does for user stops.
//
// This source-level check ensures the fallback stays in place so we don't
// regress to "highlight lingers on the last spoken line until you switch the
// window in/out of focus".
describe("useChatSpeechSync force-clears highlight on natural end", () => {
  const source = readSource("src/apps/chats/hooks/useChatSpeechSync.ts");

  test("imports clearTtsHighlight from the ttsHighlight utility", () => {
    expect(source).toMatch(
      /import\s*\{[^}]*\bclearTtsHighlight\b[^}]*\}\s*from\s*"\.\.\/utils\/ttsHighlight"/
    );
  });

  test("stopSpeech still force-clears the registry for user-initiated stops", () => {
    expect(source).toMatch(
      /const\s+stopSpeech\s*=\s*useCallback\([\s\S]*?clearTtsHighlight\(\)/
    );
  });

  test("speak() onEnd calls clearTtsHighlight when the queue is empty", () => {
    expect(source).toMatch(
      /speak\([^,]+,\s*\(\)\s*=>\s*\{[\s\S]*?next\s*===\s*null[\s\S]*?clearTtsHighlight\(\)/
    );
  });
});
