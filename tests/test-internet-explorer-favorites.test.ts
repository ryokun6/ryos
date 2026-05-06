import { describe, expect, test } from "bun:test";
import {
  DEFAULT_FAVORITES,
  isDirectPassthrough,
  removeRemovedDefaultFavorites,
} from "../src/stores/useInternetExplorerStore";
import type { Favorite } from "../src/stores/useInternetExplorerStore";

const flattenFavorites = (favorites: Favorite[]): Favorite[] =>
  favorites.flatMap((favorite) => [
    favorite,
    ...(favorite.children ? flattenFavorites(favorite.children) : []),
  ]);

describe("Internet Explorer favorites", () => {
  test("does not include Baby Cursor in default browser favorites", () => {
    const favorites = flattenFavorites(DEFAULT_FAVORITES);

    expect(favorites.map((favorite) => favorite.title)).not.toContain(
      "Baby Cursor"
    );
    expect(favorites.map((favorite) => favorite.url)).not.toContain(
      "https://baby-cursor.ryo.lu"
    );
  });

  test("removes Baby Cursor from persisted browser favorites", () => {
    const favorites = removeRemovedDefaultFavorites([
      {
        title: "Tools",
        isDirectory: true,
        children: [
          {
            title: "Baby Cursor",
            url: "https://baby-cursor.ryo.lu",
            isDirectory: false,
          },
          {
            title: "HyperCards",
            url: "https://hcsimulator.com",
            isDirectory: false,
          },
        ],
      },
    ]);

    const flattened = flattenFavorites(favorites);
    expect(flattened.map((favorite) => favorite.title)).toEqual([
      "Tools",
      "HyperCards",
    ]);
  });

  test("does not direct-pass through the removed Baby Cursor domain", () => {
    expect(isDirectPassthrough("https://baby-cursor.ryo.lu")).toBe(false);
  });
});
