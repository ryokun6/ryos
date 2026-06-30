import { afterEach, describe, expect, test } from "bun:test";
import { processTranslationSSE } from "../src/utils/chunkedStream";

const originalFetch = globalThis.fetch;

function makeSseResponse(events: unknown[]): Response {
  const body = events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("");
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("processTranslationSSE", () => {
  test("surfaces JSON error payloads without retrying", async () => {
    const calls: Array<{ url: string; body: string | undefined }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({
        url: String(input),
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      return new Response(
        JSON.stringify({ error: "rate_limit_exceeded", retryAfter: 60 }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }
      );
    }) as typeof fetch;

    await expect(
      processTranslationSSE("streamErr01", "Spanish")
    ).rejects.toThrow("rate_limit_exceeded");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("/api/songs/streamErr01");
  });

  test("surfaces SSE error events without retrying", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input) => {
      calls.push(String(input));
      return makeSseResponse([
        { type: "start", totalLines: 1 },
        { type: "error", error: "provider failed" },
      ]);
    }) as typeof fetch;

    await expect(
      processTranslationSSE("streamErr02", "Spanish")
    ).rejects.toThrow("provider failed");
    expect(calls).toHaveLength(1);
  });

  test("still resolves complete SSE responses", async () => {
    globalThis.fetch = (async () =>
      makeSseResponse([
        { type: "start", totalLines: 1 },
        {
          type: "complete",
          translations: ["hola"],
          totalLines: 1,
          success: true,
        },
      ])) as typeof fetch;

    await expect(
      processTranslationSSE("streamOk001", "Spanish")
    ).resolves.toEqual({ data: ["hola"], success: true });
  });
});
