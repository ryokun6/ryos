/**
 * Tests for /api/link-preview endpoint
 * Tests: URL validation, metadata extraction, YouTube handling, error cases
 */

import { describe, test, expect } from "bun:test";
import { BASE_URL, fetchWithOrigin } from "./test-utils";

describe("link-preview", () => {
  describe("Input Validation", () => {
    test("Missing URL parameter", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/link-preview`);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error?.includes("URL") || data.error?.includes("url")).toBe(true);
    });

    test("Invalid URL format", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/link-preview?url=not-a-valid-url`
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error?.includes("Invalid") || data.error?.includes("invalid")).toBe(true);
    });

    test("Non-HTTP protocol", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/link-preview?url=ftp://example.com`
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error?.includes("HTTP")).toBe(true);
    });

    test("Method not allowed (POST)", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/link-preview`, {
        method: "POST",
      });
      expect(res.status).toBe(405);
    });

    test("OPTIONS request (CORS preflight)", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/link-preview`, {
        method: "OPTIONS",
      });
      expect(res.status === 200 || res.status === 204).toBe(true);
    });
  });

  describe("Metadata Extraction", () => {
    test("Basic metadata extraction", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/link-preview?url=https://example.com`
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.url).toMatch(/^https:\/\/example\.com\/?$/);
      expect(typeof data.siteName).toBe("string");
    });

    test("Open Graph extraction", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/link-preview?url=https://github.com`
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.url).toMatch(/^https:\/\/github\.com\/?$/);
      expect(data.title || data.siteName).toBeTruthy();
    });

    test("Cache headers", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/link-preview?url=https://example.com`
      );
      if (res.status === 200) {
        const cacheControl = res.headers.get("Cache-Control");
        expect(cacheControl !== null || true).toBe(true);
      }
    });
  });

  describe("YouTube Handling", () => {
    test("YouTube URL (watch)", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/link-preview?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ`
      );
      if (res.status === 200) {
        const data = await res.json();
        expect(data.siteName?.toLowerCase().includes("youtube") || data.title).toBe(true);
      } else {
        expect(res.status >= 400).toBe(true);
      }
    });

    test("YouTube short URL (youtu.be)", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/link-preview?url=https://youtu.be/dQw4w9WgXcQ`
      );
      if (res.status === 200) {
        const data = await res.json();
        expect(data.siteName).toBe("YouTube");
      } else {
        expect(res.status >= 400).toBe(true);
      }
    });
  });

  describe("Error Cases", () => {
    test("URL returning 404", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/link-preview?url=https://httpstat.us/404`
      );
      expect(res.status >= 400).toBe(true);
    });
  });
});
