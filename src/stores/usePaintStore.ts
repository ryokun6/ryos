import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface PaintStoreState {
  lastFilePath: string | null;
  setLastFilePath: (path: string | null) => void;
  reset: () => void;
}

const STORE_VERSION = 1;
const STORE_NAME = "zios:paint";

export const usePaintStore = create<PaintStoreState>()(
  persist(
    (set) => ({
      lastFilePath: null,
      setLastFilePath: (path) => set({ lastFilePath: path }),
      reset: () => set({ lastFilePath: null }),
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ lastFilePath: state.lastFilePath }),
      migrate: (persistedState, version) => {
        if (!persistedState || version < STORE_VERSION) {
          const legacy = localStorage.getItem("paint:lastFilePath");
          if (legacy) {
            localStorage.removeItem("paint:lastFilePath");
            return { lastFilePath: legacy } as Partial<PaintStoreState>;
          }
        }
        return persistedState as Partial<PaintStoreState>;
      },
    }
  )
); 