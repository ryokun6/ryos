import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ShaderType } from "@/types/shader";
import { DisplayMode } from "@/utils/displayMode";
import { checkShaderPerformance } from "@/utils/performanceCheck";
import { STORES } from "@/utils/indexedDB";
import { emitCloudSyncDomainChange } from "@/utils/cloudSyncEvents";
import { convertImageFileToWallpaperJpeg } from "@/utils/customWallpaperProcessing";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import {
  deleteStorageItem,
  getStorageItem,
  listStorageKeys,
  putStorageItem,
} from "@/utils/opfsStorage";
import {
  extractStoredWallpaperId,
  isStoredWallpaperReference,
  OPFS_WALLPAPER_PREFIX,
  toStoredWallpaperReference,
} from "@/utils/wallpaperStorage";

/**
 * Display settings store - manages wallpaper, shaders, and screen saver settings.
 * Extracted from useAppStore to reduce complexity and improve separation of concerns.
 */

// Browser content storage helpers for custom wallpapers
export const INDEXEDDB_PREFIX = OPFS_WALLPAPER_PREFIX;
const CUSTOM_WALLPAPERS_STORE = STORES.CUSTOM_WALLPAPERS;
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
    const processedFile = await convertImageFileToWallpaperJpeg(file);
    const name = `custom_${Date.now()}_${processedFile.name.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    )}`;
    const rec = {
      name,
      blob: processedFile,
      content: "",
      type: processedFile.type,
      dateAdded: new Date().toISOString(),
    };
    await putStorageItem(CUSTOM_WALLPAPERS_STORE, rec, name);
    return toStoredWallpaperReference(name);
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
  deleteCustomWallpaper: (reference: string) => Promise<void>;
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

  // Non-persisted revision counter — incremented when IndexedDB custom wallpapers change
  customWallpapersRevision: number;
  bumpCustomWallpapersRevision: () => void;
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
        if (isStoredWallpaperReference(wall)) {
          const wallpaperId = extractStoredWallpaperId(wall);
          if (wallpaperId) {
          useCloudSyncStore.getState().clearDeletedKeys("customWallpaperKeys", [
              wallpaperId,
          ]);
          }
        }
        set({ currentWallpaper: wall, wallpaperSource: wall });
        if (isStoredWallpaperReference(wall)) {
          const data = await get().getWallpaperData(wall);
          if (data) set({ wallpaperSource: data });
        }
        window.dispatchEvent(
          new CustomEvent("wallpaperChange", { detail: wall })
        );
      },

      loadCustomWallpapers: async () => {
        try {
          const keys = await listStorageKeys(CUSTOM_WALLPAPERS_STORE);
          return keys.map((key) => toStoredWallpaperReference(key));
        } catch (e) {
          console.error("loadCustomWallpapers", e);
          return [];
        }
      },

      deleteCustomWallpaper: async (reference) => {
        const id = extractStoredWallpaperId(reference) ?? reference;
        useCloudSyncStore.getState().markDeletedKeys("customWallpaperKeys", [id]);
        try {
          await deleteStorageItem(CUSTOM_WALLPAPERS_STORE, id);
          if (objectURLs[id]) {
            URL.revokeObjectURL(objectURLs[id]);
            delete objectURLs[id];
          }
          if (get().currentWallpaper === reference) {
            set({
              currentWallpaper: "/wallpapers/photos/aqua/water.jpg",
              wallpaperSource: "/wallpapers/photos/aqua/water.jpg",
            });
          }
          get().bumpCustomWallpapersRevision();
          emitCloudSyncDomainChange("custom-wallpapers");
        } catch (e) {
          console.error("deleteCustomWallpaper", e);
        }
      },

      getWallpaperData: async (reference) => {
        if (!isStoredWallpaperReference(reference)) return reference;
        const id = extractStoredWallpaperId(reference);
        if (!id) return null;
        if (objectURLs[id]) return objectURLs[id];
        try {
          const result =
            (await getStorageItem<StoredWallpaper>(CUSTOM_WALLPAPERS_STORE, id)) ??
            null;
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

      customWallpapersRevision: 0,
      bumpCustomWallpapersRevision: () =>
        set((s) => ({ customWallpapersRevision: s.customWallpapersRevision + 1 })),
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
