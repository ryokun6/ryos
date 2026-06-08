import { useShallow } from "zustand/react/shallow";
import {
  flushPendingLyricOffsetSave,
  getEffectiveTranslationLanguage,
  getIpodTracksForLibrary,
  useIpodStore,
  type Track,
} from "@/stores/useIpodStore";

export type { Track } from "@/stores/useIpodStore";
export {
  flushPendingLyricOffsetSave,
  getEffectiveTranslationLanguage,
  getIpodTracksForLibrary,
};

export type MediaLibraryState = ReturnType<typeof useIpodStore.getState>;

export const useMediaLibraryStore = useIpodStore;

export function useMediaLibraryStoreShallow<T>(
  selector: (state: MediaLibraryState) => T
): T {
  return useIpodStore(useShallow(selector));
}

export function getMediaLibraryTracks(): Track[] {
  return useIpodStore.getState().tracks;
}
