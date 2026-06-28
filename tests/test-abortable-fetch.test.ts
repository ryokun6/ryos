import { afterEach, describe, expect, test } from "bun:test";
import { abortableFetch } from "../src/utils/abortableFetch";

const originalFetch = globalThis.fetch;

describe("abortableFetch", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("retries timeout-triggered aborts when retry attempts remain", async () => {
    let attempts = 0;

    globalThis.fetch = (async (_input, init) => {
      attempts += 1;
      if (attempts === 1) {
        return await new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }

      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    const response = await abortableFetch("/slow-then-ok", {
      timeout: 5,
      retry: { maxAttempts: 2, initialDelayMs: 1 },
    });

    expect(response.status).toBe(200);
    expect(attempts).toBe(2);
  });

  test("does not retry external aborts", async () => {
    const controller = new AbortController();
    let attempts = 0;

    globalThis.fetch = (async (_input, init) => {
      attempts += 1;
      controller.abort();
      return await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    }) as typeof fetch;

    await expect(
      abortableFetch("/externally-aborted", {
        signal: controller.signal,
        timeout: 1000,
        retry: { maxAttempts: 2, initialDelayMs: 1 },
      })
    ).rejects.toThrow("Aborted");
    expect(attempts).toBe(1);
  });
});
