import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { SavedPlace } from "@/apps/maps/utils/types";

export type { SavedPlace } from "@/apps/maps/utils/types";

const STORE_NAME = "ryos:maps:v1";
const STORE_VERSION = 1;
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

  setHome: (place: SavedPlace | null) => void;
  setWork: (place: SavedPlace | null) => void;
  addFavorite: (place: SavedPlace) => void;
  removeFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
  recordRecent: (place: SavedPlace) => void;
  setSelectedPlace: (place: SavedPlace | null) => void;
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

      setHome: (place) => set({ home: place }),
      setWork: (place) => set({ work: place }),

      addFavorite: (place) =>
        set((state) => {
          const filtered = state.favorites.filter((p) => p.id !== place.id);
          return { favorites: [place, ...filtered] };
        }),

      removeFavorite: (id) =>
        set((state) => ({
          favorites: state.favorites.filter((p) => p.id !== id),
        })),

      isFavorite: (id) => get().favorites.some((p) => p.id === id),

      recordRecent: (place) =>
        set((state) => {
          const filtered = state.recents.filter((p) => p.id !== place.id);
          return { recents: [place, ...filtered].slice(0, RECENTS_LIMIT) };
        }),

      setSelectedPlace: (place) => set({ selectedPlace: place }),

      clearAll: () =>
        set({
          home: null,
          work: null,
          favorites: [],
          recents: [],
          selectedPlace: null,
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
      }),
    }
  )
);
