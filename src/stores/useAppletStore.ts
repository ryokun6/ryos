import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface WindowDimensions {
  width: number;
  height: number;
}

interface AppletStoreState {
  appletWindowSizes: Record<string, WindowDimensions>;
  setAppletWindowSize: (path: string, dimensions: WindowDimensions) => void;
  getAppletWindowSize: (path: string) => WindowDimensions | undefined;
}

export const useAppletStore = create<AppletStoreState>()(
  persist(
    (set, get) => ({
      appletWindowSizes: {},
      setAppletWindowSize: (path: string, dimensions: WindowDimensions) => {
        set((state) => {
          const prev = state.appletWindowSizes[path];
          // Avoid redundant updates if dimensions are unchanged
          if (
            prev &&
            prev.width === dimensions.width &&
            prev.height === dimensions.height
          ) {
            return state;
          }
          return {
            appletWindowSizes: {
              ...state.appletWindowSizes,
              [path]: dimensions,
            },
          };
        });
      },
      getAppletWindowSize: (path: string) => {
        return get().appletWindowSizes[path];
      },
    }),
    {
      name: "applet-storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
