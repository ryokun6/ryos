#!/usr/bin/env bun
/**
 * Tests for /api/speech endpoint
 * Tests: Text-to-speech generation, validation, rate limiting
 */

import { describe, test, expect } from "bun:test";
import { BASE_URL, fetchWithOrigin } from "./test-utils";

describe("speech", () => {
  describe("HTTP Methods", () => {
    test("GET method not allowed", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "GET",
      });
      expect(res.status).toBe(405);
    });

    test("OPTIONS request (CORS preflight)", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "OPTIONS",
      });
      expect(res.status === 200 || res.status === 204).toBe(true);
    });
  });

  describe("Input Validation", () => {
    test("Missing text", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status === 400 || res.status === 429).toBe(true);
    });

    test("Empty text", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "" }),
      });
      expect(res.status === 400 || res.status === 429).toBe(true);
    });

    test("Whitespace only text", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "   " }),
      });
      expect(res.status === 400 || res.status === 429).toBe(true);
    });

    test("Invalid JSON", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json{",
      });
      expect(res.status).toBe(400);
    });
  });

  describe("TTS Generation", () => {
    test("Basic speech generation", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Hello, this is a test.",
        }),
      });
      if (res.status === 200) {
        const contentType = res.headers.get("content-type") || "";
        expect(contentType).toContain("audio");
        const buffer = await res.arrayBuffer();
        expect(buffer.byteLength > 0).toBe(true);
      } else if (res.status === 429) {
        const data = await res.json();
        expect(data.error).toBe("rate_limit_exceeded");
      } else {
        throw new Error(`Unexpected status: ${res.status}`);
      }
    });

    test("OpenAI model", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Testing OpenAI TTS.",
          model: "openai",
          voice: "alloy",
        }),
      });
      if (res.status === 200) {
        const contentType = res.headers.get("content-type") || "";
        expect(contentType).toContain("audio");
      } else if (res.status === 429) {
        expect(true).toBe(true);
      } else {
        throw new Error(`Unexpected status: ${res.status}`);
      }
    });

    test("ElevenLabs model", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Testing ElevenLabs TTS.",
          model: "elevenlabs",
        }),
      });
      if (res.status === 200) {
        const contentType = res.headers.get("content-type") || "";
        expect(contentType).toContain("audio");
      } else if (res.status === 429) {
        expect(true).toBe(true);
      } else if (res.status === 503) {
        const data = await res.json();
        expect(
          typeof data.error === "string" && data.error.includes("ElevenLabs")
        ).toBe(true);
      } else {
        throw new Error(`Unexpected status: ${res.status}`);
      }
    });

    test("OpenAI voice options", async () => {
      const voices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
      const voice = voices[Math.floor(Math.random() * voices.length)];

      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Testing voice options.",
          model: "openai",
          voice: voice,
          speed: 1.2,
        }),
      });
      if (res.status === 200) {
        const contentType = res.headers.get("content-type") || "";
        expect(contentType).toContain("audio");
      } else if (res.status === 429) {
        expect(true).toBe(true);
      } else {
        throw new Error(`Unexpected status: ${res.status}`);
      }
    });

    test("Default model selection", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Testing default model.",
        }),
      });
      expect(
        res.status === 200 || res.status === 429 || res.status === 503
      ).toBe(true);
    });
  });

  describe("Headers", () => {
    test("Rate limit headers", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Rate limit test.",
        }),
      });
      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        expect(retryAfter !== null).toBe(true);
        const limitHeader = res.headers.get("X-RateLimit-Limit");
        expect(limitHeader !== null).toBe(true);
      }
      expect(true).toBe(true);
    });

    test("CORS headers", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "CORS test.",
        }),
      });
      const allowOrigin = res.headers.get("Access-Control-Allow-Origin");
      expect(
        allowOrigin !== null || res.status >= 400
      ).toBe(true);
    });
  });
});
