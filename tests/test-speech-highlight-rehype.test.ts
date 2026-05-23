import { describe, expect, test } from "bun:test";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import type { Root } from "hast";

import { buildRyosAssistTtsStreamdownRehypePlugins } from "@/apps/chats/utils/speechHighlightRehype";

function runHighlightedHast(markdown: string, lo: number, hi: number): Root {
  const plugins = buildRyosAssistTtsStreamdownRehypePlugins(lo, hi);
  const proc = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(plugins);
  return proc.runSync(proc.parse(markdown));
}

describe("buildRyosAssistTtsStreamdownRehypePlugins", () => {
  test("keeps markdown emphasis inside highlighted range (nested <mark>)", () => {
    const md = "- **Hello**\n";
    const hast = runHighlightedHast(md, 0, md.length);

    function hastShowsRenderedBoldAroundMark(tree: Root): boolean {
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
                (c as { type?: string; tagName?: string }).type ===
                  "element" &&
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

    expect(hastShowsRenderedBoldAroundMark(hast)).toBe(true);

    expect(JSON.stringify(hast)).not.toContain("**Hello**");
    expect(JSON.stringify(hast)).toContain('"tagName":"mark"');
  });
});
