import type { AppleMusicPlaylist } from "@/stores/useIpodStore";
import type { MenuHistoryEntry } from "../types";

const APPLE_MUSIC_PLAYLIST_MENU_TITLE_PREFIX = "appleMusicPlaylist:";

export function getAppleMusicPlaylistMenuTitle(playlistId: string): string {
  return `${APPLE_MUSIC_PLAYLIST_MENU_TITLE_PREFIX}${playlistId}`;
}

export function getAppleMusicPlaylistIdFromMenuTitle(
  title: string
): string | null {
  return title.startsWith(APPLE_MUSIC_PLAYLIST_MENU_TITLE_PREFIX)
    ? title.slice(APPLE_MUSIC_PLAYLIST_MENU_TITLE_PREFIX.length)
    : null;
}

export function resolveAppleMusicPlaylistMenu(
  menu: Pick<
    MenuHistoryEntry,
    "kind" | "id" | "title" | "displayTitle" | "modernMediaList"
  >,
  playlists: AppleMusicPlaylist[]
): AppleMusicPlaylist | null {
  if (menu.kind === "appleMusicPlaylist" && menu.id) {
    return playlists.find((playlist) => playlist.id === menu.id) ?? null;
  }
  if (menu.kind) {
    return null;
  }

  const playlistId = getAppleMusicPlaylistIdFromMenuTitle(menu.title);
  if (playlistId) {
    return playlists.find((playlist) => playlist.id === playlistId) ?? null;
  }

  if (!menu.modernMediaList) {
    return null;
  }

  const legacyName = menu.displayTitle ?? menu.title;
  return playlists.find((playlist) => playlist.name === legacyName) ?? null;
}
