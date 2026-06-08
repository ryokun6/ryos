import type { Track } from "@/stores/useMediaLibraryStore";
import type { Video } from "@/stores/useVideoStore";
import { resolveMediaCoverUrl } from "@/utils/coverArt";
import type { ExtendedDisplayFileItem } from "@/apps/finder/utils/fileSystemHelpers";

export const VIRTUAL_UNKNOWN_ARTIST = "Unknown Artist";
export type VirtualMediaRoot = "/Music" | "/Videos";

export function collectArtistFolderNames(
  items: ReadonlyArray<{ artist?: string }>
): string[] {
  return Array.from(
    items.reduce((artists, item) => {
      if (item.artist) artists.add(item.artist);
      return artists;
    }, new Set<string>())
  );
}

export function hasItemsMissingArtist(
  items: ReadonlyArray<{ artist?: string }>
): boolean {
  return items.some((item) => !item.artist);
}

export function parseArtistFolderSegment(
  root: VirtualMediaRoot,
  currentPath: string
): string | null {
  const prefix = `${root}/`;
  if (!currentPath.startsWith(prefix)) return null;
  return decodeURIComponent(currentPath.replace(prefix, ""));
}

export function filterItemsForArtistFolder<T extends { artist?: string }>(
  items: ReadonlyArray<T>,
  artistName: string,
  unknownArtistLabel: string = VIRTUAL_UNKNOWN_ARTIST
): T[] {
  return items.filter((item) =>
    artistName === unknownArtistLabel ? !item.artist : item.artist === artistName
  );
}

export function buildArtistRootFolders(
  root: VirtualMediaRoot,
  items: ReadonlyArray<{ artist?: string }>,
  unknownArtistLabel: string = VIRTUAL_UNKNOWN_ARTIST
): ExtendedDisplayFileItem[] {
  const folders = collectArtistFolderNames(items).map((artist) => ({
    name: artist,
    isDirectory: true,
    path: `${root}/${encodeURIComponent(artist)}`,
    icon: "/icons/directory.png",
    type: "directory-virtual",
  }));

  if (hasItemsMissingArtist(items)) {
    folders.push({
      name: unknownArtistLabel,
      isDirectory: true,
      path: `${root}/${unknownArtistLabel}`,
      icon: "/icons/directory.png",
      type: "directory-virtual",
    });
  }

  return folders;
}

export function buildMusicArtistRoot(
  tracks: ReadonlyArray<Track>
): ExtendedDisplayFileItem[] {
  return buildArtistRootFolders("/Music", tracks);
}

export function buildMusicArtistFolder(
  tracks: ReadonlyArray<Track>,
  currentPath: string
): ExtendedDisplayFileItem[] {
  const artistName = parseArtistFolderSegment("/Music", currentPath);
  if (!artistName) return [];

  return filterItemsForArtistFolder(tracks, artistName).map((track) => ({
    name: `${track.title}.mp3`,
    isDirectory: false,
    path: `/Music/${track.id}`,
    icon: "/icons/sound.png",
    appId: "ipod",
    type: "Music",
    data: { songId: track.id },
    contentUrl: resolveMediaCoverUrl(track, { kugouSize: 100 }) ?? undefined,
  }));
}

export function buildVideosArtistRoot(
  videos: ReadonlyArray<Video>
): ExtendedDisplayFileItem[] {
  return buildArtistRootFolders("/Videos", videos);
}

export function buildVideosArtistFolder(
  videos: ReadonlyArray<Video>,
  currentPath: string
): ExtendedDisplayFileItem[] {
  const artistName = parseArtistFolderSegment("/Videos", currentPath);
  if (!artistName) return [];

  return filterItemsForArtistFolder(videos, artistName).map((video) => ({
    name: `${video.title}.mov`,
    isDirectory: false,
    path: `/Videos/${video.id}`,
    icon: "/icons/video-tape.png",
    appId: "videos",
    type: "Video",
    data: { videoId: video.id },
  }));
}

export type VirtualMediaListResult =
  | { kind: "root" | "artist"; items: ExtendedDisplayFileItem[] }
  | null;

export function listVirtualMusicOrVideosPath(
  currentPath: string,
  tracks: ReadonlyArray<Track>,
  videos: ReadonlyArray<Video>
): VirtualMediaListResult {
  if (currentPath === "/Music") {
    return { kind: "root", items: buildMusicArtistRoot(tracks) };
  }
  if (currentPath.startsWith("/Music/")) {
    return { kind: "artist", items: buildMusicArtistFolder(tracks, currentPath) };
  }
  if (currentPath === "/Videos") {
    return { kind: "root", items: buildVideosArtistRoot(videos) };
  }
  if (currentPath.startsWith("/Videos/")) {
    return { kind: "artist", items: buildVideosArtistFolder(videos, currentPath) };
  }
  return null;
}
