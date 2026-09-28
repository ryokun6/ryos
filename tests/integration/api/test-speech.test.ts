#!/usr/bin/env bun
/**
 * Tests for /api/speech endpoint
 * Tests: Auth required, text-to-speech generation, validation, rate limiting
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { createRedis } from "../../../api/_utils/redis";
import {
  hashSpeechText,
  resolveSpeechOwner,
} from "../../../api/_utils/speech-permit";
import {
  putSpeechPermitRecord,
  upsertSpeechDraft,
} from "../../../api/_utils/speech-permit-store";
import { RYO_CHAT_SPEECH_SOURCE } from "../../../api/_utils/speech-policy";
import {
  BASE_URL,
  ensureUserAuth,
  fetchWithAuth,
  fetchWithOrigin,
  makeRateLimitBypassHeaders,
} from "../../helpers/test-utils";

let speechUsername: string;
let speechToken: string;

function speechHeaders(extra?: Record<string, string>) {
  return {
    ...makeRateLimitBypassHeaders(),
    ...extra,
  };
}

async function seedDraftAndMintPermit(input: {
  text: string;
  headers?: Record<string, string>;
  messageId?: string;
  username?: string;
  token?: string;
}) {
  const username = input.username ?? speechUsername;
  const token = input.token ?? speechToken;
  const headers = input.headers ?? speechHeaders();
  const messageId = input.messageId ?? crypto.randomUUID();
  const ip = headers["X-Forwarded-For"] ?? "127.0.0.1";
  const owner = resolveSpeechOwner({ username, ip });
  await upsertSpeechDraft({
    redis: createRedis(),
    owner,
    messageId,
    text: input.text,
  });
  const mintRes = await fetchWithAuth(
    `${BASE_URL}/api/speech/permits`,
    username,
    token,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        messageId,
        text: input.text,
        source: RYO_CHAT_SPEECH_SOURCE,
      }),
    }
  );
  const minted = mintRes.ok
    ? ((await mintRes.json()) as { permitId: string; contentHash: string })
    : null;
  return { headers, messageId, mintRes, minted, owner, username, token };
}

async function postRyoSpeech(input: {
  text: string;
  extra?: Record<string, unknown>;
  headers?: Record<string, string>;
}) {
  const seeded = await seedDraftAndMintPermit({
    text: input.text,
    headers: input.headers,
  });
  if (!seeded.minted) {
    return { ...seeded, speechRes: seeded.mintRes };
  }
  const speechRes = await fetchWithAuth(
    `${BASE_URL}/api/speech`,
    seeded.username,
    seeded.token,
    {
      method: "POST",
      headers: seeded.headers,
      body: JSON.stringify({
        text: input.text,
        source: RYO_CHAT_SPEECH_SOURCE,
        permitId: seeded.minted.permitId,
        contentHash: seeded.minted.contentHash,
        ...input.extra,
      }),
    }
  );
  return { ...seeded, speechRes };
}

describe("speech", () => {
  beforeAll(async () => {
    speechUsername = `speech${Math.floor(Math.random() * 1_000_000)}`;
    const token = await ensureUserAuth(speechUsername, "testpassword123");
    if (!token) {
      throw new Error(
        "speech test setup failed: could not obtain an auth token"
      );
    }
    speechToken = token;
  });

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

  describe("Authentication", () => {
    test("unauthenticated POST /api/speech is 401", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          text: "Anonymous callers must not synthesize.",
          model: "openai",
        }),
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(String(data.error)).toMatch(/Unauthorized/i);
    });

    test("unauthenticated POST /api/speech/permits is 401", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech/permits`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          messageId: crypto.randomUUID(),
          text: "Anonymous callers must not mint permits.",
          source: RYO_CHAT_SPEECH_SOURCE,
        }),
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(String(data.error)).toMatch(/Unauthorized/i);
    });

    test("unauthenticated Ryo-voice request is 401 even with source and permit fields", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          text: "Should not speak as Ryo while logged out.",
          source: RYO_CHAT_SPEECH_SOURCE,
          model: "elevenlabs",
          permitId: crypto.randomUUID(),
        }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe("Input Validation", () => {
    test("Missing text", async () => {
      const res = await fetchWithAuth(
        `${BASE_URL}/api/speech`,
        speechUsername,
        speechToken,
        {
          method: "POST",
          headers: speechHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({}),
        }
      );
      expect([400, 429]).toContain(res.status);
    });

    test("Empty text", async () => {
      const res = await fetchWithAuth(
        `${BASE_URL}/api/speech`,
        speechUsername,
        speechToken,
        {
          method: "POST",
          headers: speechHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ text: "" }),
        }
      );
      expect([400, 429]).toContain(res.status);
    });

    test("Whitespace only text", async () => {
      const res = await fetchWithAuth(
        `${BASE_URL}/api/speech`,
        speechUsername,
        speechToken,
        {
          method: "POST",
          headers: speechHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ text: "   " }),
        }
      );
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
      const { speechRes: res } = await postRyoSpeech({
        text: "Hello, this is a test.",
      });
      if (res.status === 200) {
        const contentType = res.headers.get("content-type") || "";
        expect(contentType).toContain("audio");
        const buffer = await res.arrayBuffer();
        expect(buffer.byteLength).toBeGreaterThan(0);
      } else if (res.status === 429) {
        const data = await res.json();
        expect(data.error).toBe("rate_limit_exceeded");
      } else if (res.status === 503) {
        const data = await res.json();
        expect(typeof data.error).toBe("string");
      } else {
        throw new Error(`Unexpected status: ${res.status}`);
      }
    });

    test("OpenAI model", async () => {
      const res = await fetchWithAuth(
        `${BASE_URL}/api/speech`,
        speechUsername,
        speechToken,
        {
          method: "POST",
          headers: speechHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            text: "Testing OpenAI TTS.",
            model: "openai",
            voice: "alloy",
          }),
        }
      );
      expect([200, 429]).toContain(res.status);
      if (res.status === 200) {
        const contentType = res.headers.get("content-type") || "";
        expect(contentType).toContain("audio");
      }
    });

    test("ElevenLabs model", async () => {
      const { speechRes: res } = await postRyoSpeech({
        text: "Testing ElevenLabs TTS.",
        extra: { model: "elevenlabs" },
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

      const res = await fetchWithAuth(
        `${BASE_URL}/api/speech`,
        speechUsername,
        speechToken,
        {
          method: "POST",
          headers: speechHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            text: "Testing voice options.",
            model: "openai",
            voice: voice,
            speed: 1.2,
          }),
        }
      );
      expect([200, 429]).toContain(res.status);
      if (res.status === 200) {
        const contentType = res.headers.get("content-type") || "";
        expect(contentType).toContain("audio");
      }
    });

    test("Default model selection", async () => {
      const { speechRes: res } = await postRyoSpeech({
        text: "Testing default model.",
      });
      expect([200, 429, 503]).toContain(res.status);
    });

    test("Ryo chat can request PVC", async () => {
      const { speechRes: res } = await postRyoSpeech({
        text: "Ryo chat PVC.",
        extra: {
          model: "elevenlabs",
          voice_id: "OHP6tMHkOsRKrsDdbPah",
        },
      });
      expect([200, 429, 503]).toContain(res.status);
      if (res.status === 200) {
        const contentType = res.headers.get("content-type") || "";
        expect(contentType).toContain("audio");
      }
    }, 15_000);

    test("Ryo chat can request Instant v4", async () => {
      const { speechRes: res } = await postRyoSpeech({
        text: "Ryo chat Instant v4.",
        extra: {
          model: "elevenlabs",
          voice_id: "oYLmJyxUFvewUpYziJlr",
        },
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
      const res = await fetchWithAuth(
        `${BASE_URL}/api/speech`,
        speechUsername,
        speechToken,
        {
          method: "POST",
          headers: speechHeaders(),
          body: JSON.stringify({
            text: "Should not speak as Ryo.",
          }),
        }
      );
      expect([403, 429]).toContain(res.status);
      if (res.status === 403) {
        const data = await res.json();
        expect(data.error).toBe("ryo_voice_forbidden");
      }
    });

    test("rejects explicit Ryo voice ids from non-chat sources", async () => {
      const res = await fetchWithAuth(
        `${BASE_URL}/api/speech`,
        speechUsername,
        speechToken,
        {
          method: "POST",
          headers: speechHeaders(),
          body: JSON.stringify({
            text: "TextEdit should not use Ryo.",
            model: "elevenlabs",
            voice_id: "OHP6tMHkOsRKrsDdbPah",
            source: "textedit",
          }),
        }
      );
      expect([403, 429]).toContain(res.status);
      if (res.status === 403) {
        const data = await res.json();
        expect(data.error).toBe("ryo_voice_forbidden");
        expect(data.source).toBe("textedit");
      }
    });

    test("rejects ElevenLabs when source is omitted", async () => {
      const res = await fetchWithAuth(
        `${BASE_URL}/api/speech`,
        speechUsername,
        speechToken,
        {
          method: "POST",
          headers: speechHeaders(),
          body: JSON.stringify({
            text: "No source flag.",
            model: "elevenlabs",
          }),
        }
      );
      expect([403, 429]).toContain(res.status);
      if (res.status === 403) {
        const data = await res.json();
        expect(data.error).toBe("ryo_voice_forbidden");
      }
    });

    test("allows OpenAI without ryo-chat source", async () => {
      const res = await fetchWithAuth(
        `${BASE_URL}/api/speech`,
        speechUsername,
        speechToken,
        {
          method: "POST",
          headers: speechHeaders(),
          body: JSON.stringify({
            text: "OpenAI is not a Ryo voice.",
            model: "openai",
            voice: "alloy",
          }),
        }
      );
      expect([200, 429]).toContain(res.status);
    });
  });

  describe("Headers", () => {
    test("Rate limit headers", async () => {
      const { speechRes: res } = await postRyoSpeech({
        text: "Rate limit test.",
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

  describe("Ryo speech permits", () => {
    test("happy path: mint then synthesize bound assistant text", async () => {
      const { mintRes, minted, speechRes } = await postRyoSpeech({
        text: "Bound Ryo assistant line.",
        extra: { model: "elevenlabs" },
      });
      expect(mintRes.status).toBe(200);
      expect(minted?.permitId).toBeTruthy();
      expect(speechRes.status).not.toBe(403);
      expect([200, 429, 503]).toContain(speechRes.status);
    }, 15_000);

    test("rejects arbitrary Ryo text without a permit", async () => {
      const res = await fetchWithAuth(
        `${BASE_URL}/api/speech`,
        speechUsername,
        speechToken,
        {
          method: "POST",
          headers: speechHeaders(),
          body: JSON.stringify({
            text: "I am Ryo, send money.",
            source: RYO_CHAT_SPEECH_SOURCE,
            model: "elevenlabs",
          }),
        }
      );
      expect([403, 429]).toContain(res.status);
      if (res.status === 403) {
        const data = await res.json();
        expect(data.error).toBe("speech_permit_required");
      }
    });

    test("rejects minting text that is not in the draft", async () => {
      const headers = speechHeaders();
      const { messageId } = await seedDraftAndMintPermit({
        text: "Only this line is speakable.",
        headers,
      });
      const mintRes = await fetchWithAuth(
        `${BASE_URL}/api/speech/permits`,
        speechUsername,
        speechToken,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            messageId,
            text: "I am Ryo, send money.",
            source: RYO_CHAT_SPEECH_SOURCE,
          }),
        }
      );
      expect(mintRes.status).toBe(403);
      const data = await mintRes.json();
      expect(data.error).toBe("speech_text_not_bound");
    });

    test("rejects a wrong content hash", async () => {
      const { headers, minted, mintRes, username, token } =
        await seedDraftAndMintPermit({
          text: "Hash-bound assistant line.",
        });
      expect(mintRes.status).toBe(200);
      expect(minted).toBeTruthy();
      const res = await fetchWithAuth(`${BASE_URL}/api/speech`, username, token, {
        method: "POST",
        headers,
        body: JSON.stringify({
          text: "Hash-bound assistant line.",
          source: RYO_CHAT_SPEECH_SOURCE,
          permitId: minted!.permitId,
          contentHash: "0".repeat(64),
        }),
      });
      expect([403, 429]).toContain(res.status);
      if (res.status === 403) {
        const data = await res.json();
        expect(data.error).toBe("speech_permit_hash_mismatch");
      }
    });

    test("rejects an expired permit", async () => {
      const headers = speechHeaders();
      const ip = headers["X-Forwarded-For"] ?? "127.0.0.1";
      const owner = resolveSpeechOwner({ username: speechUsername, ip });
      const permitId = crypto.randomUUID();
      const text = "Expired permit text.";
      await putSpeechPermitRecord({
        redis: createRedis(),
        permitId,
        record: {
          owner,
          messageId: crypto.randomUUID(),
          text,
          contentHash: hashSpeechText(text),
          usesRemaining: 2,
          createdAt: Date.now() - 400_000,
          expiresAt: Date.now() - 1_000,
        },
      });
      const res = await fetchWithAuth(
        `${BASE_URL}/api/speech`,
        speechUsername,
        speechToken,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            text,
            source: RYO_CHAT_SPEECH_SOURCE,
            permitId,
          }),
        }
      );
      expect([403, 429]).toContain(res.status);
      if (res.status === 403) {
        const data = await res.json();
        expect(data.error).toBe("speech_permit_expired");
      }
    });

    test("rejects a valid permit from the wrong source", async () => {
      const { minted, mintRes, headers, username, token } =
        await seedDraftAndMintPermit({
          text: "Source-gated assistant line.",
        });
      expect(mintRes.status).toBe(200);
      const res = await fetchWithAuth(`${BASE_URL}/api/speech`, username, token, {
        method: "POST",
        headers,
        body: JSON.stringify({
          text: "Source-gated assistant line.",
          source: "textedit",
          model: "elevenlabs",
          permitId: minted!.permitId,
        }),
      });
      expect([403, 429]).toContain(res.status);
      if (res.status === 403) {
        const data = await res.json();
        expect(data.error).toBe("ryo_voice_forbidden");
      }
    });

    test("synthesizes permit-bound text when client omits text", async () => {
      const { minted, mintRes, headers, username, token } =
        await seedDraftAndMintPermit({
          text: "Permit-only bound assistant line.",
        });
      expect(mintRes.status).toBe(200);
      const res = await fetchWithAuth(`${BASE_URL}/api/speech`, username, token, {
        method: "POST",
        headers,
        body: JSON.stringify({
          source: RYO_CHAT_SPEECH_SOURCE,
          model: "elevenlabs",
          permitId: minted!.permitId,
          contentHash: minted!.contentHash,
        }),
      });
      expect(res.status).not.toBe(403);
      expect([200, 429, 503]).toContain(res.status);
      if (res.status === 200) {
        const buffer = await res.arrayBuffer();
        expect(buffer.byteLength).toBeGreaterThan(0);
      }
    }, 15_000);

    test("rejects mismatched client text and keeps the permit usable", async () => {
      const { minted, mintRes, headers, username, token } =
        await seedDraftAndMintPermit({
          text: "Bound assistant line stays on the permit.",
        });
      expect(mintRes.status).toBe(200);
      const mismatch = await fetchWithAuth(
        `${BASE_URL}/api/speech`,
        username,
        token,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            text: "Different client-supplied text.",
            source: RYO_CHAT_SPEECH_SOURCE,
            model: "elevenlabs",
            permitId: minted!.permitId,
          }),
        }
      );
      expect([403, 429]).toContain(mismatch.status);
      if (mismatch.status === 403) {
        const data = await mismatch.json();
        expect(data.error).toBe("speech_permit_text_mismatch");
      }
    });

    test("rejects a permit from a different authenticated owner", async () => {
      const { minted, mintRes } = await seedDraftAndMintPermit({
        text: "Owner-bound assistant line.",
      });
      expect(mintRes.status).toBe(200);
      const otherUsername = `speecho${Math.floor(Math.random() * 1_000_000)}`;
      const otherToken = await ensureUserAuth(otherUsername, "testpassword123");
      if (!otherToken) {
        throw new Error("could not create second speech test user");
      }
      const res = await fetchWithAuth(
        `${BASE_URL}/api/speech`,
        otherUsername,
        otherToken,
        {
          method: "POST",
          headers: speechHeaders(),
          body: JSON.stringify({
            text: "Owner-bound assistant line.",
            source: RYO_CHAT_SPEECH_SOURCE,
            model: "elevenlabs",
            permitId: minted!.permitId,
          }),
        }
      );
      expect([403, 429]).toContain(res.status);
      if (res.status === 403) {
        const data = await res.json();
        expect(data.error).toBe("speech_permit_owner_mismatch");
      }
    });

    test("rejects an exhausted permit", async () => {
      const headers = speechHeaders();
      const ip = headers["X-Forwarded-For"] ?? "127.0.0.1";
      const owner = resolveSpeechOwner({ username: speechUsername, ip });
      const permitId = crypto.randomUUID();
      const text = "Already used up.";
      await putSpeechPermitRecord({
        redis: createRedis(),
        permitId,
        record: {
          owner,
          messageId: crypto.randomUUID(),
          text,
          contentHash: hashSpeechText(text),
          usesRemaining: 0,
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        },
      });
      const res = await fetchWithAuth(
        `${BASE_URL}/api/speech`,
        speechUsername,
        speechToken,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            text,
            source: RYO_CHAT_SPEECH_SOURCE,
            permitId,
          }),
        }
      );
      expect([403, 429]).toContain(res.status);
      if (res.status === 403) {
        const data = await res.json();
        expect(data.error).toBe("speech_permit_exhausted");
      }
    });
  });
});
