import { afterEach, describe, expect, test } from "bun:test";

import {
  createCachedIconObjectUrl,
  getIconRecoveryCandidates,
  normalizeSameOriginIconPath,
} from "../src/utils/icons";

const originalCaches = globalThis.caches;
const originalCreateObjectURL = URL.createObjectURL;

afterEach(() => {
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: originalCaches,
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: originalCreateObjectURL,
  });
});

describe("themed icon cache recovery", () => {
  test("normalizes same-origin icon paths and rejects non-icon paths", () => {
    expect(normalizeSameOriginIconPath("/icons/macosx/finder.png#hash")).toBe(
      "/icons/macosx/finder.png"
    );
    expect(normalizeSameOriginIconPath("/wallpapers/photos/aqua.jpg")).toBeNull();
    expect(normalizeSameOriginIconPath("https://cdn.example.com/icon.png")).toBeNull();
  });

  test("creates an object URL from a prefetched cache response", async () => {
    const matches: Array<{
      request: RequestInfo | URL;
      options?: CacheQueryOptions;
    }> = [];

    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: {
        match: async (
          request: RequestInfo | URL,
          options?: CacheQueryOptions
        ) => {
          matches.push({ request, options });
          return new Response("icon", {
            status: 200,
            headers: { "Content-Type": "image/png" },
          });
        },
      },
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: (blob: Blob) => `blob:test/${blob.size}`,
    });

    await expect(
      createCachedIconObjectUrl("/icons/macosx/finder.png?v=1")
    ).resolves.toBe("blob:test/4");
    expect(matches).toEqual([
      {
        request: "/icons/macosx/finder.png?v=1",
        options: { ignoreSearch: true },
      },
    ]);
  });

  test("returns null when a prefetched cache response is unavailable", async () => {
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: {
        match: async () => undefined,
      },
    });

    await expect(
      createCachedIconObjectUrl("/icons/macosx/missing.png")
    ).resolves.toBeNull();
  });

  test("tries the failed themed icon before the default theme fallback", () => {
    expect(
      getIconRecoveryCandidates("/icons/macosx/finder.png?old=1", "finder.png")
    ).toEqual([
      "/icons/macosx/finder.png?old=1",
      "/icons/default/finder.png",
    ]);
  });

  test("does not retry a failed default themed icon as a themed candidate", () => {
    expect(
      getIconRecoveryCandidates("/icons/default/finder.png", "finder.png")
    ).toEqual(["/icons/default/finder.png"]);
  });
});
