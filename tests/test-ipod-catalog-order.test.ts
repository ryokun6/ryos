import { describe, expect, test } from "bun:test";
import {
  sortTracksByCatalogOrder,
  type TrackCatalogSortKey,
} from "@/utils/ipodTrackOrdering";

function t(
  id: string,
  overrides: Partial<TrackCatalogSortKey> = {}
): TrackCatalogSortKey {
  return { id, ...overrides };
}

describe("sortTracksByCatalogOrder", () => {
  test("orders by createdAt descending (newest first)", () => {
    const sorted = sortTracksByCatalogOrder([
      t("aaa", { createdAt: 100 }),
      t("bbb", { createdAt: 300 }),
      t("ccc", { createdAt: 200 }),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["bbb", "ccc", "aaa"]);
  });

  test("places tracks without createdAt after dated tracks", () => {
    const sorted = sortTracksByCatalogOrder([
      t("legacy"),
      t("new", { createdAt: 50 }),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["new", "legacy"]);
  });

  test("uses importOrder when createdAt ties", () => {
    const sorted = sortTracksByCatalogOrder([
      t("b", { createdAt: 1, importOrder: 2 }),
      t("a", { createdAt: 1, importOrder: 1 }),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["a", "b"]);
  });

  test("breaks ties by id", () => {
    const sorted = sortTracksByCatalogOrder([
      t("z", { createdAt: 5 }),
      t("m", { createdAt: 5 }),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["m", "z"]);
  });
});
