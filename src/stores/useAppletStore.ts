import { create } from "zustand";
import { createPersistedStore, type PersistedStoreMeta } from "./persistAdapter";

interface WindowDimensions {
  width: number;
  height: number;
}

interface AppletStoreState extends PersistedStoreMeta {
  appletWindowSizes: Record<string, WindowDimensions>;
  setAppletWindowSize: (path: string, dimensions: WindowDimensions) => void;
  getAppletWindowSize: (path: string) => WindowDimensions | undefined;
}

const STORE_NAME = "applet-storage";
const STORE_VERSION = 1;

export const useAppletStore = create<AppletStoreState>()(
  createPersistedStore(
    (set, get) => ({
      appletWindowSizes: {},
      _updatedAt: Date.now(),
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
            _updatedAt: Date.now(),
          };
        });
      },
      getAppletWindowSize: (path: string) => {
        return get().appletWindowSizes[path];
      },
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      partialize: (state) => ({
        appletWindowSizes: state.appletWindowSizes,
        _updatedAt: state._updatedAt,
      }),
    }
  )
);
