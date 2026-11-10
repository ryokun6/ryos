/**
 * Regression tests for linear HTML scanners used to stop O(n²) process stalls
 * on crafted markup (audit H4 / H7 / H8).
 */
import { describe, expect, test } from "bun:test";
import {
  extractLinkMetadataLinear,
  extractTitleText,
  stripEnclosedBlocks,
  stripHtmlComments,
} from "../../../api/_utils/_html-linear";
import { extractMetadata, stripTagsUntilStable } from "../../../api/chat/tools/htmlExtract";
import { extractWebDocument } from "../../../api/chat/tools/webContent";
import { buildLiteHtml } from "../../../api/_utils/_ie-html";

describe("linear HTML scanners", () => {
  test("extractTitleText reads a normal title", () => {
    expect(
      extractTitleText("<html><head><title> Hello world </title></head></html>")
    ).toBe(" Hello world ");
  });

  test("extractTitleText stays linear on repeated unclosed <title openers", () => {
    const html = `<html><body>${"<title".repeat(40_000)}</body></html>`;
    const started = performance.now();
    expect(extractTitleText(html)).toBeUndefined();
    expect(performance.now() - started).toBeLessThan(200);
  });

  test("extractLinkMetadataLinear prefers og tags and stays linear", () => {
    const html = `<html><head>
      <title>Fallback</title>
      <meta property="og:title" content="OG Title">
      <meta property="og:description" content="OG Desc">
      <meta property="og:image" content="https://cdn.example/a.png">
      <meta property="og:site_name" content="Example">
      ${"<meta ".repeat(30_000)}
    </head></html>`;
    const started = performance.now();
    const meta = extractLinkMetadataLinear(html);
    expect(performance.now() - started).toBeLessThan(200);
    expect(meta.title).toBe("OG Title");
    expect(meta.description).toBe("OG Desc");
    expect(meta.image).toBe("https://cdn.example/a.png");
    expect(meta.siteName).toBe("Example");
  });

  test("stripEnclosedBlocks removes script/style without quadratic blowup", () => {
    const html = `<p>ok</p><script>evil()</script>${"<script ".repeat(20_000)}`;
    const started = performance.now();
    const out = stripEnclosedBlocks(html, "<script", "</script", {
      requireNameBoundary: true,
    });
    expect(performance.now() - started).toBeLessThan(200);
    expect(out).toContain("<p>ok</p>");
    expect(out).not.toContain("evil()");
  });

  test("stripHtmlComments is linear on unclosed comment openers", () => {
    const html = `hi${"<!--".repeat(40_000)}`;
    const started = performance.now();
    const out = stripHtmlComments(html);
    expect(performance.now() - started).toBeLessThan(200);
    expect(out.startsWith("hi")).toBe(true);
  });

  test("stripTagsUntilStable stays linear on bare < characters", () => {
    const value = "<".repeat(50_000);
    const started = performance.now();
    expect(stripTagsUntilStable(value)).toBe(value);
    expect(performance.now() - started).toBeLessThan(200);
  });

  test("webFetch extractWebDocument handles crafted meta spam quickly", () => {
    const body = `<html><head></head><body>${"<meta ".repeat(20_000)}</body></html>`;
    const started = performance.now();
    const doc = extractWebDocument(body, "text/html", {
      url: "https://evil.test/",
    });
    expect(performance.now() - started).toBeLessThan(500);
    expect(doc).toBeTruthy();
  });

  test("extractMetadata matches the linear helper on ordinary pages", () => {
    const html = `<html><head>
      <title>Page</title>
      <meta property="og:title" content="OG">
      <meta name="description" content="Desc">
      <meta property="og:site_name" content="Site">
    </head></html>`;
    expect(extractMetadata(html)).toEqual({
      title: "OG",
      description: "Desc",
      siteName: "Site",
    });
  });

  test("buildLiteHtml stays linear on unclosed article openers", async () => {
    const html = `<html><body>${"<article>".repeat(10_000)}</body></html>`;
    const started = performance.now();
    const lite = await buildLiteHtml(html, "https://evil.test/x");
    expect(performance.now() - started).toBeLessThan(500);
    expect(lite).toContain("ie-lite-view");
  });
});
