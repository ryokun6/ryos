import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { SavedPlace } from "@/apps/maps/utils/types";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";

export type { SavedPlace } from "@/apps/maps/utils/types";

const STORE_NAME = "ryos:maps:v1";
const STORE_VERSION = 2;
const RECENTS_LIMIT = 10;

interface MapsStoreState {
  home: SavedPlace | null;
  work: SavedPlace | null;
  favorites: SavedPlace[];
  recents: SavedPlace[];
  /**
   * The currently-open place in the info card. Persisted so the card
   * re-appears (and the pin is re-dropped) on the next session.
   */
  selectedPlace: SavedPlace | null;
  /** Last time the user mutated maps state (used by cloud sync conflict merge). */
  updatedAt: number;

  setHome: (place: SavedPlace | null) => void;
  setWork: (place: SavedPlace | null) => void;
  addFavorite: (place: SavedPlace) => void;
  removeFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
  recordRecent: (place: SavedPlace) => void;
  setSelectedPlace: (place: SavedPlace | null) => void;
  /**
   * Replace local maps state with merged data from cloud sync. Skips deletion
   * tracking and `updatedAt` bump because the snapshot itself is the source of
   * truth. Recents are intentionally device-local and are not part of the sync
   * payload.
   */
  replaceFromSync: (snapshot: {
    home: SavedPlace | null;
    work: SavedPlace | null;
    favorites: SavedPlace[];
  }) => void;
  /** Wipe all persisted Maps state. Not exposed in UI; useful for debugging. */
  clearAll: () => void;
}

export const useMapsStore = create<MapsStoreState>()(
  persist(
    (set, get) => ({
      home: null,
      work: null,
      favorites: [],
      recents: [],
      selectedPlace: null,
      updatedAt: 0,

      setHome: (place) => set({ home: place, updatedAt: Date.now() }),
      setWork: (place) => set({ work: place, updatedAt: Date.now() }),

      addFavorite: (place) =>
        set((state) => {
          const filtered = state.favorites.filter((p) => p.id !== place.id);
          useCloudSyncStore
            .getState()
            .clearDeletedKeys("mapsFavoriteIds", [place.id]);
          return {
            favorites: [place, ...filtered],
            updatedAt: Date.now(),
          };
        }),

      removeFavorite: (id) =>
        set((state) => {
          useCloudSyncStore.getState().markDeletedKeys("mapsFavoriteIds", [id]);
          return {
            favorites: state.favorites.filter((p) => p.id !== id),
            updatedAt: Date.now(),
          };
        }),

      isFavorite: (id) => get().favorites.some((p) => p.id === id),

      recordRecent: (place) =>
        set((state) => {
          const filtered = state.recents.filter((p) => p.id !== place.id);
          return {
            recents: [place, ...filtered].slice(0, RECENTS_LIMIT),
          };
        }),

      setSelectedPlace: (place) => set({ selectedPlace: place }),

      replaceFromSync: (snapshot) =>
        set({
          home: snapshot.home,
          work: snapshot.work,
          favorites: snapshot.favorites,
        }),

      clearAll: () =>
        set({
          home: null,
          work: null,
          favorites: [],
          recents: [],
          selectedPlace: null,
          updatedAt: Date.now(),
        }),
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        home: state.home,
        work: state.work,
        favorites: state.favorites,
        recents: state.recents,
        selectedPlace: state.selectedPlace,
        updatedAt: state.updatedAt,
      }),
      migrate: (persistedState, fromVersion) => {
        if (!persistedState || typeof persistedState !== "object") {
          return persistedState as MapsStoreState;
        }
        const persisted = persistedState as Partial<MapsStoreState>;
        if (fromVersion < 2 && typeof persisted.updatedAt !== "number") {
          return {
            ...persisted,
            updatedAt: 0,
          } as MapsStoreState;
        }
        return persisted as MapsStoreState;
      },
    }
  )
);
