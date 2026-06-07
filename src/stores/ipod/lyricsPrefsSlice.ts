import {
  type LyricsAlignment,
  type LyricsFont,
  type RomanizationSettings,
  areRomanizationSettingsEqual,
} from "@/types/lyrics";
import type { FuriganaSegment } from "@/utils/romanization";
import { clearSongCachedData } from "@/api/songs";
import { emitCloudSyncDomainChange } from "@/utils/cloudSyncEvents";
import type { IpodGet, IpodLibrarySelection, IpodSet } from "./types";
import { getIpodTracksForLibrary } from "./shared";
import { debouncedSaveLyricOffset } from "./serverSyncSlice";

export function createLyricsPrefsSlice(set: IpodSet, get: IpodGet) {
  return {
    toggleLyrics: () => {
      set((state) => ({ showLyrics: !state.showLyrics }));
      emitCloudSyncDomainChange("settings");
    },
    refreshLyrics: () =>
      set((state) => ({
        lyricsRefetchTrigger: state.lyricsRefetchTrigger + 1,
        currentLyrics: null,
        currentFuriganaMap: null,
      })),
    clearLyricsCache: () => {
      const state = get();
      const currentTrack = state.getCurrentTrack();
      
      // Clear server-side cache for translations, furigana, and soramimi
      if (currentTrack?.id) {
        clearSongCachedData(currentTrack.id).catch((err) => {
          console.error("[iPod Store] Failed to clear server cache:", err);
        });
      }
      
      // Clear local state and trigger refetch
      set((s) => ({
        lyricsRefetchTrigger: s.lyricsRefetchTrigger + 1,
        lyricsCacheBustTrigger: s.lyricsCacheBustTrigger + 1,
        currentLyrics: null,
        currentFuriganaMap: null,
      }));
    },
    setCurrentFuriganaMap: (map: Record<string, FuriganaSegment[]> | null) =>
      set({ currentFuriganaMap: map }),
    adjustLyricOffset: (
      trackIndex: number,
      deltaMs: number,
      library: IpodLibrarySelection = "active"
    ) => {
      // Validate before calling set() to avoid unnecessary state updates
      const state = get();
      const resolvedLibrary =
        library === "active" ? state.librarySource : library;
      const sourceTracks = getIpodTracksForLibrary(state, library);
      if (
        trackIndex < 0 ||
        trackIndex >= sourceTracks.length ||
        Number.isNaN(deltaMs)
      ) {
        return;
      }

      const current = sourceTracks[trackIndex];
      const newOffset = (current.lyricOffset || 0) + deltaMs;

      if (resolvedLibrary === "appleMusic") {
        set((s) => ({
          appleMusicTracks: s.appleMusicTracks.map((track, i) =>
            i === trackIndex ? { ...track, lyricOffset: newOffset } : track
          ),
        }));
      } else {
        set((s) => ({
          tracks: s.tracks.map((track, i) =>
            i === trackIndex ? { ...track, lyricOffset: newOffset } : track
          ),
        }));
      }

      // Persist server-side. The endpoint accepts both YouTube (11-char)
      // and Apple Music (`am:<id>`) keys via the relaxed validator.
      debouncedSaveLyricOffset(current.id, newOffset);
    },
    setLyricOffset: (
      trackIndex: number,
      offsetMs: number,
      library: IpodLibrarySelection = "active"
    ) => {
      // Validate before calling set() to avoid unnecessary state updates
      const state = get();
      const resolvedLibrary =
        library === "active" ? state.librarySource : library;
      const sourceTracks = getIpodTracksForLibrary(state, library);
      if (
        trackIndex < 0 ||
        trackIndex >= sourceTracks.length ||
        Number.isNaN(offsetMs)
      ) {
        return;
      }

      const trackId = sourceTracks[trackIndex].id;

      if (resolvedLibrary === "appleMusic") {
        set((s) => ({
          appleMusicTracks: s.appleMusicTracks.map((track, i) =>
            i === trackIndex ? { ...track, lyricOffset: offsetMs } : track
          ),
        }));
      } else {
        set((s) => ({
          tracks: s.tracks.map((track, i) =>
            i === trackIndex ? { ...track, lyricOffset: offsetMs } : track
          ),
        }));
      }

      debouncedSaveLyricOffset(trackId, offsetMs);
    },
    setLyricsAlignment: (alignment: LyricsAlignment) => {
      if (get().lyricsAlignment === alignment) {
        return;
      }
      set({ lyricsAlignment: alignment });
      emitCloudSyncDomainChange("settings");
    },
    setLyricsFont: (font: LyricsFont) => {
      if (get().lyricsFont === font) {
        return;
      }
      set({ lyricsFont: font });
      emitCloudSyncDomainChange("settings");
    },
    setRomanization: (settings: Partial<RomanizationSettings>) => {
      const nextRomanization = { ...get().romanization, ...settings };
      if (areRomanizationSettingsEqual(get().romanization, nextRomanization)) {
        return;
      }
      set({ romanization: nextRomanization });
      emitCloudSyncDomainChange("settings");
    },
    toggleRomanization: () => {
      set((state) => ({
        romanization: { ...state.romanization, enabled: !state.romanization.enabled },
      }));
      emitCloudSyncDomainChange("settings");
    },
    setLyricsTranslationLanguage: (language: string | null) => {
      if (get().lyricsTranslationLanguage === language) {
        return;
      }
      set({
        lyricsTranslationLanguage: language,
      });
      emitCloudSyncDomainChange("settings");
    },
  };
}
