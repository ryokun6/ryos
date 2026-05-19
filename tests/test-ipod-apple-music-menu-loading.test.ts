import { describe, expect, test } from "bun:test";
import {
  appleMusicLoadingPlaceholderMenuItems,
  resolveAppleMusicMenuTitlebarLoading,
  shouldUseModernAppleMusicTitlebarLoading,
} from "../src/apps/ipod/utils/appleMusicMenuLoading";

describe("appleMusicMenuLoading", () => {
  test("shouldUseModernAppleMusicTitlebarLoading is true only for modern uiVariant", () => {
    expect(shouldUseModernAppleMusicTitlebarLoading("modern")).toBe(true);
    expect(shouldUseModernAppleMusicTitlebarLoading("classic")).toBe(false);
    expect(shouldUseModernAppleMusicTitlebarLoading(undefined)).toBe(true);
  });

  test("appleMusicLoadingPlaceholderMenuItems returns empty list for modern", () => {
    expect(
      appleMusicLoadingPlaceholderMenuItems("Loading…", true)
    ).toEqual([]);
  });

  test("appleMusicLoadingPlaceholderMenuItems returns loading row for classic", () => {
    const items = appleMusicLoadingPlaceholderMenuItems("Loading…", false);
    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe("Loading…");
    expect(items[0]?.isLoading).toBe(true);
  });

  test("resolveAppleMusicMenuTitlebarLoading matches playlist track fetch", () => {
    expect(
      resolveAppleMusicMenuTitlebarLoading({
        menuTitle: "Road Trip",
        recentlyAddedTitle: "Recently Added",
        favoriteSongsTitle: "Favorite Songs",
        radioTitle: "Radio",
        playlistsTitle: "Playlists",
        isRecentlyAddedLoading: false,
        isFavoritesLoading: false,
        isRadioLoading: false,
        isLibraryLoading: false,
        playlistTracksLoading: { "p:1": true },
        playlists: [{ id: "p:1", name: "Road Trip" }],
        playlistsCount: 3,
      })
    ).toBe(true);
  });

  test("resolveAppleMusicMenuTitlebarLoading ignores playlist loading for unrelated menus", () => {
    expect(
      resolveAppleMusicMenuTitlebarLoading({
        menuTitle: "Artists",
        recentlyAddedTitle: "Recently Added",
        favoriteSongsTitle: "Favorite Songs",
        radioTitle: "Radio",
        playlistsTitle: "Playlists",
        isRecentlyAddedLoading: false,
        isFavoritesLoading: false,
        isRadioLoading: false,
        isLibraryLoading: false,
        playlistTracksLoading: { "p:1": true },
        playlists: [{ id: "p:1", name: "Road Trip" }],
        playlistsCount: 3,
      })
    ).toBe(false);
  });
});
