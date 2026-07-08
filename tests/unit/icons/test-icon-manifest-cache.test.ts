import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  fetchIconManifest,
  invalidateIconCache,
  type IconManifest,
} from "../../../src/utils/icons";

const originalFetch = globalThis.fetch;

function manifestResponse(generatedAt: string): Response {
  const manifest: IconManifest = {
    version: 1,
    generatedAt,
    themes: {
      default: ["finder.png"],
      macosx: ["finder.png"],
    },
  };
  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function installFetch(fetchImplementation: typeof globalThis.fetch): void {
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: fetchImplementation,
    writable: true,
  });
}

beforeEach(() => {
  invalidateIconCache();
});

afterEach(() => {
  invalidateIconCache();
  installFetch(originalFetch);
});

describe("icon manifest cache", () => {
  test("retries after a failed request and caches the successful result", async () => {
    let requests = 0;
    installFetch(async () => {
      requests += 1;
      return requests === 1
        ? new Response("unavailable", { status: 503 })
        : manifestResponse("fresh");
    });

    await expect(fetchIconManifest()).rejects.toThrow();
    expect((await fetchIconManifest()).generatedAt).toBe("fresh");
    expect((await fetchIconManifest()).generatedAt).toBe("fresh");
    expect(requests).toBe(2);
  });

  test("does not let an invalidated in-flight request restore stale data", async () => {
    let resolveStaleRequest: ((response: Response) => void) | undefined;
    let requests = 0;
    installFetch(() => {
      requests += 1;
      if (requests === 1) {
        return new Promise<Response>((resolve) => {
          resolveStaleRequest = resolve;
        });
      }
      return Promise.resolve(manifestResponse("fresh"));
    });

    const staleRequest = fetchIconManifest();
    invalidateIconCache();
    expect((await fetchIconManifest()).generatedAt).toBe("fresh");

    resolveStaleRequest?.(manifestResponse("stale"));
    expect((await staleRequest).generatedAt).toBe("stale");
    expect((await fetchIconManifest()).generatedAt).toBe("fresh");
    expect(requests).toBe(2);
  });

  test("rejects malformed manifest data instead of caching it", async () => {
    installFetch(async () =>
      new Response('{"version":1,"generatedAt":"bad","themes":{"default":42}}')
    );

    await expect(fetchIconManifest()).rejects.toThrow("Invalid icon manifest");
  });
});
