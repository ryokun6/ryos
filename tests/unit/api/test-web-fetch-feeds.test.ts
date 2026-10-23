/**
 * Unit tests for webFetch feed and non-HTML extraction.
 * No server or network access.
 */

import { describe, expect, test } from "bun:test";
import {
  extractWebDocument,
  readResponseTextLimited,
} from "../../../api/chat/tools/webContent";

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Ryo's Journal</title>
    <link>https://ryo.lu/journal</link>
    <description>notes from ryo</description>
    <item>
      <title>feelings</title>
      <link>https://ryo.lu/journal/feelings</link>
      <guid isPermaLink="true">https://ryo.lu/journal/feelings</guid>
      <pubDate>Sat, 17 Oct 2026 00:00:00 GMT</pubDate>
      <dc:creator>ryo@example.com (Ryo Lu)</dc:creator>
      <description>short blurb only</description>
      <content:encoded><![CDATA[<p>light piercing through the blinds</p><p>life is beautiful, the way it is</p><pre><code class="language-js">const answer = 42;</code></pre>]]></content:encoded>
    </item>
    <item>
      <title>other</title>
      <link>https://ryo.lu/journal/other</link>
      <pubDate>Mon, 05 Oct 2026 12:30:00 GMT</pubDate>
      <description>second post body that is plain</description>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Feed</title>
  <link href="https://example.com/" rel="alternate"/>
  <link href="https://example.com/atom.xml" rel="self"/>
  <updated>2026-10-01T00:00:00Z</updated>
  <entry>
    <title>Hello &amp; welcome</title>
    <link href="https://example.com/hello" rel="alternate"/>
    <id>tag:example.com,2026:hello</id>
    <published>2026-10-01T12:30:00Z</published>
    <updated>2026-10-02T00:00:00Z</updated>
    <author><name>Ada Lovelace</name></author>
    <summary>short summary</summary>
    <content type="html"><![CDATA[<p>Full <b>body</b> of the entry.</p>]]></content>
  </entry>
  <entry>
    <title>Summary only</title>
    <link href="https://example.com/summary" rel="alternate"/>
    <id>tag:example.com,2026:summary</id>
    <updated>2026-09-01T00:00:00Z</updated>
    <summary>just the summary text</summary>
  </entry>
</feed>`;

const JSON_FEED = {
  version: "https://jsonfeed.org/version/1.1",
  title: "JSON Journal",
  home_page_url: "https://example.com/journal",
  items: [
    {
      id: "https://example.com/journal/one",
      url: "https://example.com/journal/one",
      title: "One",
      date_published: "2026-10-03T00:00:00Z",
      authors: [{ name: "Ryo" }],
      summary: "short json summary",
      content_html: "<p>Full json post body.</p><pre><code>let n = 1;</code></pre>",
    },
  ],
};

describe("webFetch RSS", () => {
  test("reads RSS 2.0 items with full content:encoded text", () => {
    const doc = extractWebDocument(RSS, "application/rss+xml; charset=utf-8");
    expect(doc.kind).toBe("feed");
    expect(doc.title).toBe("Ryo's Journal");
    expect(doc.feedItemCount).toBe(2);
    expect(doc.content).toContain("# Ryo's Journal");
    expect(doc.content).toContain("https://ryo.lu/journal");
    expect(doc.content).toContain("## feelings");
    expect(doc.content).toContain("https://ryo.lu/journal/feelings");
    expect(doc.content).toContain("2026-10-17");
    expect(doc.content).toContain("Ryo Lu");
    expect(doc.content).toContain("light piercing through the blinds");
    expect(doc.content).toContain("life is beautiful, the way it is");
    expect(doc.content).toContain("```js");
    expect(doc.content).toContain("const answer = 42;");
    expect(doc.content).not.toContain("short blurb only");
    expect(doc.content).toContain("## other");
    expect(doc.content).toContain("second post body that is plain");
    expect(doc.content).toContain("2026-10-05 12:30 UTC");
  });

  test("accepts a feed served as application/xml", () => {
    const doc = extractWebDocument(RSS, "application/xml; charset=utf-8");
    expect(doc.kind).toBe("feed");
    expect(doc.content).toContain("light piercing through the blinds");
  });

  test("can return one item that matches a page url", () => {
    const doc = extractWebDocument(RSS, "text/xml", {
      matchUrl: "https://ryo.lu/journal/feelings/",
    });
    expect(doc.matchedFeedItem).toBe(true);
    expect(doc.title).toBe("feelings");
    expect(doc.content).toContain("life is beautiful, the way it is");
    expect(doc.content).not.toContain("second post body");
  });
});

describe("webFetch Atom", () => {
  test("reads Atom entries, preferring content over summary", () => {
    const doc = extractWebDocument(ATOM, "application/atom+xml");
    expect(doc.kind).toBe("feed");
    expect(doc.title).toBe("Example Feed");
    expect(doc.content).toContain("https://example.com/");
    expect(doc.content).not.toContain("https://example.com/atom.xml");
    expect(doc.content).toContain("## Hello & welcome");
    expect(doc.content).toContain("Ada Lovelace");
    expect(doc.content).toContain("2026-10-01 12:30 UTC");
    expect(doc.content).toContain("Full body of the entry.");
    expect(doc.content).not.toContain("short summary");
    expect(doc.content).toContain("## Summary only");
    expect(doc.content).toContain("just the summary text");
  });
});

describe("webFetch JSON, XML, and text", () => {
  test("formats a JSON Feed", () => {
    const doc = extractWebDocument(
      JSON.stringify(JSON_FEED),
      "application/feed+json; charset=utf-8"
    );
    expect(doc.kind).toBe("feed");
    expect(doc.content).toContain("# JSON Journal");
    expect(doc.content).toContain("## One");
    expect(doc.content).toContain("Ryo");
    expect(doc.content).toContain("2026-10-03");
    expect(doc.content).toContain("Full json post body.");
    expect(doc.content).toContain("let n = 1;");
    expect(doc.content).not.toContain("short json summary");
  });

  test("leaves ordinary JSON as JSON", () => {
    const raw = `{"ok":true,"n":1}`;
    const doc = extractWebDocument(raw, "application/json");
    expect(doc.kind).toBe("json");
    expect(doc.content).toContain('"ok":true');
  });

  test("does not expand external xml entities", () => {
    const xml = `<?xml version="1.0"?>
<!DOCTYPE foo [ <!ENTITY xxe SYSTEM "http://127.0.0.1/secret"> ]>
<note><body>hello &xxe;</body></note>`;
    const doc = extractWebDocument(xml, "text/xml");
    expect(doc.kind).toBe("xml");
    expect(doc.content).toContain("hello");
    expect(doc.content).not.toContain("127.0.0.1");
    expect(doc.content).not.toContain("secret");
  });

  test("returns readable text for generic XML", () => {
    const xml = `<?xml version="1.0"?><catalog><book id="b1"><title>Hello &amp; Goodbye</title><author>Ryo</author></book></catalog>`;
    const doc = extractWebDocument(xml, "application/xml");
    expect(doc.kind).toBe("xml");
    expect(doc.content).toContain("Hello & Goodbye");
    expect(doc.content).toContain("Ryo");
    expect(doc.content).not.toContain("<?xml");
  });

  test("returns markdown and plain text unchanged", () => {
    const markdown = "# Title\n\nA paragraph.";
    const md = extractWebDocument(markdown, "text/markdown; charset=utf-8");
    expect(md.kind).toBe("text");
    expect(md.content).toBe(markdown);
    const plain = extractWebDocument("just text", "text/plain");
    expect(plain.kind).toBe("text");
    expect(plain.content).toBe("just text");
  });

  test("still rejects binary content types", () => {
    const doc = extractWebDocument("not-really", "image/png");
    expect(doc.kind).toBe("unsupported");
    expect(doc.content).toBe("");
  });

  test("truncates a long feed on an item boundary with a note", () => {
    const doc = extractWebDocument(RSS, "application/rss+xml", { maxChars: 280 });
    expect(doc.truncated).toBe(true);
    expect(doc.content).toContain("[truncated – ");
    expect(doc.content).toContain("of 2 posts]");
    expect(doc.content).toContain("feelings");
  });
});

describe("webFetch download cap", () => {
  test("stops reading past the byte cap", async () => {
    const response = new Response("a".repeat(1000), {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
    const result = await readResponseTextLimited(response, 100);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBe(100);
    expect(result.text).toBe("a".repeat(100));
  });
});
