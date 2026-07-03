/**
 * Unified media library API (MediaCore Phase 3).
 *
 * One read surface over the two physical libraries — songs in
 * `useIpodStore.tracks` and videos in `useVideoStore.videos`. The physical
 * stores (and therefore the Cloud Sync v2 `songs/*` and `videos/*` wire
 * format) are unchanged; this module is where cross-app consumers and the
 * AI `mediaControl` tool resolve library items without knowing which app
 * owns them.
 */
import {
  flushPendingLyricOffsetSave,
  getEffectiveTranslationLanguage,
  getIpodTracksForLibrary,
  useIpodStore,
} from "@/stores/useIpodStore";
import type { Track } from "@/shared/media/library";
import { useVideoStore } from "@/stores/useVideoStore";
import {
  trackToMediaItem,
  videoToMediaItem,
  type MediaItem,
  type MediaItemKind,
} from "@/shared/media/library";
import { useStoreShallow } from "./helpers";

export type { Track } from "@/shared/media/library";
export type { MediaItem, MediaItemKind } from "@/shared/media/library";
export {
  flushPendingLyricOffsetSave,
  getEffectiveTranslationLanguage,
  getIpodTracksForLibrary,
};

export type MediaLibraryState = ReturnType<typeof useIpodStore.getState>;

/**
 * The music library store. Karaoke / Winamp / MTV consumers read tracks
 * through this alias rather than reaching into the iPod app's store.
 */
export const useMediaLibraryStore = useIpodStore;

export function getMediaLibraryTracks(): Track[] {
  return useIpodStore.getState().tracks;
}

/** All library items of a kind — or the whole unified library. */
export function getMediaLibraryItems(kind?: MediaItemKind): MediaItem[] {
  const songs =
    kind === "video"
      ? []
      : useIpodStore.getState().tracks.map(trackToMediaItem);
  const videos =
    kind === "song"
      ? []
      : useVideoStore.getState().videos.map(videoToMediaItem);
  return [...songs, ...videos];
}

/** Resolve a library item by id across both libraries (songs win ties). */
export function findMediaLibraryItem(id: string): MediaItem | null {
  const track = useIpodStore.getState().tracks.find((t) => t.id === id);
  if (track) return trackToMediaItem(track);
  const video = useVideoStore.getState().videos.find((v) => v.id === id);
  if (video) return videoToMediaItem(video);
  return null;
}

/**
 * Shallow-equality selector hook for this store. Co-located with the store
 * (rather than a central helpers barrel) so importing it doesn't pull other
 * stores into the bundle.
 */
export function useMediaLibraryStoreShallow<T>(
  selector: (state: ReturnType<typeof useMediaLibraryStore.getState>) => T
): T {
  return useStoreShallow(useMediaLibraryStore, selector);
}
