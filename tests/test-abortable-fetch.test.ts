import { afterEach, describe, expect, test } from "bun:test";
import { apiRequestRaw } from "../src/api/core";
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

  test("does not retry thrown HTTP status errors", async () => {
    let attempts = 0;

    globalThis.fetch = (async () => {
      attempts += 1;
      return new Response("server error", {
        status: 500,
        statusText: "Internal Server Error",
      });
    }) as typeof fetch;

    await expect(
      abortableFetch("/server-error", {
        timeout: 1000,
      })
    ).rejects.toThrow("HTTP 500: Internal Server Error");
    expect(attempts).toBe(1);
  });

  test("does not retry mutating requests without explicit retry config", async () => {
    let attempts = 0;

    globalThis.fetch = (async (_input, init) => {
      attempts += 1;
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    }) as typeof fetch;

    await expect(
      abortableFetch("/mutating-timeout", {
        method: "POST",
        timeout: 5,
      })
    ).rejects.toThrow("Request timed out after 5ms");
    expect(attempts).toBe(1);
  });

  test("retries idempotent requests without explicit retry config", async () => {
    let attempts = 0;

    globalThis.fetch = (async (_input, init) => {
      attempts += 1;
      if (attempts === 1) {
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }

      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    const response = await abortableFetch("/idempotent-timeout", {
      timeout: 5,
    });

    expect(response.status).toBe(200);
    expect(attempts).toBe(2);
  });
});

describe("apiRequest retry defaults", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("retries timed-out GET requests by default", async () => {
    let attempts = 0;

    globalThis.fetch = (async (_input, init) => {
      attempts += 1;
      if (attempts === 1) {
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const response = await apiRequestRaw({ path: "/api/status", timeout: 5 });

    expect(response.status).toBe(200);
    expect(attempts).toBe(2);
  });

  test("does not retry timed-out mutating requests by default", async () => {
    let attempts = 0;

    globalThis.fetch = (async (_input, init) => {
      attempts += 1;
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    }) as typeof fetch;

    await expect(
      apiRequestRaw({ path: "/api/status", method: "POST", timeout: 5 })
    ).rejects.toThrow("Request timed out after 5ms");
    expect(attempts).toBe(1);
  });
});
