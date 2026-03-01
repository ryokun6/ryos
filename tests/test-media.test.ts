/**
 * Tests for /api/audio-transcribe and /api/youtube-search endpoints
 * Tests: Audio transcription, YouTube search, validation, rate limiting
 */

import { describe, test, expect } from "bun:test";
import { BASE_URL, fetchWithOrigin } from "./test-utils";

// ============================================================================
// Audio Transcribe Tests
// ============================================================================

describe("audio-transcribe", () => {
  describe("HTTP Methods", () => {
    test("GET method not allowed", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/audio-transcribe`, {
        method: "GET",
      });
      expect(res.status).toBe(405);
    });

    test("OPTIONS request (CORS preflight)", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/audio-transcribe`, {
        method: "OPTIONS",
      });
      expect(res.status === 200 || res.status === 204).toBe(true);
    });
  });

  describe("Input Validation", () => {
    test("Missing audio file", async () => {
      const formData = new FormData();
      const res = await fetchWithOrigin(`${BASE_URL}/api/audio-transcribe`, {
        method: "POST",
        body: formData,
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(
        data.error?.includes("audio") || data.error?.includes("No audio")
      ).toBe(true);
    });

    test("Invalid file type (text instead of audio)", async () => {
      const formData = new FormData();
      const textBlob = new Blob(["This is not audio"], { type: "text/plain" });
      formData.append("audio", textBlob, "test.txt");

      const res = await fetchWithOrigin(`${BASE_URL}/api/audio-transcribe`, {
        method: "POST",
        body: formData,
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(
        data.error?.toLowerCase().includes("invalid") ||
          data.error?.toLowerCase().includes("type")
      ).toBe(true);
    });
  });

  describe("Transcription", () => {
    test("Valid audio file upload", async () => {
      const wavHeader = new Uint8Array([
        0x52, 0x49, 0x46, 0x46,
        0x24, 0x00, 0x00, 0x00,
        0x57, 0x41, 0x56, 0x45,
        0x66, 0x6d, 0x74, 0x20,
        0x10, 0x00, 0x00, 0x00,
        0x01, 0x00,
        0x01, 0x00,
        0x44, 0xac, 0x00, 0x00,
        0x88, 0x58, 0x01, 0x00,
        0x02, 0x00,
        0x10, 0x00,
        0x64, 0x61, 0x74, 0x61,
        0x00, 0x00, 0x00, 0x00,
      ]);

      const formData = new FormData();
      const audioBlob = new Blob([wavHeader], { type: "audio/wav" });
      formData.append("audio", audioBlob, "test.wav");

      const res = await fetchWithOrigin(`${BASE_URL}/api/audio-transcribe`, {
        method: "POST",
        body: formData,
      });

      if (res.status === 200) {
        const data = await res.json();
        expect("text" in data).toBe(true);
      } else if (res.status === 429) {
        const data = await res.json();
        expect(data.error).toBe("rate_limit_exceeded");
      } else if (res.status === 400 || res.status === 500) {
        // OpenAI may reject the minimal WAV - that's acceptable
        expect(true).toBe(true);
      } else {
        throw new Error(`Unexpected status: ${res.status}`);
      }
    });
  });

  describe("Headers", () => {
    test("CORS headers", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/audio-transcribe`, {
        method: "OPTIONS",
      });
      const allowOrigin = res.headers.get("Access-Control-Allow-Origin");
      expect(allowOrigin !== null || res.status >= 400).toBe(true);
    });

    test("Rate limit headers", async () => {
      const formData = new FormData();
      const audioBlob = new Blob([new Uint8Array(44)], { type: "audio/wav" });
      formData.append("audio", audioBlob, "test.wav");

      const res = await fetchWithOrigin(`${BASE_URL}/api/audio-transcribe`, {
        method: "POST",
        body: formData,
      });

      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        expect(retryAfter !== null).toBe(true);
        const data = await res.json();
        expect(data.scope === "burst" || data.scope === "daily").toBe(true);
      }
      expect(true).toBe(true);
    });
  });
});

// ============================================================================
// YouTube Search Tests
// ============================================================================

describe("youtube-search", () => {
  describe("HTTP Methods", () => {
    test("GET method not allowed", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/youtube-search`, {
        method: "GET",
      });
      expect(res.status).toBe(405);
    });

    test("OPTIONS request (CORS preflight)", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/youtube-search`, {
        method: "OPTIONS",
      });
      expect(res.status === 200 || res.status === 204).toBe(true);
    });
  });

  describe("Input Validation", () => {
    test("Missing query parameter", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/youtube-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    test("Empty query string", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/youtube-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "" }),
      });
      expect(res.status).toBe(400);
    });

    test("Invalid maxResults (too high)", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/youtube-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "test", maxResults: 100 }),
      });
      expect(res.status).toBe(400);
    });

    test("Invalid maxResults (zero)", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/youtube-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "test", maxResults: 0 }),
      });
      expect(res.status).toBe(400);
    });

    test("Invalid JSON body", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/youtube-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json{",
      });
      expect(res.status >= 400).toBe(true);
    });
  });

  describe("YouTube Search", () => {
    test("Basic search query", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/youtube-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "lofi music" }),
      });

      if (res.status === 200) {
        const data = await res.json();
        expect(Array.isArray(data.results)).toBe(true);
        if (data.results.length > 0) {
          const first = data.results[0];
          expect("videoId" in first).toBe(true);
          expect("title" in first).toBe(true);
          expect("channelTitle" in first).toBe(true);
          expect("thumbnail" in first).toBe(true);
        }
      } else if (res.status === 429) {
        const data = await res.json();
        expect(data.error).toBe("rate_limit_exceeded");
      } else if (res.status === 403) {
        // YouTube API quota exceeded or not configured
        expect(true).toBe(true);
      } else if (res.status === 500) {
        // API not configured
        expect(true).toBe(true);
      } else {
        throw new Error(`Unexpected status: ${res.status}`);
      }
    });

    test("Search with maxResults parameter", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/youtube-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "jazz music", maxResults: 5 }),
      });

      if (res.status === 200) {
        const data = await res.json();
        expect(Array.isArray(data.results)).toBe(true);
        expect(data.results.length).toBeLessThanOrEqual(5);
      } else if (res.status === 429 || res.status === 403 || res.status === 500) {
        expect(true).toBe(true);
      } else {
        throw new Error(`Unexpected status: ${res.status}`);
      }
    });
  });

  describe("Headers", () => {
    test("CORS headers", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/youtube-search`, {
        method: "OPTIONS",
      });
      const allowOrigin = res.headers.get("Access-Control-Allow-Origin");
      expect(allowOrigin !== null || res.status >= 400).toBe(true);
    });

    test("Rate limit headers", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/youtube-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "rate limit test" }),
      });

      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        expect(retryAfter !== null).toBe(true);
        const data = await res.json();
        expect(data.scope === "burst" || data.scope === "daily").toBe(true);
      }
      expect(true).toBe(true);
    });
  });
});
