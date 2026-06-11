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

export function useMediaLibraryStoreShallow<T>(
  selector: (state: ReturnType<typeof useMediaLibraryStore.getState>) => T
): T {
  return useStoreShallow(useMediaLibraryStore, selector);
}
