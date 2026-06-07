import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  LyricsAlignment,
  KoreanDisplay,
  JapaneseFurigana,
  LyricsFont,
  RomanizationSettings,
  DisplayMode,
} from "@/types/lyrics";
import i18n from "@/lib/i18n";
import { createPlaybackSlice } from "./playbackSlice";
import { createLibrarySlice } from "./librarySlice";
import { createLyricsPrefsSlice } from "./lyricsPrefsSlice";
import { createServerSyncSlice } from "./serverSyncSlice";
import {
  CURRENT_IPOD_STORE_VERSION,
  initialIpodData,
  LYRICS_TRANSLATION_AUTO,
  type IpodData,
  type IpodState,
  type LibrarySource,
} from "./types";

export const useIpodStore = create<IpodState>()(
  persist(
    (set, get) => ({
      ...initialIpodData,
      ...createPlaybackSlice(set, get),
      ...createLibrarySlice(set, get),
      ...createLyricsPrefsSlice(set, get),
      ...createServerSyncSlice(set, get),
    }),
    {
      name: "ryos:ipod", // Unique name for localStorage persistence
      version: CURRENT_IPOD_STORE_VERSION, // Set the current version
      partialize: (state) => ({
        tracks: state.tracks,
        currentSongId: state.currentSongId,
        loopAll: state.loopAll,
        loopCurrent: state.loopCurrent,
        isShuffled: state.isShuffled,
        backlightTimeout: state.backlightTimeout,
        theme: state.theme,
        uiVariant: state.uiVariant,
        lcdFilterOn: state.lcdFilterOn,
        showLyrics: state.showLyrics,
        lyricsAlignment: state.lyricsAlignment,
        lyricsFont: state.lyricsFont,
        displayMode: state.displayMode,
        // NOTE: koreanDisplay and japaneseFurigana removed from persistence
        // They are deprecated and migrated to romanization settings
        romanization: state.romanization,
        lyricsTranslationLanguage: state.lyricsTranslationLanguage,
        isFullScreen: state.isFullScreen,
        libraryState: state.libraryState,
        lastKnownVersion: state.lastKnownVersion,
        // Apple Music: persist user choice, last-played track, and the
        // compact contextual queue id list. The library itself goes to
        // IndexedDB (see `appleMusicLibraryCache`) because it can easily
        // exceed localStorage's 5–10MB per-origin quota for users with
        // large libraries. The hook re-hydrates `appleMusicTracks` on mount.
        librarySource: state.librarySource,
        appleMusicCurrentSongId: state.appleMusicCurrentSongId,
        appleMusicPlaybackQueue: state.appleMusicPlaybackQueue,
        // Persist navigation breadcrumb so reopening the iPod returns the
        // user to the same menu (and cursor position) they left.
        ipodMenuBreadcrumb: state.ipodMenuBreadcrumb,
        ipodMenuMode: state.ipodMenuMode,
      }),
      migrate: (persistedState, version) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let state = persistedState as any;

        // Migrate liquid -> water (Liquid display mode removed, replaced by Water)
        if (state.displayMode === "liquid") {
          state.displayMode = "water";
        }

        // If the persisted version is older than the current version, update defaults
        if (version < CURRENT_IPOD_STORE_VERSION) {
          console.log(
            `Migrating iPod store from version ${version} to ${CURRENT_IPOD_STORE_VERSION}`
          );
          
          // Migrate old romanization settings to new unified format
          const oldJapaneseFurigana = state.japaneseFurigana as string | undefined;
          
          const romanization: RomanizationSettings = state.romanization ?? {
            enabled: true,
            japaneseFurigana: oldJapaneseFurigana === JapaneseFurigana.On || oldJapaneseFurigana === "on" || oldJapaneseFurigana === undefined,
            japaneseRomaji: false,
            korean: true,
            chinese: false,
            soramimi: false,
            soramamiTargetLanguage: "zh-TW",
            pronunciationOnly: false,
          };
          
          // Migrate old chineseSoramimi/soramimi to new unified soramimi + soramamiTargetLanguage
          if (state.romanization) {
            const oldChineseSoramimi = state.romanization.chineseSoramimi;
            const oldEnglishSoramimi = state.romanization.soramimi;
            
            // If either old flag was enabled, enable new soramimi and set appropriate target
            if (oldChineseSoramimi || oldEnglishSoramimi) {
              state.romanization.soramimi = true;
              // Prefer English if it was enabled, otherwise Chinese
              state.romanization.soramamiTargetLanguage = oldEnglishSoramimi ? "en" : "zh-TW";
            } else {
              state.romanization.soramimi = state.romanization.soramimi ?? false;
              state.romanization.soramamiTargetLanguage = state.romanization.soramamiTargetLanguage ?? "zh-TW";
            }
            // Remove old properties
            delete state.romanization.chineseSoramimi;
          }
          
          // Ensure existing romanization settings have pronunciationOnly
          if (state.romanization && state.romanization.pronunciationOnly === undefined) {
            state.romanization.pronunciationOnly = false;
          }

          // Turn on Korean romanization for all users upgrading to this version (new default)
          if (state.romanization && state.romanization.korean === false) {
            state.romanization.korean = true;
          }

          const shouldUpgradeLegacyDefaultLyricsFont =
            version < 31 &&
            (state.lyricsFont === undefined || state.lyricsFont === LyricsFont.Serif);

          // Migrate currentIndex to currentSongId (will be null, library will re-initialize)
          state = {
            ...state,
            tracks: [],
            currentSongId: null, // Reset - library will re-initialize
            isPlaying: false,
            isShuffled: state.isShuffled,
            showLyrics: state.showLyrics ?? true,
            lyricsAlignment: state.lyricsAlignment ?? LyricsAlignment.Alternating,
            lyricsFont: shouldUpgradeLegacyDefaultLyricsFont
              ? LyricsFont.SansSerif
              : state.lyricsFont ?? LyricsFont.GoldGlow,
            displayMode: state.displayMode ?? DisplayMode.Video,
            koreanDisplay: state.koreanDisplay ?? KoreanDisplay.Original,
            japaneseFurigana: state.japaneseFurigana ?? JapaneseFurigana.On,
            romanization,
            lyricsTranslationLanguage: state.lyricsTranslationLanguage ?? LYRICS_TRANSLATION_AUTO,
            libraryState: "uninitialized" as const,
            lastKnownVersion: state.lastKnownVersion ?? 0,
          };
        }

        return {
          tracks: state.tracks,
          currentSongId: state.currentSongId,
          loopAll: state.loopAll,
          loopCurrent: state.loopCurrent,
          isShuffled: state.isShuffled,
          backlightTimeout:
            state.backlightTimeout === "2s" ||
            state.backlightTimeout === "10s" ||
            state.backlightTimeout === "always-on" ||
            state.backlightTimeout === "off"
              ? state.backlightTimeout
              : "2s",
          theme: state.theme,
          uiVariant:
            state.uiVariant === "modern" || state.uiVariant === "classic"
              ? state.uiVariant
              : "modern",
          lcdFilterOn: state.lcdFilterOn,
          showLyrics: state.showLyrics,
          lyricsAlignment: state.lyricsAlignment,
          lyricsFont: state.lyricsFont,
          displayMode: state.displayMode ?? DisplayMode.Video,
          koreanDisplay: state.koreanDisplay,
          japaneseFurigana: state.japaneseFurigana,
          romanization: state.romanization ?? initialIpodData.romanization,
          lyricsTranslationLanguage: state.lyricsTranslationLanguage,
          isFullScreen: state.isFullScreen,
          libraryState: state.libraryState,
          librarySource:
            (state.librarySource as LibrarySource) ?? "youtube",
          appleMusicCurrentSongId: state.appleMusicCurrentSongId ?? null,
          ipodMenuBreadcrumb: Array.isArray(state.ipodMenuBreadcrumb)
            ? state.ipodMenuBreadcrumb
            : null,
          ipodMenuMode:
            typeof state.ipodMenuMode === "boolean"
              ? state.ipodMenuMode
              : null,
        } as IpodState;
      },
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            console.error("Error rehydrating iPod store:", error);
          } else if (state && state.libraryState === "uninitialized") {
            // Only auto-initialize if library state is uninitialized
            Promise.resolve(state.initializeLibrary()).catch((err) =>
              console.error("Initialization failed on rehydrate", err)
            );
          }
        };
      },
    }
  )
);

/**
 * Resolves the effective translation language.
 * If the stored value is "auto", returns the current ryOS locale language.
 * If null, returns null (meaning no translation / "Original").
 * Otherwise returns the stored language code.
 */
export function getEffectiveTranslationLanguage(storedValue: string | null): string | null {
  if (storedValue === LYRICS_TRANSLATION_AUTO) {
    return i18n.language;
  }
  return storedValue;
}

// ---------------------------------------------------------------------------
// HMR state preservation
//
// `partialize` deliberately excludes the Apple Music collections (they live in
// IndexedDB to escape localStorage's 5–10MB quota) along with a handful of
// transient runtime fields. That works fine for full page reloads — the
// `useAppleMusicLibrary` hook re-hydrates from IndexedDB on mount.
//
// Vite HMR is different: any edit to a file imported (transitively) by this
// store cascades invalidation through us, re-running `create()` with
// `initialIpodData` and wiping every non-`partialize`d field. The
// `useAppleMusicLibrary` subscriber will refill from IndexedDB on the next
// pass, but the user still sees a brief flash of empty library. Preserve the
// in-memory snapshot across HMR so the swap is invisible.
// ---------------------------------------------------------------------------
if (import.meta.hot) {
  const HMR_KEY = "ipodStoreSnapshot";
  const previousSnapshot = (
    import.meta.hot.data as { [HMR_KEY]?: Partial<IpodData> }
  )[HMR_KEY];
  if (previousSnapshot) {
    useIpodStore.setState(previousSnapshot);
  }
  import.meta.hot.dispose((data) => {
    const s = useIpodStore.getState();
    // Snapshot only data fields — not actions. The new module ships its own
    // action references; keeping the old ones would silently use stale
    // closures whenever the store implementation changes.
    const snapshot: Partial<IpodData> = {
      tracks: s.tracks,
      currentSongId: s.currentSongId,
      libraryState: s.libraryState,
      lastKnownVersion: s.lastKnownVersion,
      playbackHistory: s.playbackHistory,
      historyPosition: s.historyPosition,
      librarySource: s.librarySource,
      appleMusicTracks: s.appleMusicTracks,
      appleMusicPlaylists: s.appleMusicPlaylists,
      appleMusicPlaylistsLoadedAt: s.appleMusicPlaylistsLoadedAt,
      appleMusicPlaylistTracks: s.appleMusicPlaylistTracks,
      appleMusicPlaylistTracksLoadedAt: s.appleMusicPlaylistTracksLoadedAt,
      appleMusicPlaylistTracksLoading: {},
      appleMusicRecentlyAddedTracks: s.appleMusicRecentlyAddedTracks,
      appleMusicRecentlyAddedLoadedAt: s.appleMusicRecentlyAddedLoadedAt,
      appleMusicRecentlyAddedLoading: false,
      appleMusicFavoriteTracks: s.appleMusicFavoriteTracks,
      appleMusicFavoriteTracksLoadedAt: s.appleMusicFavoriteTracksLoadedAt,
      appleMusicFavoritesLoading: false,
      appleMusicCurrentSongId: s.appleMusicCurrentSongId,
      appleMusicPlaybackQueue: s.appleMusicPlaybackQueue,
      appleMusicLibraryLoadedAt: s.appleMusicLibraryLoadedAt,
      appleMusicLibraryError: s.appleMusicLibraryError,
      appleMusicStorefrontId: s.appleMusicStorefrontId,
      ipodMenuBreadcrumb: s.ipodMenuBreadcrumb,
      ipodMenuMode: s.ipodMenuMode,
    };
    (data as { [HMR_KEY]?: Partial<IpodData> })[HMR_KEY] = snapshot;
  });
}

export type {
  IpodState,
  IpodData,
  Track,
  LyricsSource,
  LibrarySource,
  AppleMusicPlaylist,
  AppleMusicPlayParams,
  AppleMusicKitNowPlaying,
  IpodBacklightTimeout,
  IpodChatContextTrack,
  IpodLibrarySelection,
} from "./types";

export {
  LYRICS_TRANSLATION_AUTO,
  IPOD_BACKLIGHT_TIMEOUT_OPTIONS,
  CURRENT_IPOD_STORE_VERSION,
  initialIpodData,
} from "./types";

export {
  preloadIpodData,
  appleMusicKitIdToLyricsSongId,
  isAppleMusicCollectionTrack,
  getIpodTracksForLibrary,
  getActiveIpodTracks,
  getActiveIpodCurrentSongId,
  getActiveIpodCurrentTrack,
  getIpodChatContextTrack,
  setActiveIpodCurrentSongId,
  navigateActiveIpodTrack,
} from "./shared";

export { flushPendingLyricOffsetSave } from "./serverSyncSlice";
