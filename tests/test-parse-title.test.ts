/**
 * Tests for /api/parse-title endpoint
 * Tests: Title parsing, validation, AI-powered metadata extraction
 */

import { describe, test, expect } from "bun:test";
import { BASE_URL, fetchWithOrigin } from "./test-utils";

describe("parse-title", () => {
  describe("HTTP Methods", () => {
    test("GET method not allowed", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/parse-title`, {
        method: "GET",
      });
      expect(res.status).toBe(405);
    });

    test("OPTIONS request (CORS preflight)", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/parse-title`, {
        method: "OPTIONS",
      });
      expect(res.status === 200 || res.status === 204).toBe(true);
    });
  });

  describe("Input Validation", () => {
    test("Missing title", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/parse-title`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect((data.error ?? "").toLowerCase()).toContain("title");
    });

    test("Empty title", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/parse-title`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "" }),
      });
      expect(res.status).toBe(400);
    });

    test("Invalid JSON body", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/parse-title`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json",
      });
      expect(res.status).toBe(400);
    });
  });

  describe("Title Parsing", () => {
    test("Basic title parsing", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/parse-title`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Taylor Swift - Blank Space (Official Video)",
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.title).toBeTruthy();
      expect(data.artist || data.title).toBeTruthy();
    });

    test("Title with channel name", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/parse-title`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "How Sweet Official MV",
          author_name: "HYBE LABELS",
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.title).toBeTruthy();
    });

    test("Korean/English title", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/parse-title`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "NewJeans (뉴진스) 'How Sweet' Official MV",
          author_name: "HYBE LABELS",
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.title).toBeTruthy();
      if (data.artist) {
        expect(data.artist).toContain("뉴진스");
      }
    });

    test("Ambiguous title", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/parse-title`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Lofi Hip Hop Radio - Beats to Relax/Study to",
          author_name: "ChillHop Music",
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.title).toBeTruthy();
    });

    test("Response structure", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/parse-title`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Artist - Song Title",
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect("title" in data).toBe(true);
    });
  });
});
