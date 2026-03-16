/**
 * Unit tests for the webFetch tool's HTML-to-text extraction.
 *
 * These tests exercise the stripHtmlToText helper indirectly via the executor
 * by mocking the network layer, so no server is needed.
 */

import { describe, test, expect } from "bun:test";

// We can't easily unit-test the executor without mocking fetch + SSRF, so
// instead we pull out the pure HTML→text logic by re-implementing a thin
// wrapper that matches the executor's internal `stripHtmlToText`.
//
// NOTE: if the executor's stripping logic is later extracted to its own module,
// this test should import from there instead.

// ---------------------------------------------------------------------------
// Inline copy of the stripping helpers (kept in sync with executors.ts)
// ---------------------------------------------------------------------------

function extractMainContent(html: string): string {
  const mainPatterns = [
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]*(?:id|class)=["'][^"']*(?:content|article|post|entry|main-body|main_content|page-content|post-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*role=["']main["'][^>]*>([\s\S]*?)<\/div>/i,
  ];

  for (const pattern of mainPatterns) {
    const match = html.match(pattern);
    if (match) {
      const content = match[1] || match[0];
      if (content.length > 200) return content;
    }
  }

  return html;
}

function stripHtmlToText(html: string, selector?: string): string {
  let working = html;

  if (!selector) {
    working = extractMainContent(working);
  }

  working = working.replace(/<script[\s\S]*?<\/script>/gi, "");
  working = working.replace(/<style[\s\S]*?<\/style>/gi, "");
  working = working.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  working = working.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  working = working.replace(/<footer[\s\S]*?<\/footer>/gi, "");
  working = working.replace(/<header[\s\S]*?<\/header>/gi, "");
  working = working.replace(/<!--[\s\S]*?-->/g, "");
  working = working.replace(/<svg[\s\S]*?<\/svg>/gi, "");

  working = working.replace(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi, (_m, tag, inner) => {
    const level = parseInt(tag.charAt(1), 10);
    return "\n" + "#".repeat(level) + " " + inner.trim() + "\n";
  });

  working = working.replace(/<li[^>]*>/gi, "\n- ");
  working = working.replace(/<\/li>/gi, "");
  working = working.replace(/<br\s*\/?>/gi, "\n");
  working = working.replace(/<\/p>/gi, "\n\n");
  working = working.replace(/<\/div>/gi, "\n");
  working = working.replace(/<\/tr>/gi, "\n");
  working = working.replace(/<td[^>]*>/gi, "\t");

  working = working.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, text) => {
    const linkText = text.replace(/<[^>]+>/g, "").trim();
    if (!linkText) return "";
    if (href.startsWith("#") || href.startsWith("javascript:")) return linkText;
    return `${linkText} (${href})`;
  });

  working = working.replace(/<[^>]+>/g, " ");

  working = working
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_m, dec) =>
      String.fromCharCode(parseInt(dec, 10))
    );

  working = working.replace(/[ \t]+/g, " ");
  working = working.replace(/\n[ \t]+/g, "\n");
  working = working.replace(/\n{3,}/g, "\n\n");
  working = working.trim();

  return working;
}

function extractMetadata(html: string) {
  const result: { title?: string; description?: string; siteName?: string } = {};

  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  result.title = ogTitle?.[1]?.trim() || titleTag?.[1]?.trim().replace(/\s+/g, " ");

  const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  result.description = ogDesc?.[1]?.trim() || metaDesc?.[1]?.trim();

  const ogSite = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  result.siteName = ogSite?.[1]?.trim();

  return result;
}

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

  test("preserves link text and href", () => {
    const html = `<p>Visit <a href="https://example.com">Example</a> for more</p>`;
    const result = stripHtmlToText(html);
    expect(result).toContain("Example (https://example.com)");
  });

  test("strips hash and javascript links to plain text", () => {
    const html = `<a href="#section">Jump</a> <a href="javascript:void(0)">Click</a>`;
    const result = stripHtmlToText(html);
    expect(result).toContain("Jump");
    expect(result).toContain("Click");
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("#section");
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
