#!/usr/bin/env bun
/**
 * Tests for /api/iframe-check endpoint
 * Tests: check mode, proxy mode, AI cache mode, list-cache mode
 */

import { describe, test, expect } from "bun:test";
import {
  BASE_URL,
  fetchWithOrigin,
  makeRateLimitBypassHeaders,
} from "./test-utils";

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

    test("Proxy mode - rewrites HTML assets, forms, and diagnostics", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=${encodeURIComponent(
          "https://example.com/fixture/page"
        )}&mode=proxy&fixture=html-assets&debug=1&session=test_html_assets`,
        { headers: makeRateLimitBypassHeaders() }
      );
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("/api/iframe-check");
      expect(html).toContain("resource=style");
      expect(html).toContain("resource=script");
      expect(html).not.toContain('type="text/plain" data-ryos-blocked-script="true"');
      expect(html).toContain("type: 'iframeReady'");
      expect(html).toContain("postReady('timeout')");
      expect(html).toContain("resource=image");
      expect(html).toContain("resource=iframe");
      expect(html).toContain("form=1");
      expect(html).not.toContain("integrity=");
      expect(html).not.toContain("nonce=");
      const diagnostics = JSON.parse(
        decodeURIComponent(res.headers.get("X-Proxy-Diagnostics") || "{}")
      );
      expect(diagnostics.rewrites.htmlAttributes).toBeGreaterThan(0);
      expect(diagnostics.rewrites.cssUrls).toBeGreaterThan(0);
      expect(diagnostics.cookieSession).toBe(true);
    });

    test("Proxy mode - disables scripts only for flagged compatibility domains", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=${encodeURIComponent(
          "https://www.nytimes.com/fixture/page"
        )}&mode=proxy&fixture=html-assets&debug=1&session=test_nytimes_assets`,
        { headers: makeRateLimitBypassHeaders() }
      );
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('type="text/plain"');
      expect(html).toContain('data-ryos-blocked-script="true"');
      expect(html).toContain("resource=script");
    });

    test("Proxy mode - rewrites stylesheet urls", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=${encodeURIComponent(
          "https://example.com/assets/site.css"
        )}&mode=proxy&fixture=stylesheet&resource=style&debug=1`,
        { headers: makeRateLimitBypassHeaders() }
      );
      expect(res.status).toBe(200);
      const css = await res.text();
      expect(css).toContain("/api/iframe-check");
      expect(css).toContain("resource=image");
      expect(css).toContain("resource=style");
      const diagnostics = JSON.parse(
        decodeURIComponent(res.headers.get("X-Proxy-Diagnostics") || "{}")
      );
      expect(diagnostics.resourceType).toBe("style");
      expect(diagnostics.rewrites.cssUrls).toBe(2);
    });

    test("Proxy mode - uses resource-aware request headers", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=${encodeURIComponent(
          "https://example.com/assets/logo.png"
        )}&mode=proxy&fixture=headers&resource=image&debug=1`,
        { headers: makeRateLimitBypassHeaders() }
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.accept).toContain("image/");
      expect(data.secFetchDest).toBe("image");
      const diagnostics = JSON.parse(
        decodeURIComponent(res.headers.get("X-Proxy-Diagnostics") || "{}")
      );
      expect(diagnostics.resourceType).toBe("image");
    });

    test("Proxy mode - stores cookies per proxy session", async () => {
      const session = `test_cookie_${Date.now()}`;
      const first = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=${encodeURIComponent(
          "https://example.com/cookie"
        )}&mode=proxy&fixture=set-cookie&session=${session}`,
        { headers: makeRateLimitBypassHeaders() }
      );
      expect(first.status).toBe(200);

      const second = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=${encodeURIComponent(
          "https://example.com/headers"
        )}&mode=proxy&fixture=headers&resource=xhr&session=${session}`,
        { headers: makeRateLimitBypassHeaders() }
      );
      expect(second.status).toBe(200);
      const data = await second.json();
      expect(data.cookie).toContain("proxy_fixture=stored");
    });

    test("Proxy mode - supports constrained form POST proxying", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=${encodeURIComponent(
          "https://example.com/submit"
        )}&mode=proxy&fixture=post-echo&form=1`,
        {
          method: "POST",
          headers: {
            ...makeRateLimitBypassHeaders(),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ q: "ryos" }).toString(),
        }
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.method).toBe("POST");
      expect(data.contentType).toContain("application/x-www-form-urlencoded");
    });

    test("Proxy mode - rejects arbitrary POST tunneling", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/iframe-check?url=${encodeURIComponent(
          "https://example.com/submit"
        )}&mode=proxy&fixture=post-echo`,
        {
          method: "POST",
          headers: {
            ...makeRateLimitBypassHeaders(),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ q: "ryos" }).toString(),
        }
      );
      expect(res.status).toBe(400);
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
