import { describe, expect, test, beforeEach, mock } from "bun:test";

const fetchMock = mock(() =>
  Promise.resolve(
    new Response(
      JSON.stringify({
        applets: [
          { id: "a", createdAt: 2 },
          { id: "b", createdAt: 1 },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  )
);

mock.module("@/utils/abortableFetch", () => ({
  abortableFetch: fetchMock,
}));

mock.module("@/utils/platform", () => ({
  getApiUrl: (path: string) => `http://localhost:3000${path}`,
}));

const {
  fetchAppletCatalog,
  invalidateAppletCatalog,
  __resetAppletCatalogForTests,
} = await import(
  "../../../src/apps/applet-viewer/utils/appletCatalog"
);

describe("fetchAppletCatalog", () => {
  beforeEach(() => {
    __resetAppletCatalogForTests();
    fetchMock.mockClear();
  });

  test("coalesces concurrent list fetches into one network call", async () => {
    const [a, b, c] = await Promise.all([
      fetchAppletCatalog(),
      fetchAppletCatalog(),
      fetchAppletCatalog(),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(a.map((item) => item.id)).toEqual(["a", "b"]);
  });

  test("serves TTL cache without refetching", async () => {
    await fetchAppletCatalog();
    fetchMock.mockClear();

    const cached = await fetchAppletCatalog();
    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(cached[0]?.id).toBe("a");
  });

  test("force bypasses cache and invalidate clears it", async () => {
    await fetchAppletCatalog();
    fetchMock.mockClear();

    invalidateAppletCatalog();
    await fetchAppletCatalog({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
