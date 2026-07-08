import { describe, expect, test } from "bun:test";
import {
  getMenuMemoryKey,
  isNowPlayingSongMenu,
} from "../../../src/apps/ipod/utils/menuIdentity";

describe("iPod menu identity", () => {
  test("uses kind and id for stable memory keys", () => {
    expect(
      getMenuMemoryKey({
        kind: "appleMusicPlaylist",
        id: "p-ipod",
        title: "iPod",
      })
    ).toBe("appleMusicPlaylist:p-ipod");
  });

  test("falls back to title for legacy breadcrumbs", () => {
    expect(getMenuMemoryKey({ title: "iPod" })).toBe("iPod");
  });

  test("recognizes typed and legacy now-playing song menus", () => {
    expect(
      isNowPlayingSongMenu(
        { kind: "nowPlayingSong", title: "Renamed Track" },
        "__nowPlayingSong"
      )
    ).toBe(true);
    expect(
      isNowPlayingSongMenu(
        { title: "__nowPlayingSong" },
        "__nowPlayingSong"
      )
    ).toBe(true);
    expect(
      isNowPlayingSongMenu({ kind: "root", title: "iPod" }, "__nowPlayingSong")
    ).toBe(false);
  });
});
