/**
 * Unit tests for the webFetch tool's HTML-to-text extraction.
 *
 * These import the real helpers from api/chat/tools/htmlExtract.ts (the same
 * module executors.ts uses), so the tests fail if the production logic changes.
 * No server or network access needed.
 */

import { describe, test, expect } from "bun:test";
import { decodeHtmlEntitiesOnce } from "../../../api/_utils/html-entities";
import {
  DANGEROUS_URL_SCHEMES,
  extractMetadata,
  findAlternateFeedUrl,
  stripHtmlToText,
  stripTagsLoop,
} from "../../../api/chat/tools/htmlExtract";
import { extractWebDocument } from "../../../api/chat/tools/webContent";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("webFetch HTML→text extraction", () => {
  test("strips script and style tags", () => {
    const html = `<p>Hello</p><script>alert('x')</script><style>body{}</style><p>World</p>`;
    const result = stripHtmlToText(html);
    expect(result).not.toContain("alert");
    expect(result).not.toContain("body{}");
    expect(result).toContain("Hello");
    expect(result).toContain("World");
  });

  test("strips script tags with space before closing angle bracket", () => {
    const html = `<p>Safe</p><script >alert('x')</script ><p>Also safe</p>`;
    const result = stripHtmlToText(html);
    expect(result).not.toContain("alert");
    expect(result).toContain("Safe");
    expect(result).toContain("Also safe");
  });

  test("handles nested/obfuscated script tags via loop stripping", () => {
    const html = `<p>Before</p><scr<script>alert(1)</script>ipt>evil</scr<script></script>ipt><p>After</p>`;
    const result = stripHtmlToText(html);
    expect(result).not.toContain("evil");
    expect(result).toContain("Before");
    expect(result).toContain("After");
  });

  test("converts headings to markdown", () => {
    const html = `<h1>Title</h1><h2>Subtitle</h2><p>Body text</p>`;
    const result = stripHtmlToText(html);
    expect(result).toContain("# Title");
    expect(result).toContain("## Subtitle");
    expect(result).toContain("Body text");
  });

  test("converts list items", () => {
    const html = `<ul><li>First</li><li>Second</li><li>Third</li></ul>`;
    const result = stripHtmlToText(html);
    expect(result).toContain("- First");
    expect(result).toContain("- Second");
    expect(result).toContain("- Third");
  });

  test("preserves link text and href as markdown", () => {
    const html = `<p>Visit <a href="https://example.com">Example</a> for more</p>`;
    const result = stripHtmlToText(html);
    expect(result).toContain("[Example](https://example.com)");
  });

  test("strips hash and javascript links to plain text", () => {
    const html = `<a href="#section">Jump</a> <a href="javascript:void(0)">Click</a>`;
    const result = stripHtmlToText(html);
    expect(result).toContain("Jump");
    expect(result).toContain("Click");
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("#section");
  });

  test("strips data: and vbscript: URLs from links", () => {
    const html = `<a href="data:text/html,<script>alert(1)</script>">Trap</a> <a href="vbscript:MsgBox('hi')">VB</a>`;
    const result = stripHtmlToText(html);
    expect(result).toContain("Trap");
    expect(result).toContain("VB");
    expect(result).not.toContain("data:");
    expect(result).not.toContain("vbscript:");
  });

  test("decodes HTML entities", () => {
    const html = `<p>&amp; &lt; &gt; &quot; &#39; &#x2603;</p>`;
    const result = stripHtmlToText(html);
    expect(result).toContain("&");
    expect(result).toContain("<");
    expect(result).toContain(">");
    expect(result).toContain('"');
    expect(result).toContain("'");
    expect(result).toContain("☃");
  });

  test("does not double-unescape entities", () => {
    const html = `<p>&amp;lt; should stay as &lt; not become <</p>`;
    const result = stripHtmlToText(html);
    expect(result).toContain("&lt;");
  });

  test("strips nav, footer, header, and comments", () => {
    const html = `
      <nav><a href="/">Home</a></nav>
      <header><h1>Site Name</h1></header>
      <p>Content</p>
      <!-- This is a comment -->
      <footer>Copyright 2025</footer>
    `;
    const result = stripHtmlToText(html);
    expect(result).toContain("Content");
    expect(result).not.toContain("This is a comment");
  });

  test("collapses excessive whitespace", () => {
    const html = `<p>Hello</p>    <p>World</p>  <p>Foo</p>`;
    const result = stripHtmlToText(html);
    expect(result).not.toMatch(/\n{4,}/);
  });

  test("prefers <main> content when present", () => {
    const long = "x".repeat(300);
    const html = `<div>Header stuff</div><main><p>${long}</p></main><div>Footer stuff</div>`;
    const result = stripHtmlToText(html);
    expect(result).toContain(long);
  });

  test("does not treat link tags as list items", () => {
    const html = `<head><link rel="stylesheet" href="/app.css"><link rel="alternate" type="application/rss+xml" href="/rss.xml"><title>Ryo Lu</title></head><body><p>Hello body</p></body>`;
    const result = stripHtmlToText(html);
    expect(result).toContain("Hello body");
    expect(result).not.toMatch(/^-/m);
    expect(result).not.toContain("/rss.xml");
  });

  test("keeps the article past the first nested div and preserves code", () => {
    const html = `
      <html><body>
        <nav><a href="/home">Global navigation sentinel</a></nav>
        <div class="post-content">
          <div class="kicker">A short kicker inside the first nested div.</div>
          <h1>The real headline</h1>
          <p>First paragraph of the article with enough words to be obvious.</p>
          <p>Second paragraph that older extraction dropped because it stopped at the first closing div.</p>
          <pre><code class="language-js">const answer = 42;</code></pre>
          <ul><li>Alpha</li><li>Beta</li></ul>
          <p>See <a href="https://example.com/story">the source</a>.</p>
        </div>
        <footer>Copyright footer sentinel</footer>
      </body></html>
    `;
    const result = stripHtmlToText(html);
    expect(result).toContain("# The real headline");
    expect(result).toContain("Second paragraph that older extraction dropped");
    expect(result).toContain("```js");
    expect(result).toContain("const answer = 42;");
    expect(result).toContain("- Alpha");
    expect(result).toContain("[the source](https://example.com/story)");
    expect(result).not.toContain("Global navigation sentinel");
    expect(result).not.toContain("Copyright footer sentinel");
  });

  test("keeps paragraph breaks inside a layout table", () => {
    const html = `<table><tr><td><font>July 2023<br /><br />First paragraph of the essay.<br /><br />Second paragraph stays separate.</font></td></tr></table>`;
    const result = stripHtmlToText(html);
    expect(result).toContain("First paragraph of the essay.");
    expect(result).toContain("Second paragraph stays separate.");
    expect(result).toMatch(/essay\.\n+Second paragraph/);
  });

  test("uses a css selector when one is passed", () => {
    const html = `<article id="story"><p>Inside story</p></article><p>Outside story</p>`;
    const result = stripHtmlToText(html, "#story");
    expect(result).toContain("Inside story");
    expect(result).not.toContain("Outside story");
  });
});

describe("webFetch metadata extraction", () => {
  test("extracts og:title and og:description", () => {
    const html = `
      <html><head>
        <meta property="og:title" content="OG Title">
        <meta property="og:description" content="OG Description">
        <meta property="og:site_name" content="Example Site">
        <title>Fallback Title</title>
      </head><body></body></html>
    `;
    const meta = extractMetadata(html);
    expect(meta.title).toBe("OG Title");
    expect(meta.description).toBe("OG Description");
    expect(meta.siteName).toBe("Example Site");
  });

  test("falls back to <title> and meta description", () => {
    const html = `
      <html><head>
        <title>Page Title</title>
        <meta name="description" content="Page description">
      </head><body></body></html>
    `;
    const meta = extractMetadata(html);
    expect(meta.title).toBe("Page Title");
    expect(meta.description).toBe("Page description");
  });

  test("handles missing metadata gracefully", () => {
    const html = `<html><head></head><body>Hello</body></html>`;
    const meta = extractMetadata(html);
    expect(meta.title).toBeUndefined();
    expect(meta.description).toBeUndefined();
    expect(meta.siteName).toBeUndefined();
  });
});

describe("webFetch security", () => {
  test("stripTagsLoop handles nested script injection", () => {
    const payload = `<scri<script></script>pt>alert(1)</script>`;
    const result = stripTagsLoop(payload, /<script\b[\s\S]*?<\/script[^>]*>/gi);
    expect(result).not.toContain("<script");
  });

  test("strips malformed closing tags with extra chars before >", () => {
    const html = `<p>Safe</p><script>evil()</script\t\n bar><p>Also safe</p>`;
    const result = stripHtmlToText(html);
    expect(result).not.toContain("evil");
    expect(result).toContain("Safe");
    expect(result).toContain("Also safe");
  });

  test("decodeHtmlEntitiesOnce does not double-decode", () => {
    expect(decodeHtmlEntitiesOnce("&amp;lt;")).toBe("&lt;");
    expect(decodeHtmlEntitiesOnce("&amp;amp;")).toBe("&amp;");
  });

  test("DANGEROUS_URL_SCHEMES blocks known dangerous protocols", () => {
    expect(DANGEROUS_URL_SCHEMES.test("javascript:alert(1)")).toBe(true);
    expect(DANGEROUS_URL_SCHEMES.test("data:text/html,<h1>hi</h1>")).toBe(true);
    expect(DANGEROUS_URL_SCHEMES.test("vbscript:MsgBox")).toBe(true);
    expect(DANGEROUS_URL_SCHEMES.test("blob:http://example.com")).toBe(true);
    expect(DANGEROUS_URL_SCHEMES.test("https://safe.com")).toBe(false);
    expect(DANGEROUS_URL_SCHEMES.test("http://ok.com")).toBe(false);
  });
});

describe("webFetch alternate feed", () => {
  const shell = `<html><head>
    <link rel="alternate" type="application/rss+xml" title="Ryo’s Journal" href="https://ryo.lu/journal/rss.xml" hreflang="en">
    <link rel="alternate" type="application/rss+xml" title="Ryo’s Journal" href="https://ryo.lu/journal/zh/rss.xml" hreflang="zh-Hant">
    <link rel="alternate" type="application/rss+xml" href="https://evil.example/rss.xml">
    <title>convergence to the mean</title>
  </head><body><div id="root"></div></body></html>`;

  test("picks the same-directory feed and ignores other hosts", () => {
    expect(
      findAlternateFeedUrl(shell, "https://ryo.lu/journal/convergence-to-the-mean")
    ).toBe("https://ryo.lu/journal/rss.xml");
    expect(
      findAlternateFeedUrl(shell, "https://ryo.lu/journal/zh/some-post")
    ).toBe("https://ryo.lu/journal/zh/rss.xml");
  });

  test("does not offer a cross-site feed", () => {
    const html = `<html><head><link rel="alternate" type="application/rss+xml" href="https://evil.example/rss.xml"></head><body><p>Hi</p></body></html>`;
    expect(findAlternateFeedUrl(html, "https://ryo.lu/journal/post")).toBeUndefined();
  });

  test("marks a script shell for a same-site feed follow-up", () => {
    const doc = extractWebDocument(shell, "text/html; charset=utf-8", {
      pageUrl: "https://ryo.lu/journal/convergence-to-the-mean",
    });
    expect(doc.kind).toBe("html");
    expect(doc.visibleLength).toBeLessThan(400);
    expect(doc.alternateFeedUrl).toBe("https://ryo.lu/journal/rss.xml");
    expect(doc.title).toBe("convergence to the mean");
  });
});
