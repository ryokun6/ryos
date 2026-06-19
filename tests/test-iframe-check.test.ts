#!/usr/bin/env bun
/**
 * Tests for /api/iframe-check endpoint
 * Tests: check mode, proxy mode, AI cache mode, list-cache mode
 */

import { describe, test, expect } from "bun:test";
import { BASE_URL, fetchWithOrigin } from "./test-utils";

describe("iframe-check", () => {
  describe("Input Validation", () => {
    test("Missing URL parameter", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/iframe-check`);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("url");
    });

    test("URL without protocol", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=example.com&mode=check`
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.allowed).toBe(true);
    });
  });

  describe("Check Mode", () => {
    test("Check mode - allowed site", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=https://example.com&mode=check`
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.allowed).toBe(true);
    });

    test("Check mode - auto-proxied site", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=https://youtube.com&mode=check`
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.allowed).toBe(false);
    });

    test("Check mode - auto-proxy domain", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=https://en.wikipedia.org&mode=check`
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.allowed).toBe(false);
      expect(data.reason).toContain("Auto-proxied");
    });
  });

  describe("Proxy Mode", () => {
    test("Proxy mode - success", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=https://example.com&mode=proxy`
      );
      expect(res.status).toBe(200);
      const contentType = res.headers.get("content-type") || "";
      expect(contentType).toContain("text/html");
      const html = await res.text();
      expect(html).toContain("<base href=");
    });

    test("Proxy mode - title extraction", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=https://example.com&mode=proxy`
      );
      expect(res.status).toBe(200);
      const title = res.headers.get("X-Proxied-Page-Title");
      expect(title).not.toBeNull();
      expect(decodeURIComponent(title ?? "")).toContain("Example");
    });

    test("Proxy mode - theme parameter", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=https://example.com&mode=proxy&theme=macosx`
      );
      expect(res.status).toBe(200);
      const html = await res.text();
      // The macosx theme suppresses the pixel-font override that other themes
      // inject (shouldInjectFontOverrides = theme !== "macosx").
      expect(html).not.toContain("Geneva-12");
    });

    test("Proxy mode - invalid URL", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=https://this-domain-does-not-exist-xyz123.com&mode=proxy`
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    test("Default mode is proxy", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=https://example.com`
      );
      expect(res.status).toBe(200);
      const contentType = res.headers.get("content-type") || "";
      // Default mode is proxy, which streams the rewritten HTML document.
      expect(contentType).toContain("text/html");
    });
  });

  describe("AI Cache Mode", () => {
    test("AI mode - missing year", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=https://example.com&mode=ai`
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("year");
    });

    test("AI mode - invalid year", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=https://example.com&mode=ai&year=invalid`
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("year");
    });

    test("AI mode - cache miss", async () => {
      const randomUrl = `https://example.com/test-${Date.now()}`;
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=${encodeURIComponent(randomUrl)}&mode=ai&year=2020`
      );
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.aiCache).toBe(false);
    });
  });

  describe("List Cache Mode", () => {
    test("List cache mode", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=https://example.com&mode=list-cache`
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.years)).toBe(true);
    });
  });
});
