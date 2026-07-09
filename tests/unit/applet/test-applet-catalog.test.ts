import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  __resetAppletCatalogForTests,
  fetchAppletCatalog,
  invalidateAppletCatalog,
} from "../../../src/apps/applet-viewer/utils/appletCatalog";

const originalFetch = globalThis.fetch;

type FetchStub = {
  calls: Array<{ url: string }>;
  restore: () => void;
};

function stubCatalogFetch(): FetchStub {
  const calls: Array<{ url: string }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    calls.push({ url });
    return new Response(
      JSON.stringify({
        applets: [
          { id: "a", createdAt: 2 },
          { id: "b", createdAt: 1 },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

describe("fetchAppletCatalog", () => {
  let stub: FetchStub;

  beforeEach(() => {
    __resetAppletCatalogForTests();
    stub = stubCatalogFetch();
  });

  afterEach(() => {
    stub.restore();
    __resetAppletCatalogForTests();
  });

  test("coalesces concurrent list fetches into one network call", async () => {
    const [a, b, c] = await Promise.all([
      fetchAppletCatalog(),
      fetchAppletCatalog(),
      fetchAppletCatalog(),
    ]);

    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]?.url).toContain("/api/share-applet?list=true");
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(a.map((item) => item.id)).toEqual(["a", "b"]);
  });

  test("serves TTL cache without refetching", async () => {
    await fetchAppletCatalog();
    const callsAfterFirst = stub.calls.length;

    const cached = await fetchAppletCatalog();
    expect(stub.calls).toHaveLength(callsAfterFirst);
    expect(cached[0]?.id).toBe("a");
  });

  test("force bypasses cache and invalidate clears it", async () => {
    await fetchAppletCatalog();
    const callsAfterFirst = stub.calls.length;

    invalidateAppletCatalog();
    await fetchAppletCatalog({ force: true });
    expect(stub.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});
