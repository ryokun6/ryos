import { afterEach, describe, expect, test } from "bun:test";
import { getDocsBaseUrl } from "../../../src/utils/runtimeConfig";

const originalRuntimeConfig = (globalThis as { window?: Window & { __RYOS_RUNTIME_CONFIG__?: unknown } }).window
  ? { ...(window as Window & { __RYOS_RUNTIME_CONFIG__?: Record<string, unknown> }).__RYOS_RUNTIME_CONFIG__ }
  : undefined;

afterEach(() => {
  if (typeof window === "undefined") return;
  const win = window as Window & { __RYOS_RUNTIME_CONFIG__?: Record<string, unknown> };
  if (originalRuntimeConfig === undefined) {
    delete win.__RYOS_RUNTIME_CONFIG__;
  } else {
    win.__RYOS_RUNTIME_CONFIG__ = originalRuntimeConfig;
  }
});

describe("client getDocsBaseUrl", () => {
  test("preserves /docs path from runtime docsBaseUrl (not origin-only)", () => {
    if (typeof window === "undefined") return;

    (window as Window & { __RYOS_RUNTIME_CONFIG__?: Record<string, unknown> }).__RYOS_RUNTIME_CONFIG__ =
      {
        appPublicOrigin: "https://coolify.example.com",
        docsBaseUrl: "https://coolify.example.com/docs",
      };

    expect(getDocsBaseUrl()).toBe("https://coolify.example.com/docs");
    // Help dialog builds `${base}/${appId}` — must not become app route /ipod
    expect(`${getDocsBaseUrl()}/ipod`).toBe("https://coolify.example.com/docs/ipod");
  });

  test("falls back to app origin + /docs when docsBaseUrl unset", () => {
    if (typeof window === "undefined") return;

    (window as Window & { __RYOS_RUNTIME_CONFIG__?: Record<string, unknown> }).__RYOS_RUNTIME_CONFIG__ =
      {
        appPublicOrigin: "https://coolify.example.com",
      };

    expect(getDocsBaseUrl()).toBe("https://coolify.example.com/docs");
  });
});
