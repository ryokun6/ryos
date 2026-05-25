import { describe, expect, test } from "bun:test";
import type { AppleMusicPlaylist } from "../src/stores/useIpodStore";
import {
  getAppleMusicPlaylistIdFromMenuTitle,
  getAppleMusicPlaylistMenuTitle,
  resolveAppleMusicPlaylistMenu,
} from "../src/apps/ipod/utils/appleMusicPlaylistMenu";

const playlists: AppleMusicPlaylist[] = [
  { id: "p-ipod", name: "iPod", trackCount: 2 },
  { id: "p-road-trip", name: "Road Trip", trackCount: 12 },
];

describe("Apple Music playlist menu titles", () => {
  test("uses an opaque playlist id title instead of the visible playlist name", () => {
    const title = getAppleMusicPlaylistMenuTitle("p-ipod");

    expect(title).not.toBe("iPod");
    expect(getAppleMusicPlaylistIdFromMenuTitle(title)).toBe("p-ipod");
  });

  test("resolves a playlist named iPod without confusing it for the root menu", () => {
    const playlist = resolveAppleMusicPlaylistMenu(
      {
        title: getAppleMusicPlaylistMenuTitle("p-ipod"),
        displayTitle: "iPod",
        modernMediaList: true,
      },
      playlists
    );

    expect(playlist?.id).toBe("p-ipod");
  });

  test("keeps legacy root breadcrumb titles from resolving as playlists", () => {
    const playlist = resolveAppleMusicPlaylistMenu(
      { title: "iPod", modernMediaList: false },
      playlists
    );

    expect(playlist).toBeNull();
  });

  test("supports legacy playlist breadcrumbs that stored the visible name", () => {
    const playlist = resolveAppleMusicPlaylistMenu(
      { title: "iPod", modernMediaList: true },
      playlists
    );

    expect(playlist?.id).toBe("p-ipod");
  });
});
