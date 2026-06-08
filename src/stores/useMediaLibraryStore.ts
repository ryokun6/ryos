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

export function getMediaLibraryTracks(): Track[] {
  return useIpodStore.getState().tracks;
}
