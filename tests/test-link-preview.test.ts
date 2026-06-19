/**
 * Tests for /api/link-preview endpoint
 * Tests: URL validation, metadata extraction, YouTube handling, error cases
 */

import { describe, test, expect } from "bun:test";
import {
  BASE_URL,
  fetchWithOrigin,
  makeRateLimitBypassHeaders,
} from "./test-utils";

describe("link-preview", () => {
  describe("Input Validation", () => {
    test("Missing URL parameter", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/link-preview`, {
        headers: makeRateLimitBypassHeaders(),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error?.includes("URL") || data.error?.includes("url")).toBe(true);
    });

    test("Invalid URL format", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/link-preview?url=not-a-valid-url`,
        { headers: makeRateLimitBypassHeaders() }
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error?.includes("Invalid") || data.error?.includes("invalid")).toBe(true);
    });

    test("Non-HTTP protocol", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/link-preview?url=ftp://example.com`,
        { headers: makeRateLimitBypassHeaders() }
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error?.includes("HTTP")).toBe(true);
    });

    test("Method not allowed (POST)", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/link-preview`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
      });
      expect(res.status).toBe(405);
    });

    test("OPTIONS request (CORS preflight)", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/link-preview`, {
        method: "OPTIONS",
        headers: makeRateLimitBypassHeaders(),
      });
      expect([200, 204]).toContain(res.status);
    });
  });

  describe("Metadata Extraction", () => {
    test("Basic metadata extraction", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/link-preview?url=https://example.com`,
        { headers: makeRateLimitBypassHeaders() }
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.url).toMatch(/^https:\/\/example\.com\/?$/);
      expect(typeof data.siteName).toBe("string");
    });

    test("Open Graph extraction", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/link-preview?url=https://github.com`,
        { headers: makeRateLimitBypassHeaders() }
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.url).toMatch(/^https:\/\/github\.com\/?$/);
      expect(data.title || data.siteName).toBeTruthy();
    });

    test("Cache headers", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/link-preview?url=https://example.com`,
        { headers: makeRateLimitBypassHeaders() }
      );
      expect(res.status).toBe(200);
      const cacheControl = res.headers.get("Cache-Control");
      expect(cacheControl).not.toBeNull();
      expect(cacheControl).toContain("max-age");
    });
  });

  describe("YouTube Handling", () => {
    test("YouTube URL (watch)", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/link-preview?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ`,
        { headers: makeRateLimitBypassHeaders() }
      );
      if (res.status === 200) {
        const data = await res.json();
        const looksLikeYouTube =
          data.siteName?.toLowerCase().includes("youtube") ||
          Boolean(data.title);
        expect(looksLikeYouTube).toBe(true);
      } else {
        expect(res.status).toBeGreaterThanOrEqual(400);
      }
    });

    test("YouTube short URL (youtu.be)", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/link-preview?url=https://youtu.be/dQw4w9WgXcQ`,
        { headers: makeRateLimitBypassHeaders() }
      );
      if (res.status === 200) {
        const data = await res.json();
        expect(data.siteName).toBe("YouTube");
      } else {
        expect(res.status).toBeGreaterThanOrEqual(400);
      }
    });
  });

  describe("Error Cases", () => {
    // Previously this fetched https://httpstat.us/404 to exercise upstream HTTP
    // errors, but that host is unreachable from CI and made the test time out.
    // SSRF validation runs before any outbound fetch, so a private/reserved
    // target deterministically exercises the endpoint's rejection path with no
    // external dependency.
    test("rejects private/reserved IP targets (SSRF guard)", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/link-preview?url=http://127.0.0.1/`,
        { headers: makeRateLimitBypassHeaders() }
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(typeof data.error).toBe("string");
      expect(data.error).toContain("Private or reserved IPs");
    });

    test("rejects blocked hostnames (SSRF guard)", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/link-preview?url=http://169.254.169.254/latest/meta-data/`,
        { headers: makeRateLimitBypassHeaders() }
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(typeof data.error).toBe("string");
      expect(data.error).toContain("Blocked hostname");
    });
  });
});
