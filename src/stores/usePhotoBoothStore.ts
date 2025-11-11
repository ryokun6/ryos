import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface PhotoReference {
  filename: string;
  path: string;
  timestamp: number;
}

interface PhotoBoothStoreState {
  photos: PhotoReference[];
  setPhotos: (photos: PhotoReference[]) => void;
  addPhoto: (photo: PhotoReference) => void;
  addPhotos: (photos: PhotoReference[]) => void;
  clearPhotos: () => void;
}

const STORE_VERSION = 1;
const STORE_NAME = "zios:photo-booth";

export const usePhotoBoothStore = create<PhotoBoothStoreState>()(
  persist(
    (set, get) => ({
      photos: [],
      setPhotos: (photos) => set({ photos }),
      addPhoto: (photo) => set({ photos: [...get().photos, photo] }),
      addPhotos: (photos) => set({ photos: [...get().photos, ...photos] }),
      clearPhotos: () => set({ photos: [] }),
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        photos: state.photos,
      }),
      migrate: (persistedState, version) => {
        if (!persistedState || version < STORE_VERSION) {
          try {
            const saved = localStorage.getItem("photo-booth:photos");
            if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed)) {
                localStorage.removeItem("photo-booth:photos");
                return { photos: parsed } as Partial<PhotoBoothStoreState>;
              }
            }
          } catch (e) {
            console.warn("[PhotoBoothStore] Migration failed", e);
          }
        }
        return persistedState as Partial<PhotoBoothStoreState>;
      },
    }
  )
); 