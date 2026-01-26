import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ScaleOption = 1 | 1.5 | 2;

interface InfiniteMacStoreState {
  scale: ScaleOption;
  setScale: (scale: ScaleOption) => void;
}

export const useInfiniteMacStore = create<InfiniteMacStoreState>()(
  persist(
    (set) => ({
      scale: 1,
      setScale: (scale) => set({ scale }),
    }),
    {
      name: "ryos:infinite-mac",
      version: 1,
    }
  )
);
