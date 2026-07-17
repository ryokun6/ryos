#!/usr/bin/env bun
/**
 * Unit tests for IE proxied-HTML size / lite-view helpers.
 */
import { describe, test, expect } from "bun:test";
import {
  IE_MAX_HTML_BYTES,
  IE_LITE_THRESHOLD_BYTES,
  IeHtmlTooLargeError,
  readResponseTextWithLimit,
  readResponseTextPrefix,
  stripHtmlScripts,
  sanitizeProxiedHtml,
  buildLiteHtml,
} from "../../../api/_utils/_ie-html.ts";

describe("stripHtmlScripts", () => {
  test("removes inline and external script tags", async () => {
    const html = `<html><head><script src="/a.js"></script><script>alert(1)</script></head><body>hi<script type="module">x</script></body></html>`;
    const out = await stripHtmlScripts(html);
    expect(out).not.toContain("<script");
    expect(out).toContain("hi");
  });
});

describe("buildLiteHtml", () => {
  test("builds a reader document with title, description, and article body", async () => {
    const html = `<!doctype html><html><head>
      <title>Shop visit</title>
      <meta property="og:title" content="Tower Records Shibuya">
      <meta property="og:description" content="A goliath of a retailer">
      <meta property="og:image" content="https://cdn.example/hero.jpg">
      <meta name="author" content="Lewis Empson">
      <meta property="article:published_time" content="2026-04-16">
    </head><body>
      <nav>ignore me</nav>
      <article>
        <h1>Tower Records Shibuya</h1>
        <p>${"Vinyl fills every floor. ".repeat(8)}</p>
        <p>${"The sixth floor is dedicated to records. ".repeat(6)}</p>
        <script>evil()</script>
      </article>
    </body></html>`;
    const lite = await buildLiteHtml(html, "https://www.whathifi.com/article");
    expect(lite).toContain("ie-lite-view");
    expect(lite).toContain("ie-reader");
    expect(lite).toContain("Reader");
    expect(lite).toContain("Tower Records Shibuya");
    expect(lite).toContain("A goliath of a retailer");
    expect(lite).toContain("Vinyl fills every floor");
    expect(lite).toContain("Lewis Empson");
    expect(lite).toContain("https://cdn.example/hero.jpg");
    expect(lite).not.toContain("evil()");
    expect(lite).toContain('href="https://www.whathifi.com/article"');
    expect(lite).toContain("/fonts/fonts.css");
    expect(new TextEncoder().encode(lite).byteLength).toBeLessThan(25_000);
  });

  test("falls back to paragraphs when no article tag exists", async () => {
    const html = `<html><head><title>News</title></head><body>
      <h1>Big headline about records</h1>
      <p>${"Alpha paragraph with enough text to keep. ".repeat(5)}</p>
      <p>${"Beta paragraph with enough text to keep. ".repeat(5)}</p>
    </body></html>`;
    const lite = await buildLiteHtml(html, "https://example.com/news");
    expect(lite).toContain("Big headline about records");
    expect(lite).toContain("Alpha paragraph");
    expect(lite).toContain("Beta paragraph");
  });

  test("strips share/newsletter chrome from the reader body", async () => {
    const html = `<html><head><title>Story</title>
      <meta property="og:title" content="Story">
    </head><body><article>
      <div class="share-buttons"><a href="#">Facebook</a><a href="#">X</a><a href="#">Email</a><a href="#">Copy</a></div>
      <p>${"The real article paragraph about vinyl shopping in Tokyo. ".repeat(4)}</p>
      <p>Subscribe to our newsletter for more deals.</p>
    </article></body></html>`;
    const lite = await buildLiteHtml(html, "https://example.com/story");
    expect(lite).toContain("vinyl shopping in Tokyo");
    expect(lite).not.toContain("Facebook");
    expect(lite).not.toContain("Subscribe to our newsletter");
  });
});

describe("sanitizeProxiedHtml", () => {
  test("leaves small pages intact", async () => {
    const html = "<html><body><script>ok</script>hi</body></html>";
    const result = await sanitizeProxiedHtml(html);
    expect(result.strippedScripts).toBe(false);
    expect(result.liteMode).toBe(false);
    expect(result.html).toContain("<script>ok</script>");
  });

  test("converts oversized pages to reader mode", async () => {
    const padding = "x".repeat(IE_LITE_THRESHOLD_BYTES + 100);
    const html = `<html><head><title>Huge</title></head><body>
      <article><h1>Huge</h1><p>${"Readable content for the lite view. ".repeat(20)}</p></article>
      <script>evil()</script>
      <!-- ${padding} -->
    </body></html>`;
    const result = await sanitizeProxiedHtml(html, {
      pageUrl: "https://example.com/huge",
    });
    expect(result.liteMode).toBe(true);
    expect(result.strippedScripts).toBe(true);
    expect(result.html).toContain("Reader");
    expect(result.html).toContain("Readable content for the lite view");
    expect(result.html).not.toContain("evil()");
    expect(result.html).not.toContain(padding.slice(0, 40));
  });

  test("throws when over hard max", async () => {
    const huge = "y".repeat(IE_MAX_HTML_BYTES + 10);
    await expect(sanitizeProxiedHtml(huge)).rejects.toThrow(IeHtmlTooLargeError);
  });
});

describe("readResponseTextWithLimit", () => {
  test("rejects when Content-Length exceeds max", async () => {
    const body = "hello";
    const response = new Response(body, {
      headers: { "content-length": String(IE_MAX_HTML_BYTES + 1) },
    });
    await expect(readResponseTextWithLimit(response, 100)).rejects.toThrow(
      IeHtmlTooLargeError
    );
  });

  test("reads body under the limit", async () => {
    const response = new Response("<html>ok</html>", {
      headers: { "content-type": "text/html" },
    });
    const text = await readResponseTextWithLimit(response, 10_000);
    expect(text).toBe("<html>ok</html>");
  });

  test("aborts while streaming when body exceeds max", async () => {
    const chunk = "a".repeat(1000);
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls > 5) {
          controller.enqueue(new TextEncoder().encode(chunk));
          controller.close();
          return;
        }
        controller.enqueue(new TextEncoder().encode(chunk));
      },
    });
    const response = new Response(stream);
    await expect(readResponseTextWithLimit(response, 2500)).rejects.toThrow(
      IeHtmlTooLargeError
    );
  });
});

describe("readResponseTextPrefix", () => {
  test("returns only the requested prefix", async () => {
    const response = new Response("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    const text = await readResponseTextPrefix(response, 5);
    expect(text).toBe("ABCDE");
  });
});
