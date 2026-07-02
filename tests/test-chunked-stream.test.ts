import { afterEach, describe, expect, test } from "bun:test";

const {
  processFuriganaSSE,
  processSoramimiSSE,
  processTranslationSSE,
} = await import("../src/utils/chunkedStream");

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockJsonFetch({
  status,
  body,
}: {
  status: number;
  body: unknown;
}): () => number {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;
  return () => calls;
}

describe("chunked stream terminal HTTP errors", () => {
  test("translation stream does not retry a JSON 401", async () => {
    const getCalls = mockJsonFetch({
      status: 401,
      body: { error: "Sign in to refresh cached translations" },
    });

    await expect(
      processTranslationSSE("apple:song", "ja", { force: true })
    ).rejects.toThrow("Sign in to refresh cached translations");
    expect(getCalls()).toBe(1);
  });

  test("furigana stream does not retry a JSON 403", async () => {
    const getCalls = mockJsonFetch({
      status: 403,
      body: { error: "You do not have permission to refresh furigana" },
    });

    await expect(
      processFuriganaSSE("apple:song", { force: true })
    ).rejects.toThrow("You do not have permission to refresh furigana");
    expect(getCalls()).toBe(1);
  });

  test("soramimi stream does not retry a terminal JSON error", async () => {
    const getCalls = mockJsonFetch({
      status: 200,
      body: { error: "Soramimi generation failed permanently" },
    });

    await expect(
      processSoramimiSSE("apple:song", { force: true })
    ).rejects.toThrow("Soramimi generation failed permanently");
    expect(getCalls()).toBe(1);
  });
});
