import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AppId } from "@/config/appRegistry";
import { appIds } from "@/config/appIds";
import { AppManagerState, AppState } from "@/apps/base/types";
import { checkShaderPerformance } from "@/utils/performanceCheck";
import { ShaderType } from "@/components/shared/GalaxyBackground";
import { DisplayMode } from "@/utils/displayMode";
import { AIModel } from "@/types/aiModels";
import { ensureIndexedDBInitialized } from "@/utils/indexedDB";
// Re-export for backward compatibility
export type { AIModel } from "@/types/aiModels";

const getInitialState = (): AppManagerState => {
  const apps: { [appId: string]: AppState } = appIds.reduce(
    (acc: { [appId: string]: AppState }, id) => {
      acc[id] = { isOpen: false };
      return acc;
    },
    {} as { [appId: string]: AppState }
  );

  return {
    windowOrder: [],
    apps,
  };
};

interface AppStoreState extends AppManagerState {
  debugMode: boolean;
  setDebugMode: (enabled: boolean) => void;
  shaderEffectEnabled: boolean;
  setShaderEffectEnabled: (enabled: boolean) => void;
  selectedShaderType: ShaderType;
  setSelectedShaderType: (shaderType: ShaderType) => void;
  aiModel: AIModel;
  setAiModel: (model: AIModel) => void;
  terminalSoundsEnabled: boolean;
  setTerminalSoundsEnabled: (enabled: boolean) => void;
  uiSoundsEnabled: boolean;
  setUiSoundsEnabled: (enabled: boolean) => void;
  typingSynthEnabled: boolean;
  setTypingSynthEnabled: (enabled: boolean) => void;
  speechEnabled: boolean;
  setSpeechEnabled: (enabled: boolean) => void;
  speechVolume: number;
  setSpeechVolume: (v: number) => void;
  synthPreset: string;
  setSynthPreset: (preset: string) => void;
  displayMode: DisplayMode;
  setDisplayMode: (mode: DisplayMode) => void;
  updateWindowState: (
    appId: AppId,
    position: { x: number; y: number },
    size: { width: number; height: number }
  ) => void;
  bringToForeground: (appId: AppId | "") => void;
  toggleApp: (appId: AppId, initialData?: unknown) => void;
  closeApp: (appId: AppId) => void;
  navigateToNextApp: (currentAppId: AppId) => void;
  navigateToPreviousApp: (currentAppId: AppId) => void;
  clearInitialData: (appId: AppId) => void;
  launchOrFocusApp: (appId: AppId, initialData?: unknown) => void;
  currentWallpaper: string;
  setCurrentWallpaper: (wallpaperPath: string) => void;
  wallpaperSource: string;
  setWallpaper: (path: string | File) => Promise<void>;
  loadCustomWallpapers: () => Promise<string[]>;
  getWallpaperData: (reference: string) => Promise<string | null>;
  isFirstBoot: boolean;
  setHasBooted: () => void;
  htmlPreviewSplit: boolean;
  setHtmlPreviewSplit: (val: boolean) => void;
  uiVolume: number;
  setUiVolume: (vol: number) => void;
  chatSynthVolume: number;
  setChatSynthVolume: (vol: number) => void;
  ipodVolume: number;
  setIpodVolume: (vol: number) => void;
  masterVolume: number;
  setMasterVolume: (vol: number) => void;
}

// Run the check once on script load
const initialShaderState = checkShaderPerformance();

export const useAppStore = create<AppStoreState>()(
  persist(
    (set, get) => ({
      ...getInitialState(),
      debugMode: false,
      setDebugMode: (enabled) => set({ debugMode: enabled }),
      shaderEffectEnabled: initialShaderState,
      setShaderEffectEnabled: (enabled) =>
        set({ shaderEffectEnabled: enabled }),
      selectedShaderType: ShaderType.AURORA,
      setSelectedShaderType: (shaderType) =>
        set({ selectedShaderType: shaderType }),
      aiModel: null, // Default model set to null for client-side
      setAiModel: (model) => set({ aiModel: model }),
      terminalSoundsEnabled: true, // Default to true for terminal/IE sounds
      setTerminalSoundsEnabled: (enabled) =>
        set({ terminalSoundsEnabled: enabled }),
      uiSoundsEnabled: true,
      setUiSoundsEnabled: (enabled) => set({ uiSoundsEnabled: enabled }),
      typingSynthEnabled: false,
      setTypingSynthEnabled: (enabled) => set({ typingSynthEnabled: enabled }),
      speechEnabled: false,
      setSpeechEnabled: (enabled) => set({ speechEnabled: enabled }),
      speechVolume: 2,
      setSpeechVolume: (v) => set({ speechVolume: v }),
      synthPreset: "classic",
      setSynthPreset: (preset) => set({ synthPreset: preset }),
      displayMode: "color",
      setDisplayMode: (mode) => set({ displayMode: mode }),
      isFirstBoot: true,
      setHasBooted: () => {
        set({ isFirstBoot: false });
      },
      masterVolume: 1,
      setMasterVolume: (vol) => set({ masterVolume: vol }),
      updateWindowState: (appId, position, size) =>
        set((state) => ({
          apps: {
            ...state.apps,
            [appId]: {
              ...state.apps[appId],
              position,
              size,
            },
          },
        })),
      currentWallpaper: "/wallpapers/videos/blue_flowers_loop.mp4", // Default wallpaper
      wallpaperSource: "/wallpapers/videos/blue_flowers_loop.mp4",
      setCurrentWallpaper: (wallpaperPath) =>
        set({
          currentWallpaper: wallpaperPath,
          wallpaperSource: wallpaperPath,
        }),

      // High-level helper to change wallpaper (string path or File)
      setWallpaper: async (path) => {
        let wallpaperPath: string;

        // 1. If user passed a File -> save it first
        if (path instanceof File) {
          try {
            wallpaperPath = await saveCustomWallpaper(path);
          } catch (err) {
            console.error("setWallpaper: failed to save custom wallpaper", err);
            return;
          }
        } else {
          wallpaperPath = path;
        }

        // 2. Update store with new path (optimistically)
        set({
          currentWallpaper: wallpaperPath,
          wallpaperSource: wallpaperPath,
        });

        // 3. If it is an IndexedDB reference, load actual data
        if (wallpaperPath.startsWith(INDEXEDDB_PREFIX)) {
          const data = await get().getWallpaperData(wallpaperPath);
          if (data) {
            set({ wallpaperSource: data });
          }
        }

        // 4. Inform rest of application (for same-window listeners)
        window.dispatchEvent(
          new CustomEvent("wallpaperChange", { detail: wallpaperPath })
        );
      },

      // Return references (indexeddb://<id>) of all saved custom wallpapers
      loadCustomWallpapers: async () => {
        try {
          const db = await ensureIndexedDBInitialized();
          const tx = db.transaction(CUSTOM_WALLPAPERS_STORE, "readonly");
          const store = tx.objectStore(CUSTOM_WALLPAPERS_STORE);
          const keysRequest = store.getAllKeys();
          const refs: string[] = await new Promise((resolve, reject) => {
            keysRequest.onsuccess = () =>
              resolve(keysRequest.result as string[]);
            keysRequest.onerror = () => reject(keysRequest.error);
          });
          db.close();
          return refs.map((k) => `${INDEXEDDB_PREFIX}${k}`);
        } catch (err) {
          console.error("Error loading custom wallpapers:", err);
          return [];
        }
      },

      // Fetch the actual data (object URL or data URL) for a wallpaper reference
      getWallpaperData: async (reference) => {
        if (!reference.startsWith(INDEXEDDB_PREFIX)) {
          return reference; // Plain path
        }

        const id = reference.substring(INDEXEDDB_PREFIX.length);

        // Use cached URL if available
        if (objectURLs[id]) return objectURLs[id];

        try {
          const db = await ensureIndexedDBInitialized();
          const tx = db.transaction(CUSTOM_WALLPAPERS_STORE, "readonly");
          const store = tx.objectStore(CUSTOM_WALLPAPERS_STORE);
          const req = store.get(id);

          const result = await new Promise<StoredWallpaper | null>(
            (resolve, reject) => {
              req.onsuccess = () => resolve(req.result as StoredWallpaper);
              req.onerror = () => reject(req.error);
            }
          );

          db.close();

          if (!result) return null;

          let objectURL: string | null = null;

          if (result.blob) {
            objectURL = URL.createObjectURL(result.blob);
          } else if (result.content) {
            const blob = dataURLToBlob(result.content);
            objectURL = blob ? URL.createObjectURL(blob) : result.content;
          }

          if (objectURL) {
            objectURLs[id] = objectURL;
            return objectURL;
          }

          return null;
        } catch (err) {
          console.error("Error getting wallpaper data:", err);
          return null;
        }
      },

      bringToForeground: (appId) => {
        set((state) => {
          const newState: AppManagerState = {
            windowOrder: [...state.windowOrder],
            apps: { ...state.apps },
          };

          // If empty string provided, just clear foreground flags
          if (!appId) {
            Object.keys(newState.apps).forEach((id) => {
              newState.apps[id] = { ...newState.apps[id], isForeground: false };
            });
          } else {
            // Re‑order windowOrder so that appId is last (top‑most)
            newState.windowOrder = [
              ...newState.windowOrder.filter((id) => id !== appId),
              appId,
            ];

            // Set foreground flags
            Object.keys(newState.apps).forEach((id) => {
              newState.apps[id] = {
                ...newState.apps[id],
                isForeground: id === appId,
              };
            });
          }

          // Emit DOM event (keep behaviour parity)
          const appStateChangeEvent = new CustomEvent("appStateChange", {
            detail: {
              appId,
              isOpen: newState.apps[appId]?.isOpen || false,
              isForeground: true,
            },
          });
          window.dispatchEvent(appStateChangeEvent);

          return newState;
        });
      },

      toggleApp: (appId, initialData) => {
        set((state) => {
          const isCurrentlyOpen = state.apps[appId]?.isOpen;
          let newWindowOrder = [...state.windowOrder];

          if (isCurrentlyOpen) {
            // Remove the app from window order
            newWindowOrder = newWindowOrder.filter((id) => id !== appId);
          } else {
            // Add the app to window order
            newWindowOrder = [...newWindowOrder, appId];
          }

          const newApps: { [appId: string]: AppState } = { ...state.apps };

          // If closing the app and there are other open apps, bring the most recent one to foreground
          const shouldBringPreviousToForeground =
            isCurrentlyOpen && newWindowOrder.length > 0;
          const previousAppId = shouldBringPreviousToForeground
            ? newWindowOrder[newWindowOrder.length - 1]
            : null;

          Object.keys(newApps).forEach((id) => {
            if (id === appId) {
              newApps[id] = {
                ...newApps[id],
                isOpen: !isCurrentlyOpen,
                isForeground: !isCurrentlyOpen,
                initialData: !isCurrentlyOpen ? initialData : undefined,
              };
            } else {
              newApps[id] = {
                ...newApps[id],
                isForeground:
                  shouldBringPreviousToForeground && id === previousAppId,
              };
            }
          });

          const newState: AppManagerState = {
            windowOrder: newWindowOrder,
            apps: newApps,
          };

          const appStateChangeEvent = new CustomEvent("appStateChange", {
            detail: {
              appId,
              isOpen: !isCurrentlyOpen,
              isForeground: !isCurrentlyOpen,
            },
          });
          window.dispatchEvent(appStateChangeEvent);

          return newState;
        });
      },

      closeApp: (appId) => {
        set((state) => {
          if (!state.apps[appId]?.isOpen) {
            console.log(`App ${appId} is already closed. No action taken.`);
            return state; // App is already closed, do nothing
          }

          console.log(`Closing app: ${appId}`);

          const newWindowOrder = state.windowOrder.filter((id) => id !== appId);
          const newApps: { [id: string]: AppState } = { ...state.apps };

          // Determine the next app to bring to foreground
          const nextForegroundAppId =
            newWindowOrder.length > 0
              ? newWindowOrder[newWindowOrder.length - 1]
              : null;

          Object.keys(newApps).forEach((id) => {
            if (id === appId) {
              newApps[id] = {
                ...newApps[id],
                isOpen: false,
                isForeground: false,
                initialData: undefined, // Clear initial data on close
              };
            } else {
              newApps[id] = {
                ...newApps[id],
                // Bring the next app in order to foreground if this wasn't the last app closed
                isForeground: id === nextForegroundAppId,
              };
            }
          });

          const newState: AppManagerState = {
            windowOrder: newWindowOrder,
            apps: newApps,
          };

          // Emit DOM event for closing
          const appStateChangeEvent = new CustomEvent("appStateChange", {
            detail: {
              appId,
              isOpen: false,
              isForeground: false,
            },
          });
          window.dispatchEvent(appStateChangeEvent);
          console.log(`App ${appId} closed. New window order:`, newWindowOrder);
          console.log(
            `App ${nextForegroundAppId || "none"} brought to foreground.`
          );

          return newState;
        });
      },

      launchOrFocusApp: (appId, initialData) => {
        set((state) => {
          const isCurrentlyOpen = state.apps[appId]?.isOpen;
          let newWindowOrder = [...state.windowOrder];
          const newApps: { [id: string]: AppState } = { ...state.apps };

          console.log(
            `[AppStore:launchOrFocusApp] App: ${appId}, Currently Open: ${isCurrentlyOpen}, InitialData:`,
            initialData
          );

          if (isCurrentlyOpen) {
            // App is open: Bring to front, update initialData
            newWindowOrder = newWindowOrder.filter((id) => id !== appId);
            newWindowOrder.push(appId);
          } else {
            // App is closed: Add to end
            newWindowOrder.push(appId);
          }

          // Update all apps for foreground status and the target app's data/open state
          Object.keys(newApps).forEach((id) => {
            const isTargetApp = id === appId;
            newApps[id] = {
              ...newApps[id],
              isOpen: isTargetApp ? true : newApps[id].isOpen, // Ensure target is open
              isForeground: isTargetApp, // Target is foreground
              // Update initialData ONLY for the target app
              initialData: isTargetApp ? initialData : newApps[id].initialData,
            };
          });

          const newState: AppManagerState = {
            windowOrder: newWindowOrder,
            apps: newApps,
          };

          // Emit event (optional, but good for consistency)
          const appStateChangeEvent = new CustomEvent("appStateChange", {
            detail: {
              appId,
              isOpen: true,
              isForeground: true,
              updatedData: !!initialData, // Indicate if data was updated
            },
          });
          window.dispatchEvent(appStateChangeEvent);

          return newState;
        });
      },

      navigateToNextApp: (currentAppId) => {
        const { windowOrder } = get();
        if (windowOrder.length <= 1) return;
        const currentIndex = windowOrder.indexOf(currentAppId);
        if (currentIndex === -1) return;
        const nextAppId = windowOrder[
          (currentIndex + 1) % windowOrder.length
        ] as AppId;
        get().bringToForeground(nextAppId);
      },

      navigateToPreviousApp: (currentAppId) => {
        const { windowOrder } = get();
        if (windowOrder.length <= 1) return;
        const currentIndex = windowOrder.indexOf(currentAppId);
        if (currentIndex === -1) return;
        const prevIndex =
          (currentIndex - 1 + windowOrder.length) % windowOrder.length;
        const prevAppId = windowOrder[prevIndex] as AppId;
        get().bringToForeground(prevAppId);
      },

      clearInitialData: (appId) => {
        set((state) => {
          if (state.apps[appId]?.initialData) {
            console.log(`[AppStore] Clearing initialData for ${appId}`);
            return {
              apps: {
                ...state.apps,
                [appId]: {
                  ...state.apps[appId],
                  initialData: undefined,
                },
              },
            };
          }
          return state; // No change needed
        });
      },

      htmlPreviewSplit: true,
      setHtmlPreviewSplit: (val) => set({ htmlPreviewSplit: val }),
      uiVolume: 1,
      setUiVolume: (vol) => set({ uiVolume: vol }),
      chatSynthVolume: 1,
      setChatSynthVolume: (vol) => set({ chatSynthVolume: vol }),
      ipodVolume: 1,
      setIpodVolume: (vol) => set({ ipodVolume: vol }),
    }),
    {
      name: "ryos:app-store",
      partialize: (state) => ({
        windowOrder: state.windowOrder,
        apps: state.apps,
        debugMode: state.debugMode,
        shaderEffectEnabled: state.shaderEffectEnabled,
        selectedShaderType: state.selectedShaderType,
        aiModel: state.aiModel,
        terminalSoundsEnabled: state.terminalSoundsEnabled,
        uiSoundsEnabled: state.uiSoundsEnabled,
        typingSynthEnabled: state.typingSynthEnabled,
        speechEnabled: state.speechEnabled,
        synthPreset: state.synthPreset,
        htmlPreviewSplit: state.htmlPreviewSplit,
        currentWallpaper: state.currentWallpaper,
        displayMode: state.displayMode,
        isFirstBoot: state.isFirstBoot,
        wallpaperSource: state.wallpaperSource,
        uiVolume: state.uiVolume,
        chatSynthVolume: state.chatSynthVolume,
        speechVolume: state.speechVolume,
        ipodVolume: state.ipodVolume,
        masterVolume: state.masterVolume,
      }),
    }
  )
);

// Wallpaper / background handling --------------------------------------------------
export const INDEXEDDB_PREFIX = "indexeddb://";
const CUSTOM_WALLPAPERS_STORE = "custom_wallpapers";
// Keep cached object URLs so we do not recreate them every time
const objectURLs: Record<string, string> = {};

// Structure stored in IndexedDB for custom wallpapers
type StoredWallpaper = {
  blob?: Blob;
  content?: string;
  [key: string]: unknown;
};

// Helper to convert a data URL to a Blob (for backwards compatibility)
const dataURLToBlob = (dataURL: string): Blob | null => {
  try {
    if (!dataURL.startsWith("data:")) return null;
    const arr = dataURL.split(",");
    const mime = arr[0].match(/:(.*?);/)?.[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (e) {
    console.error("Error converting data URL to Blob:", e);
    return null;
  }
};

// Save a custom wallpaper (image file) to IndexedDB and return its reference string
const saveCustomWallpaper = async (file: File): Promise<string> => {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are allowed for custom wallpapers");
  }
  try {
    const db = await ensureIndexedDBInitialized();
    const tx = db.transaction(CUSTOM_WALLPAPERS_STORE, "readwrite");
    const store = tx.objectStore(CUSTOM_WALLPAPERS_STORE);
    const wallpaperName = `custom_${Date.now()}_${file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    )}`;
    const wallpaper = {
      name: wallpaperName,
      blob: file,
      content: "", // backwards compatibility
      type: file.type,
      dateAdded: new Date().toISOString(),
    };
    await new Promise<void>((resolve, reject) => {
      const req = store.put(wallpaper);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
    return `${INDEXEDDB_PREFIX}${wallpaperName}`;
  } catch (err) {
    console.error("Failed to save custom wallpaper:", err);
    throw err;
  }
};

// Global utility: clearAllAppStates – used by Control Panels "Reset All" button.
export const clearAllAppStates = (): void => {
  try {
    localStorage.clear();
  } catch (err) {
    console.error("[clearAllAppStates] Failed to clear localStorage", err);
  }
};

// HTML Preview split helpers that rely on the store state
export const loadHtmlPreviewSplit = () =>
  useAppStore.getState().htmlPreviewSplit;

export const saveHtmlPreviewSplit = (val: boolean) =>
  useAppStore.getState().setHtmlPreviewSplit(val);

// -------------------------------------------------------------------------------
