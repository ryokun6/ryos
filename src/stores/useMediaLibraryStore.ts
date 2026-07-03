/**
 * Music library facade (MediaCore Phase 3).
 *
 * Cross-app consumers (Karaoke / Winamp / MTV) read the shared music library
 * through this alias rather than reaching into the iPod app's store. The
 * physical storage (and therefore the Cloud Sync v2 `songs/*` wire format)
 * is unchanged. The video library stays separate in `useVideoStore` — music
 * and videos are never merged into one library surface.
 */
import {
  flushPendingLyricOffsetSave,
  getEffectiveTranslationLanguage,
  getIpodTracksForLibrary,
  useIpodStore,
} from "@/stores/useIpodStore";
import { useStoreShallow } from "./helpers";

export type { Track } from "@/shared/media/library";
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
