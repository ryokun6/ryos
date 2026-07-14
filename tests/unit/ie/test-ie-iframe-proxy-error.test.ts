#!/usr/bin/env bun
/**
 * Unit tests for cheap iframe proxy-error detection (avoids body.textContent
 * on multi‑MB HTML pages that would freeze the shared desktop tab).
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { readIframeProxyError } from "../../../src/apps/internet-explorer/utils/iframeProxyError.ts";

let registered = false;

beforeAll(() => {
  try {
    GlobalRegistrator.register();
    registered = true;
  } catch {
    // Another suite may already have registered happy-dom.
    registered = false;
  }
});

afterAll(() => {
  // Do not unregister — other suites in the same Bun process may still need
  // the DOM globals (see AGENTS.md cross-file pollution notes).
  void registered;
});

function makeDoc(html: string, contentType: string): Document {
  const parser = new DOMParser();
  // happy-dom's DOMParser ignores the type argument for contentType on the
  // resulting document in some versions — set it explicitly when possible.
  const doc = parser.parseFromString(html, "text/html");
  try {
    Object.defineProperty(doc, "contentType", {
      configurable: true,
      get: () => contentType,
    });
  } catch {
    /* ignore */
  }
  return doc;
}

describe("readIframeProxyError", () => {
  test("returns null for HTML documents without walking full textContent", () => {
    const big = "paragraph ".repeat(50_000);
    const doc = makeDoc(
      `<html><body><div>${big}</div><script>/* looks { like json */</script></body></html>`,
      "text/html"
    );
    expect(readIframeProxyError(doc)).toBeNull();
  });

  test("parses application/json proxy errors", () => {
    const payload = {
      error: true,
      type: "page_too_large",
      status: 413,
      message: "too big",
    };
    const doc = makeDoc(JSON.stringify(payload), "application/json");
    // JSON parsed as HTML may wrap in <html><body>… — ensure body is text-only.
    // Rebuild as a minimal document body when needed.
    if (doc.body.childElementCount > 0) {
      doc.body.innerHTML = "";
      doc.body.textContent = JSON.stringify(payload);
    }
    const err = readIframeProxyError(doc);
    expect(err?.type).toBe("page_too_large");
    expect(err?.status).toBe(413);
  });

  test("ignores non-error JSON", () => {
    const doc = makeDoc('{"ok":true}', "application/json");
    if (doc.body.childElementCount > 0) {
      doc.body.innerHTML = "";
      doc.body.textContent = '{"ok":true}';
    }
    expect(readIframeProxyError(doc)).toBeNull();
  });

  test("returns null for null document", () => {
    expect(readIframeProxyError(null)).toBeNull();
  });
});
