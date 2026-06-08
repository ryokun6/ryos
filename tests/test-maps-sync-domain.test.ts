import { describe, expect, test } from "bun:test";
import {
  mergeMapsSnapshots,
  normalizeMapsSnapshotData,
} from "../src/shared/domains/maps";

const oldDeletedAt = "2026-01-01T00:00:00.000Z";
const newDeletedAt = "2026-01-02T00:00:00.000Z";

function place(id: string, name = id) {
  return {
    id,
    name,
    subtitle: `${name} subtitle`,
    latitude: 1,
    longitude: 2,
    category: "restaurant",
    placeId: `apple-${id}`,
  };
}

describe("normalizeMapsSnapshotData", () => {
  test("defaults invalid snapshots", () => {
    expect(normalizeMapsSnapshotData(null)).toEqual({
      home: null,
      work: null,
      favorites: [],
      updatedAt: 0,
      deletedFavoriteIds: {},
    });
  });

  test("filters invalid places and preserves placeId", () => {
    expect(
      normalizeMapsSnapshotData({
        home: place("home"),
        work: { id: "bad", name: "Bad", latitude: "x", longitude: 2 },
        favorites: [place("fav"), place("fav"), { id: "bad" }],
        updatedAt: 10,
        deletedFavoriteIds: { gone: oldDeletedAt, invalid: 1 },
      })
    ).toEqual({
      home: place("home"),
      work: null,
      favorites: [place("fav")],
      updatedAt: 10,
      deletedFavoriteIds: { gone: oldDeletedAt },
    });
  });
});

describe("mergeMapsSnapshots", () => {
  test("uses newer home/work side and unions favorites", () => {
    const merged = mergeMapsSnapshots(
      {
        home: place("local-home"),
        work: null,
        favorites: [place("local-fav")],
        updatedAt: 20,
        deletedFavoriteIds: {},
      },
      {
        home: place("remote-home"),
        work: place("remote-work"),
        favorites: [place("remote-fav")],
        updatedAt: 10,
        deletedFavoriteIds: {},
      }
    );

    expect(merged.home?.id).toBe("local-home");
    expect(merged.work).toBeNull();
    expect(merged.favorites.map((favorite) => favorite.id).sort()).toEqual([
      "local-fav",
      "remote-fav",
    ]);
    expect(merged.updatedAt).toBe(20);
  });

  test("filters favorites deleted by newest tombstone", () => {
    const merged = mergeMapsSnapshots(
      {
        home: null,
        work: null,
        favorites: [place("gone")],
        updatedAt: 1,
        deletedFavoriteIds: { gone: oldDeletedAt },
      },
      {
        home: null,
        work: null,
        favorites: [place("gone")],
        updatedAt: 2,
        deletedFavoriteIds: { gone: newDeletedAt },
      }
    );

    expect(merged.favorites).toEqual([]);
    expect(merged.deletedFavoriteIds).toEqual({ gone: newDeletedAt });
  });
});
