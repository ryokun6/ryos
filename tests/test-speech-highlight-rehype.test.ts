import { describe, expect, test } from "bun:test";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import type { Root } from "hast";

import {
  buildRyosAssistTtsStreamdownRehypePlugins,
  ryosAssistTtsRehypePluginsForAssistantMarkdownPart,
} from "@/apps/chats/utils/speechHighlightRehype";

function runHighlightedHast(markdown: string, lo: number, hi: number): Root {
  const plugins = buildRyosAssistTtsStreamdownRehypePlugins(lo, hi);
  const proc = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(plugins);
  return proc.runSync(proc.parse(markdown));
}

/** True iff some `<strong>` wraps a descendant `<mark>`. */
function hastStrongWrapsMark(tree: Root): boolean {
  const walk = (n: unknown): boolean => {
    if (!n || typeof n !== "object") return false;
    const obj = n as {
      type?: string;
      tagName?: string;
      children?: unknown[];
    };
    if (
      obj.type === "element" &&
      obj.tagName === "strong" &&
      Array.isArray(obj.children)
    ) {
      if (
        obj.children.some(
          (c) =>
            !!c &&
            typeof c === "object" &&
            (c as { type?: string; tagName?: string }).type === "element" &&
            (c as { tagName?: string }).tagName === "mark",
        )
      ) {
        return true;
      }
    }
    if (!Array.isArray(obj.children)) return false;
    return obj.children.some(walk);
  };
  return walk(tree);
}

describe("buildRyosAssistTtsStreamdownRehypePlugins", () => {
  test("keeps markdown emphasis inside highlighted range (nested <mark>)", () => {
    const md = "- **Hello**\n";
    const hast = runHighlightedHast(md, 0, md.length);

    expect(hastStrongWrapsMark(hast)).toBe(true);

    expect(JSON.stringify(hast)).not.toContain("**Hello**");
    expect(JSON.stringify(hast)).toContain('"tagName":"mark"');
  });
});

describe("ryosAssistTtsRehypePluginsForAssistantMarkdownPart", () => {
  const baseOpts = {
    highlightSegment: { messageId: "msg-a", start: 0, end: 99 },
    messageId: "msg-a",
    messageRole: "assistant" as const,
    partMarkdownUtf16: "Hello **bold**.",
    partGlobalUtf16Start: 0,
  };

  test("returns a four-entry pluggable list for a valid assistant highlight", () => {
    const plugins = ryosAssistTtsRehypePluginsForAssistantMarkdownPart({
      ...baseOpts,
      highlightSegment: { messageId: "msg-a", start: 0, end: baseOpts.partMarkdownUtf16.length },
    });
    expect(plugins).toBeDefined();
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins!.length).toBe(4);
  });

  test("returns undefined when highlight messageId mismatches bubble", () => {
    expect(
      ryosAssistTtsRehypePluginsForAssistantMarkdownPart({
        ...baseOpts,
        messageId: "msg-b",
        highlightSegment: { messageId: "msg-a", start: 0, end: 5 },
      }),
    ).toBeUndefined();
  });

  test("returns undefined for non-assistant role", () => {
    expect(
      ryosAssistTtsRehypePluginsForAssistantMarkdownPart({
        ...baseOpts,
        messageRole: "user",
        highlightSegment: { messageId: "msg-a", start: 0, end: 5 },
      }),
    ).toBeUndefined();
  });

  test("returns undefined when highlight does not overlap the part UTF-16 range", () => {
    const gs = 100;
    const part = "hi";
    expect(
      ryosAssistTtsRehypePluginsForAssistantMarkdownPart({
        highlightSegment: { messageId: "msg-a", start: 0, end: 50 },
        messageId: "msg-a",
        messageRole: "assistant",
        partMarkdownUtf16: part,
        partGlobalUtf16Start: gs,
      }),
    ).toBeUndefined();
  });

  test("returns undefined when the overlapping slice contains fenced-code delimiters", () => {
    const part = "before ```fence``` after";
    expect(
      ryosAssistTtsRehypePluginsForAssistantMarkdownPart({
        highlightSegment: { messageId: "msg-a", start: 0, end: part.length + 999 },
        messageId: "msg-a",
        messageRole: "assistant",
        partMarkdownUtf16: part,
        partGlobalUtf16Start: 0,
      }),
    ).toBeUndefined();
  });

  test("pipes part-relative offsets into buildRyosAssistTtsStreamdownRehypePlugins (nested mark)", () => {
    const md = "- **Hello**\n";
    const gs = 10;
    const plugins = ryosAssistTtsRehypePluginsForAssistantMarkdownPart({
      highlightSegment: { messageId: "msg-a", start: gs, end: gs + md.length },
      messageId: "msg-a",
      messageRole: "assistant",
      partMarkdownUtf16: md,
      partGlobalUtf16Start: gs,
    });
    expect(plugins).toBeDefined();
    const proc = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype)
      .use(plugins!);
    const hast = proc.runSync(proc.parse(md));
    expect(hastStrongWrapsMark(hast)).toBe(true);
  });
});
