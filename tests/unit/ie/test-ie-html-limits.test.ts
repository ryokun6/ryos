#!/usr/bin/env bun
/**
 * Unit tests for IE proxied-HTML size / script-strip helpers.
 */
import { describe, test, expect } from "bun:test";
import {
  IE_MAX_HTML_BYTES,
  IE_SCRIPT_STRIP_THRESHOLD_BYTES,
  IeHtmlTooLargeError,
  readResponseTextWithLimit,
  readResponseTextPrefix,
  stripHtmlScripts,
  sanitizeProxiedHtml,
} from "../../../api/_utils/_ie-html.ts";

describe("stripHtmlScripts", () => {
  test("removes inline and external script tags", () => {
    const html = `<html><head><script src="/a.js"></script><script>alert(1)</script></head><body>hi<script type="module">x</script></body></html>`;
    const out = stripHtmlScripts(html);
    expect(out).not.toContain("<script");
    expect(out).toContain("hi");
  });
});

describe("sanitizeProxiedHtml", () => {
  test("leaves small pages intact", () => {
    const html = "<html><body><script>ok</script>hi</body></html>";
    const result = sanitizeProxiedHtml(html);
    expect(result.strippedScripts).toBe(false);
    expect(result.html).toContain("<script>ok</script>");
  });

  test("strips scripts when over threshold", () => {
    const padding = "x".repeat(IE_SCRIPT_STRIP_THRESHOLD_BYTES + 100);
    const html = `<html><body><script>evil()</script>${padding}</body></html>`;
    const result = sanitizeProxiedHtml(html);
    expect(result.strippedScripts).toBe(true);
    expect(result.html).not.toContain("<script");
    expect(result.html).toContain(padding.slice(0, 20));
  });

  test("throws when over hard max", () => {
    const huge = "y".repeat(IE_MAX_HTML_BYTES + 10);
    expect(() => sanitizeProxiedHtml(huge)).toThrow(IeHtmlTooLargeError);
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
