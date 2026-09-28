import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  isRetryableSpeechPermitMintFailure,
  mintRyoSpeechPermit,
} from "../../../src/utils/speechPermitClient";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("speech permit client", () => {
  test("retries 404 and speech_text_not_bound, not other 403s", () => {
    expect(isRetryableSpeechPermitMintFailure(404)).toBe(true);
    expect(
      isRetryableSpeechPermitMintFailure(403, "speech_text_not_bound")
    ).toBe(true);
    expect(
      isRetryableSpeechPermitMintFailure(403, "speech_permit_hash_mismatch")
    ).toBe(false);
    expect(isRetryableSpeechPermitMintFailure(403, "ryo_voice_forbidden")).toBe(
      false
    );
    expect(isRetryableSpeechPermitMintFailure(401)).toBe(false);
  });

  test("retries while the streaming draft is still catching up", async () => {
    const calls: string[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      // Ignore leftover snapshot/auth/happy-dom fetches from earlier suites
      // in the shared bun:test process. Do not return 200 {} — that poisons
      // loadDefaultFiles' module cache and blanks later Books tests.
      if (!url.includes("/api/speech/permits")) {
        return originalFetch(input, init);
      }
      const attempt = calls.length;
      calls.push("mint");
      if (attempt === 0) {
        return new Response(JSON.stringify({ error: "speech_source_not_found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (attempt === 1) {
        return new Response(JSON.stringify({ error: "speech_text_not_bound" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          permitId: "permit-ready",
          contentHash: "a".repeat(64),
          messageId: "msg-1",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    const minted = await mintRyoSpeechPermit({
      messageId: "msg-1",
      text: "Hello from Ryo.",
    });
    expect(minted).toEqual({
      permitId: "permit-ready",
      contentHash: "a".repeat(64),
      messageId: "msg-1",
    });
    expect(calls).toHaveLength(3);
  });

  test("does not retry a forbidden-source mint", async () => {
    let calls = 0;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).includes("/api/speech/permits")) {
        return originalFetch(input, init);
      }
      calls += 1;
      return new Response(JSON.stringify({ error: "ryo_voice_forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const minted = await mintRyoSpeechPermit({
      messageId: "msg-1",
      text: "Hello from Ryo.",
    });
    expect(minted).toBeNull();
    expect(calls).toBe(1);
  });
});
