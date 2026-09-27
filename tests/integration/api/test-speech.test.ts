#!/usr/bin/env bun
/**
 * Tests for /api/speech endpoint
 * Tests: Text-to-speech generation, validation, rate limiting
 */

import { describe, test, expect } from "bun:test";
import {
  BASE_URL,
  fetchWithOrigin,
  makeRateLimitBypassHeaders,
} from "../../helpers/test-utils";
import { RYO_CHAT_SPEECH_SOURCE } from "../../../api/_utils/speech-policy";

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
      expect([200, 204]).toContain(res.status);
    });
  });

  describe("Input Validation", () => {
    test("Missing text", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect([400, 429]).toContain(res.status);
    });

    test("Empty text", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "" }),
      });
      expect([400, 429]).toContain(res.status);
    });

    test("Whitespace only text", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "   " }),
      });
      expect([400, 429]).toContain(res.status);
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
          source: RYO_CHAT_SPEECH_SOURCE,
        }),
      });
      if (res.status === 200) {
        const contentType = res.headers.get("content-type") || "";
        expect(contentType).toContain("audio");
        const buffer = await res.arrayBuffer();
        expect(buffer.byteLength).toBeGreaterThan(0);
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
      expect([200, 429]).toContain(res.status);
      if (res.status === 200) {
        const contentType = res.headers.get("content-type") || "";
        expect(contentType).toContain("audio");
      }
    });

    test("ElevenLabs model", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Testing ElevenLabs TTS.",
          model: "elevenlabs",
          source: RYO_CHAT_SPEECH_SOURCE,
        }),
      });
      expect([200, 429, 503]).toContain(res.status);
      if (res.status === 200) {
        const contentType = res.headers.get("content-type") || "";
        expect(contentType).toContain("audio");
      } else if (res.status === 503) {
        const data = await res.json();
        expect(typeof data.error).toBe("string");
        expect(data.error).toContain("ElevenLabs");
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
      expect([200, 429]).toContain(res.status);
      if (res.status === 200) {
        const contentType = res.headers.get("content-type") || "";
        expect(contentType).toContain("audio");
      }
    });

    test("Default model selection", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Testing default model.",
          source: RYO_CHAT_SPEECH_SOURCE,
        }),
      });
      expect([200, 429, 503]).toContain(res.status);
    });

    test("Ryo chat can request PVC", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          text: "Ryo chat PVC.",
          model: "elevenlabs",
          voice_id: "OHP6tMHkOsRKrsDdbPah",
          source: RYO_CHAT_SPEECH_SOURCE,
        }),
      });
      expect([200, 429, 503]).toContain(res.status);
      if (res.status === 200) {
        const contentType = res.headers.get("content-type") || "";
        expect(contentType).toContain("audio");
      }
    }, 15_000);

    test("Ryo chat can request Instant v4", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          text: "Ryo chat Instant v4.",
          model: "elevenlabs",
          voice_id: "oYLmJyxUFvewUpYziJlr",
          source: RYO_CHAT_SPEECH_SOURCE,
        }),
      });
      expect([200, 429, 503]).toContain(res.status);
      if (res.status === 200) {
        const contentType = res.headers.get("content-type") || "";
        expect(contentType).toContain("audio");
      }
    }, 15_000);
  });

  describe("Ryo voice source gate", () => {
    test("rejects default ElevenLabs / Ryo PVC without ryo-chat source", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          text: "Should not speak as Ryo.",
        }),
      });
      expect([403, 429]).toContain(res.status);
      if (res.status === 403) {
        const data = await res.json();
        expect(data.error).toBe("ryo_voice_forbidden");
      }
    });

    test("rejects explicit Ryo voice ids from non-chat sources", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          text: "TextEdit should not use Ryo.",
          model: "elevenlabs",
          voice_id: "OHP6tMHkOsRKrsDdbPah",
          source: "textedit",
        }),
      });
      expect([403, 429]).toContain(res.status);
      if (res.status === 403) {
        const data = await res.json();
        expect(data.error).toBe("ryo_voice_forbidden");
        expect(data.source).toBe("textedit");
      }
    });

    test("rejects ElevenLabs when source is omitted", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          text: "No source flag.",
          model: "elevenlabs",
        }),
      });
      expect([403, 429]).toContain(res.status);
      if (res.status === 403) {
        const data = await res.json();
        expect(data.error).toBe("ryo_voice_forbidden");
      }
    });

    test("allows OpenAI without ryo-chat source", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          text: "OpenAI is not a Ryo voice.",
          model: "openai",
          voice: "alloy",
        }),
      });
      expect([200, 429]).toContain(res.status);
    });
  });

  describe("Headers", () => {
    test("Rate limit headers", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Rate limit test.",
          source: RYO_CHAT_SPEECH_SOURCE,
        }),
      });
      expect([200, 429, 503]).toContain(res.status);
      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        expect(retryAfter).not.toBeNull();
        const limitHeader = res.headers.get("X-RateLimit-Limit");
        expect(limitHeader).not.toBeNull();
      }
    });

    test("CORS headers", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "CORS test.",
          model: "openai",
        }),
      });
      const allowOrigin = res.headers.get("Access-Control-Allow-Origin");
      expect(allowOrigin).toBe("http://localhost:3000");
    });
  });
});
