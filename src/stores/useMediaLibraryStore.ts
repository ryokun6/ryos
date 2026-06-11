import {
  flushPendingLyricOffsetSave,
  getEffectiveTranslationLanguage,
  getIpodTracksForLibrary,
  useIpodStore,
  type Track,
} from "@/stores/useIpodStore";
import { useStoreShallow } from "./helpers";

export type { Track } from "@/stores/useIpodStore";
export {
  flushPendingLyricOffsetSave,
  getEffectiveTranslationLanguage,
  getIpodTracksForLibrary,
};

export type MediaLibraryState = ReturnType<typeof useIpodStore.getState>;

export const useMediaLibraryStore = useIpodStore;

export function getMediaLibraryTracks(): Track[] {
  return useIpodStore.getState().tracks;
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
