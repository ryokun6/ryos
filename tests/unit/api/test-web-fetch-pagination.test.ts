/**
 * webFetch paging: paragraph/heading boundaries, feed items, and the extract cache.
 * No server or network access.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { extractWebDocument } from "../../../api/chat/tools/webContent";
import { webFetchSchema } from "../../../api/chat/tools/schemas";
import {
  describeWebFetchPage,
  pageWebDocument,
  type PageableWebDocument,
} from "../../../api/chat/tools/webFetchPage";
import {
  clearWebFetchCache,
  readWebFetchCache,
  writeWebFetchCache,
} from "../../../api/chat/tools/webFetchCache";
import { WEB_FETCH_CACHE_TTL_MS } from "../../../api/chat/tools/webContentLimits";

afterEach(() => {
  clearWebFetchCache();
});

function words(word: string, count: number): string {
  return Array.from({ length: count }, () => word).join(" ");
}

describe("webFetch text pages", () => {
  test("splits on a paragraph boundary and the next offset continues", () => {
    const first = `${words("alpha", 140)}.`;
    const second = `${words("beta", 140)}.`;
    const text = `${first}\n\n${second}`;
    const page = pageWebDocument({ text }, { maxChars: 1000 });

    expect(page.content.startsWith(first)).toBe(true);
    expect(page.content).not.toContain("beta");
    expect(page.pagination.unit).toBe("chars");
    expect(page.pagination.hasMore).toBe(true);
    expect(page.pagination.nextOffset).toBeTypeOf("number");
    expect(page.content).toContain(
      `call webfetch again with offset ${page.pagination.nextOffset}`
    );

    const next = pageWebDocument({ text }, { offset: page.pagination.nextOffset ?? 0, maxChars: 1000 });
    expect(next.content.startsWith(second)).toBe(true);
    expect(next.content).not.toContain("alpha");
    expect(next.pagination.hasMore).toBe(false);
    expect(next.pagination.nextOffset).toBeNull();
    expect(next.content).not.toContain("[truncated");
    expect(next.outOfRange).toBe(false);
  });

  test("starts the next page on a heading instead of mid-heading", () => {
    const intro = `${words("intro", 140)}.`;
    const text = `${intro}\n\n# Next heading\n\n${words("after", 140)}.`;
    const page = pageWebDocument({ text }, { maxChars: 1000 });
    const rest = pageWebDocument(
      { text },
      { offset: page.pagination.nextOffset ?? 0, maxChars: 1000 }
    );
    const pages = [page.content, rest.content];
    const withHeading = pages.filter((content) => content.includes("# Next heading"));
    expect(withHeading.length).toBe(1);
    expect(pages.some((content) => content.includes("# Ne") && !content.includes("# Next heading"))).toBe(
      false
    );
    expect(rest.content).toContain("after");
    expect(page.content).not.toContain("after after");
  });

  test("splits a long paragraph on a sentence boundary", () => {
    const text = `${words("alpha", 80)} ends here. ${words("beta", 120)} ends later.`;
    const page = pageWebDocument({ text }, { maxChars: 1000 });
    expect(page.content).toContain("ends here.");
    expect(page.content).not.toContain("beta");
    expect(page.pagination.hasMore).toBe(true);
    const next = pageWebDocument(
      { text },
      { offset: page.pagination.nextOffset ?? 0, maxChars: 1000 }
    );
    expect(next.content.startsWith("beta")).toBe(true);
  });

  test("keeps a code fence intact when the break would land inside it", () => {
    const intro = `${words("intro", 80)}.`;
    const text = `${intro}\n\n\`\`\`js\nconst answer = 42;\n\`\`\`\n\n${words("after", 80)}.`;
    const page = pageWebDocument({ text }, { maxChars: intro.length + 20 });
    if (page.content.includes("const answer")) {
      expect(page.content).toContain("const answer = 42;");
    } else {
      expect(page.content).not.toContain("const");
    }
    expect(page.content).not.toMatch(/const answer = 4[^2]/);
  });

  test("breaks json on a value boundary", () => {
    const text = Array.from({ length: 200 }, (_, index) => `{"n":${index}}`).join("\n");
    const page = pageWebDocument({ text }, { maxChars: 1000 });
    const body = page.content.split("\n\n[truncated")[0] ?? "";
    expect(body.trimEnd().endsWith("}")).toBe(true);
    expect(page.pagination.hasMore).toBe(true);
    const next = pageWebDocument(
      { text },
      { offset: page.pagination.nextOffset ?? 0, maxChars: 1000 }
    );
    expect(next.content.trimStart().startsWith("{")).toBe(true);
  });

  test("reports an out-of-range character offset", () => {
    const text = "short page";
    const page = pageWebDocument({ text }, { offset: 5000 });
    expect(page.outOfRange).toBe(true);
    expect(page.content).toBe("");
    expect(page.pagination.hasMore).toBe(false);
    expect(page.pagination.nextOffset).toBeNull();
    expect(page.pagination.total).toBe(text.length);
    expect(
      describeWebFetchPage({ finalUrl: "https://example.com/post" }, page)
    ).toBe(`offset 5000 is past the end – ${text.length} chars`);
  });
});

describe("webFetch feed pages", () => {
  const header = "# Journal\nhttps://example.com/journal";

  function feed(blocks: string[], itemCount = blocks.length): PageableWebDocument {
    return {
      text: [header, ...blocks].join("\n\n"),
      feedHeader: header,
      feedBlocks: blocks,
      feedItemCount: itemCount,
    };
  }

  test("pages by whole items and the last page has no continuation", () => {
    const blocks = [0, 1, 2].map(
      (index) => `## Post ${index}\n\n${words(`body${index}`, 110)}.`
    );
    const doc = feed(blocks);
    const first = pageWebDocument(doc, { maxChars: 1000 });
    expect(first.pagination.unit).toBe("items");
    expect(first.content).toContain("## Post 0");
    expect(first.content).toContain("body0");
    expect(first.content).not.toContain("## Post 1");
    expect(first.pagination.nextOffset).toBe(1);
    expect(first.pagination.hasMore).toBe(true);
    expect(first.content).toContain("call webfetch again with offset 1");

    const second = pageWebDocument(doc, { offset: 1, maxChars: 1000 });
    expect(second.content).toContain("## Post 1");
    expect(second.content).not.toContain("body0");
    expect(second.pagination.nextOffset).toBe(2);

    const last = pageWebDocument(doc, { offset: 2, maxChars: 1000 });
    expect(last.content).toContain("## Post 2");
    expect(last.pagination.hasMore).toBe(false);
    expect(last.pagination.nextOffset).toBeNull();
    expect(last.content).not.toContain("[truncated");
    expect(
      describeWebFetchPage(
        { finalUrl: "https://example.com/journal", title: "Journal", siteName: "Example" },
        last
      )
    ).toContain("item 2 of 3");
  });

  test("stops at eight items even when the character budget is large", () => {
    const blocks = Array.from({ length: 10 }, (_, index) => `## Post ${index}\n\nshort ${index}`);
    const doc = feed(blocks);
    const page = pageWebDocument(doc, { maxChars: 32000 });
    expect(page.pagination.end).toBe(8);
    expect(page.pagination.nextOffset).toBe(8);
    expect(page.content).toContain("## Post 7");
    expect(page.content).not.toContain("## Post 8");

    const rest = pageWebDocument(doc, { offset: 8, maxChars: 32000 });
    expect(rest.content).toContain("## Post 8");
    expect(rest.content).toContain("## Post 9");
    expect(rest.pagination.hasMore).toBe(false);
  });

  test("continues a long post with part instead of cutting it off", () => {
    const block = `## Long\n\n${words("one", 160)}.\n\n${words("two", 160)}.`;
    const doc = feed([block, `## Next\n\n${words("three", 40)}.`]);
    const page = pageWebDocument(doc, { maxChars: 1000 });
    expect(page.content).toContain("one");
    expect(page.content).not.toContain("two");
    expect(page.content).not.toContain("## Next");
    expect(page.pagination.nextOffset).toBe(0);
    expect(page.pagination.nextPart).toBe(1);
    expect(page.content).toContain("call webfetch again with offset 0 and part 1");

    const continued = pageWebDocument(doc, { offset: 0, part: 1, maxChars: 1000 });
    expect(continued.content).toContain("two");
    expect(continued.content).toContain("[continued – item 0 part 1]");
    expect(continued.pagination.nextOffset).toBe(1);
    expect(continued.pagination.nextPart).toBeNull();

    const after = pageWebDocument(doc, { offset: 1, maxChars: 1000 });
    expect(after.content).toContain("## Next");
    expect(after.pagination.hasMore).toBe(false);
  });

  test("reports an out-of-range item offset", () => {
    const doc = feed(["## Only\n\nbody"]);
    const page = pageWebDocument(doc, { offset: 4 });
    expect(page.outOfRange).toBe(true);
    expect(page.content).toBe("");
    expect(page.pagination.hasMore).toBe(false);
    expect(page.pagination.nextOffset).toBeNull();
    expect(
      describeWebFetchPage({ finalUrl: "https://example.com/rss.xml", siteName: "Example" }, page)
    ).toBe("offset 4 is past the end – 1 item");
  });

  test("pages a parsed rss feed by item", () => {
    const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Notes</title><link>https://example.com</link><item><title>One</title><link>https://example.com/one</link><description>first body</description></item><item><title>Two</title><link>https://example.com/two</link><description>second body</description></item></channel></rss>`;
    const extracted = extractWebDocument(rss, "application/rss+xml");
    const page = pageWebDocument(
      {
        text: extracted.content,
        feedHeader: extracted.feedHeader,
        feedBlocks: extracted.feedBlocks,
        feedItemCount: extracted.feedItemCount,
      },
      { maxChars: 1000 }
    );
    expect(page.pagination.unit).toBe("items");
    expect(page.pagination.total).toBe(2);
    expect(page.pagination.hasMore).toBe(false);
    expect(page.content).toContain("first body");
    expect(page.content).toContain("second body");
    expect(page.content).not.toContain("[truncated");
  });
});

describe("webFetch extract cache", () => {
  test("reuses a fresh extract and drops it after the ttl", () => {
    const doc = {
      finalUrl: "https://example.com/a",
      text: "cached body",
      title: "A",
    };
    writeWebFetchCache("https://example.com/a", undefined, doc, 1_000);
    expect(readWebFetchCache("https://example.com/a", undefined, 1_000)?.text).toBe("cached body");
    expect(
      readWebFetchCache("https://example.com/a", undefined, 999 + WEB_FETCH_CACHE_TTL_MS)?.text
    ).toBe("cached body");
    expect(
      readWebFetchCache("https://example.com/a", undefined, 1_000 + WEB_FETCH_CACHE_TTL_MS)
    ).toBeUndefined();
  });

  test("keeps selector extracts separate and evicts the oldest entry", () => {
    writeWebFetchCache("https://example.com/a", "article", {
      finalUrl: "https://example.com/a",
      text: "article",
    });
    expect(readWebFetchCache("https://example.com/a", undefined)?.text).toBeUndefined();
    expect(readWebFetchCache("https://example.com/a", "article")?.text).toBe("article");

    clearWebFetchCache();
    for (let index = 0; index < 25; index += 1) {
      writeWebFetchCache(`https://example.com/${index}`, undefined, {
        finalUrl: `https://example.com/${index}`,
        text: `body ${index}`,
      });
    }
    expect(readWebFetchCache("https://example.com/0")).toBeUndefined();
    expect(readWebFetchCache("https://example.com/24")?.text).toBe("body 24");
  });
});

describe("webFetch schema paging params", () => {
  test("accepts offset, part, and maxChars inside the hard max", () => {
    const parsed = webFetchSchema.safeParse({
      url: "https://example.com/journal",
      offset: 8,
      part: 1,
      maxChars: 16000,
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects a negative offset and a page above the hard max", () => {
    expect(webFetchSchema.safeParse({ url: "https://example.com", offset: -1 }).success).toBe(
      false
    );
    expect(webFetchSchema.safeParse({ url: "https://example.com", maxChars: 100_000 }).success).toBe(
      false
    );
    expect(webFetchSchema.safeParse({ url: "https://example.com", maxChars: 100 }).success).toBe(
      false
    );
  });
});
