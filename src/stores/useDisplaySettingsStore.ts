import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ShaderType } from "@/types/shader";
import { DisplayMode } from "@/utils/displayMode";
import { checkShaderPerformance } from "@/utils/performanceCheck";
import { ensureIndexedDBInitialized } from "@/utils/indexedDB";

/**
 * Display settings store - manages wallpaper, shaders, and screen saver settings.
 * Extracted from useAppStore to reduce complexity and improve separation of concerns.
 */

// IndexedDB helpers for custom wallpapers
export const INDEXEDDB_PREFIX = "indexeddb://";
const CUSTOM_WALLPAPERS_STORE = "custom_wallpapers";
const objectURLs: Record<string, string> = {};

type StoredWallpaper = { blob?: Blob; content?: string; [k: string]: unknown };

const dataURLToBlob = (dataURL: string): Blob | null => {
  try {
    if (!dataURL.startsWith("data:")) return null;
    const arr = dataURL.split(",");
    const mime = arr[0].match(/:(.*?);/)?.[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8 = new Uint8Array(n);
    while (n--) u8[n] = bstr.charCodeAt(n);
    return new Blob([u8], { type: mime });
  } catch (e) {
    console.error("dataURLToBlob", e);
    return null;
  }
};

const saveCustomWallpaper = async (file: File): Promise<string> => {
  if (!file.type.startsWith("image/"))
    throw new Error("Only image files allowed");
  try {
    const db = await ensureIndexedDBInitialized();
    const tx = db.transaction(CUSTOM_WALLPAPERS_STORE, "readwrite");
    const store = tx.objectStore(CUSTOM_WALLPAPERS_STORE);
    const name = `custom_${Date.now()}_${file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    )}`;
    const rec = {
      name,
      blob: file,
      content: "",
      type: file.type,
      dateAdded: new Date().toISOString(),
    };
    await new Promise<void>((res, rej) => {
      const r = store.put(rec, name);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
    db.close();
    return `${INDEXEDDB_PREFIX}${name}`;
  } catch (e) {
    console.error("saveCustomWallpaper", e);
    throw e;
  }
};

interface DisplaySettingsState {
  // Display mode
  displayMode: DisplayMode;
  setDisplayMode: (m: DisplayMode) => void;

  // Shader settings
  shaderEffectEnabled: boolean;
  selectedShaderType: ShaderType;
  setShaderEffectEnabled: (v: boolean) => void;
  setSelectedShaderType: (t: ShaderType) => void;

  // Wallpaper
  currentWallpaper: string;
  wallpaperSource: string;
  setCurrentWallpaper: (p: string) => void;
  setWallpaper: (p: string | File) => Promise<void>;
  loadCustomWallpapers: () => Promise<string[]>;
  getWallpaperData: (reference: string) => Promise<string | null>;

  // Screen saver
  screenSaverEnabled: boolean;
  screenSaverType: string;
  screenSaverIdleTime: number; // minutes
  setScreenSaverEnabled: (v: boolean) => void;
  setScreenSaverType: (v: string) => void;
  setScreenSaverIdleTime: (v: number) => void;

  // Debug mode
  debugMode: boolean;
  setDebugMode: (v: boolean) => void;

  // HTML preview
  htmlPreviewSplit: boolean;
  setHtmlPreviewSplit: (v: boolean) => void;
}

const STORE_VERSION = 1;
const initialShaderState = checkShaderPerformance();

export const useDisplaySettingsStore = create<DisplaySettingsState>()(
  persist(
    (set, get) => ({
      // Display mode
      displayMode: "color",
      setDisplayMode: (m) => set({ displayMode: m }),

      // Shader settings
      shaderEffectEnabled: initialShaderState,
      selectedShaderType: ShaderType.AURORA,
      setShaderEffectEnabled: (enabled) => set({ shaderEffectEnabled: enabled }),
      setSelectedShaderType: (t) => set({ selectedShaderType: t }),

      // Wallpaper
      currentWallpaper: "/wallpapers/photos/aqua/water.jpg",
      wallpaperSource: "/wallpapers/photos/aqua/water.jpg",
      setCurrentWallpaper: (p) => set({ currentWallpaper: p, wallpaperSource: p }),

      setWallpaper: async (path) => {
        let wall: string;
        if (path instanceof File) {
          try {
            wall = await saveCustomWallpaper(path);
          } catch (e) {
            console.error("setWallpaper failed", e);
            return;
          }
        } else {
          wall = path;
        }
        set({ currentWallpaper: wall, wallpaperSource: wall });
        if (wall.startsWith(INDEXEDDB_PREFIX)) {
          const data = await get().getWallpaperData(wall);
          if (data) set({ wallpaperSource: data });
        }
        window.dispatchEvent(
          new CustomEvent("wallpaperChange", { detail: wall })
        );
      },

      loadCustomWallpapers: async () => {
        try {
          const db = await ensureIndexedDBInitialized();
          const tx = db.transaction(CUSTOM_WALLPAPERS_STORE, "readonly");
          const store = tx.objectStore(CUSTOM_WALLPAPERS_STORE);
          const keysReq = store.getAllKeys();
          const keys: string[] = await new Promise((res, rej) => {
            keysReq.onsuccess = () => res(keysReq.result as string[]);
            keysReq.onerror = () => rej(keysReq.error);
          });
          db.close();
          return keys.map((k) => `${INDEXEDDB_PREFIX}${k}`);
        } catch (e) {
          console.error("loadCustomWallpapers", e);
          return [];
        }
      },

      getWallpaperData: async (reference) => {
        if (!reference.startsWith(INDEXEDDB_PREFIX)) return reference;
        const id = reference.substring(INDEXEDDB_PREFIX.length);
        if (objectURLs[id]) return objectURLs[id];
        try {
          const db = await ensureIndexedDBInitialized();
          const tx = db.transaction(CUSTOM_WALLPAPERS_STORE, "readonly");
          const store = tx.objectStore(CUSTOM_WALLPAPERS_STORE);
          const req = store.get(id);
          const result = await new Promise<StoredWallpaper | null>(
            (res, rej) => {
              req.onsuccess = () => res(req.result as StoredWallpaper);
              req.onerror = () => rej(req.error);
            }
          );
          db.close();
          if (!result) return null;
          let objectURL: string | null = null;
          if (result.blob) objectURL = URL.createObjectURL(result.blob);
          else if (result.content) {
            const blob = dataURLToBlob(result.content);
            objectURL = blob ? URL.createObjectURL(blob) : result.content;
          }
          if (objectURL) {
            objectURLs[id] = objectURL;
            return objectURL;
          }
          return null;
        } catch (e) {
          console.error("getWallpaperData", e);
          return null;
        }
      },

      // Screen saver
      screenSaverEnabled: false,
      screenSaverType: "starfield",
      screenSaverIdleTime: 5, // 5 minutes default
      setScreenSaverEnabled: (v) => set({ screenSaverEnabled: v }),
      setScreenSaverType: (v) => set({ screenSaverType: v }),
      setScreenSaverIdleTime: (v) => set({ screenSaverIdleTime: v }),

      // Debug mode
      debugMode: false,
      setDebugMode: (enabled) => set({ debugMode: enabled }),

      // HTML preview
      htmlPreviewSplit: true,
      setHtmlPreviewSplit: (v) => set({ htmlPreviewSplit: v }),
    }),
    {
      name: "ryos:display-settings",
      version: STORE_VERSION,
      partialize: (state) => ({
        displayMode: state.displayMode,
        shaderEffectEnabled: state.shaderEffectEnabled,
        selectedShaderType: state.selectedShaderType,
        currentWallpaper: state.currentWallpaper,
        wallpaperSource: state.wallpaperSource,
        screenSaverEnabled: state.screenSaverEnabled,
        screenSaverType: state.screenSaverType,
        screenSaverIdleTime: state.screenSaverIdleTime,
        debugMode: state.debugMode,
        htmlPreviewSplit: state.htmlPreviewSplit,
      }),
    }
  )
);

// Helper functions for backward compatibility
export const loadHtmlPreviewSplit = () =>
  useDisplaySettingsStore.getState().htmlPreviewSplit;
export const saveHtmlPreviewSplit = (v: boolean) =>
  useDisplaySettingsStore.getState().setHtmlPreviewSplit(v);
