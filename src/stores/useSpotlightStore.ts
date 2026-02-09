import { create } from "zustand";

interface SpotlightState {
  isOpen: boolean;
  query: string;
  selectedIndex: number;
  setOpen: (v: boolean) => void;
  setQuery: (q: string) => void;
  setSelectedIndex: (i: number) => void;
  toggle: () => void;
  reset: () => void;
}

const createSpotlightStore = () =>
  create<SpotlightState>((set) => ({
    isOpen: false,
    query: "",
    selectedIndex: 0,
    setOpen: (v) => set({ isOpen: v }),
    setQuery: (q) => set({ query: q, selectedIndex: 0 }),
    setSelectedIndex: (i) => set({ selectedIndex: i }),
    toggle: () =>
      set((state) => {
        if (state.isOpen) {
          // Closing — reset
          return { isOpen: false, query: "", selectedIndex: 0 };
        }
        return { isOpen: true };
      }),
    reset: () => set({ isOpen: false, query: "", selectedIndex: 0 }),
  }));

// Preserve store across Vite HMR
let useSpotlightStore = createSpotlightStore();
if (import.meta.hot) {
  const data = import.meta.hot.data as {
    useSpotlightStore?: typeof useSpotlightStore;
  };
  if (data.useSpotlightStore) {
    useSpotlightStore = data.useSpotlightStore;
  } else {
    data.useSpotlightStore = useSpotlightStore;
  }
}
export { useSpotlightStore };
