import { create } from "zustand";
import { useStoreShallow } from "./helpers";
import { persist } from "zustand/middleware";
import { ShaderType } from "@/types/shader";
import { DisplayMode } from "@/utils/displayMode";
import { checkShaderPerformance } from "@/utils/performanceCheck";
import { ensureIndexedDBInitialized } from "@/utils/indexedDB";
import {
  emitCloudSyncDomainChange,
  requestCloudSyncDomainCheck,
} from "@/utils/cloudSyncEvents";
import { convertImageFileToWallpaperJpeg } from "@/utils/customWallpaperProcessing";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import { SETTINGS_ANALYTICS, track } from "@/utils/analytics";
import { buildShuffleDescriptor } from "@/utils/dynamicWallpaper";

/** Default desktop wallpaper selection. */
export const DEFAULT_WALLPAPER_PATH = buildShuffleDescriptor("nature");

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
    const processedFile = await convertImageFileToWallpaperJpeg(file);
    const db = await ensureIndexedDBInitialized();
    const tx = db.transaction(CUSTOM_WALLPAPERS_STORE, "readwrite");
    const store = tx.objectStore(CUSTOM_WALLPAPERS_STORE);
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
  /**
   * Update only the *rendered* wallpaper source without changing the persisted
   * `currentWallpaper` selection. Used by dynamic wallpapers (e.g. shuffle) that
   * resolve a concrete asset to display while keeping the user's chosen
   * descriptor intact.
   */
  setRuntimeWallpaperSource: (src: string) => void;
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

  // Show resizers (debug sub-setting)
  showResizers: boolean;
  setShowResizers: (v: boolean) => void;

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
      setDisplayMode: (m) => {
        const previousMode = get().displayMode;
        set({ displayMode: m });
        if (previousMode !== m) {
          track(SETTINGS_ANALYTICS.DISPLAY_MODE_CHANGE, { displayMode: m });
        }
      },

      // Shader settings
      shaderEffectEnabled: initialShaderState,
      selectedShaderType: ShaderType.AURORA,
      setShaderEffectEnabled: (enabled) => {
        set({ shaderEffectEnabled: enabled });
        track(SETTINGS_ANALYTICS.SHADER_TOGGLE, { enabled });
      },
      setSelectedShaderType: (t) => {
        set({ selectedShaderType: t });
        track(SETTINGS_ANALYTICS.SHADER_TYPE_CHANGE, { shaderType: t });
      },

      // Wallpaper
      currentWallpaper: DEFAULT_WALLPAPER_PATH,
      wallpaperSource: DEFAULT_WALLPAPER_PATH,
      setCurrentWallpaper: (p) => {
        set({ currentWallpaper: p, wallpaperSource: p });
        track(SETTINGS_ANALYTICS.WALLPAPER_CHANGE, {
          wallpaperKind: p.startsWith(INDEXEDDB_PREFIX) ? "custom" : "built-in",
        });
      },

      setRuntimeWallpaperSource: (src) => {
        if (get().wallpaperSource === src) return;
        set({ wallpaperSource: src });
      },

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
        if (wall.startsWith(INDEXEDDB_PREFIX)) {
          useCloudSyncStore.getState().clearDeletedKeys("customWallpaperKeys", [
            wall.substring(INDEXEDDB_PREFIX.length),
          ]);
        }
        if (!wall.startsWith(INDEXEDDB_PREFIX)) {
          set({ currentWallpaper: wall, wallpaperSource: wall });
        } else {
          const fallbackSource = get().wallpaperSource;
          const data = await get().getWallpaperData(wall);
          set({
            currentWallpaper: wall,
            wallpaperSource: data || fallbackSource,
          });
          if (!data) {
            requestCloudSyncDomainCheck("custom-wallpapers");
          }
        }
        window.dispatchEvent(
          new CustomEvent("wallpaperChange", { detail: wall })
        );
        track(SETTINGS_ANALYTICS.WALLPAPER_CHANGE, {
          wallpaperKind: wall.startsWith(INDEXEDDB_PREFIX) ? "custom" : "built-in",
          uploaded: path instanceof File,
        });
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

      deleteCustomWallpaper: async (reference) => {
        const id = reference.startsWith(INDEXEDDB_PREFIX)
          ? reference.substring(INDEXEDDB_PREFIX.length)
          : reference;
        useCloudSyncStore.getState().markDeletedKeys("customWallpaperKeys", [id]);
        try {
          const db = await ensureIndexedDBInitialized();
          const tx = db.transaction(CUSTOM_WALLPAPERS_STORE, "readwrite");
          const store = tx.objectStore(CUSTOM_WALLPAPERS_STORE);
          await new Promise<void>((res, rej) => {
            const r = store.delete(id);
            r.onsuccess = () => res();
            r.onerror = () => rej(r.error);
          });
          db.close();
          if (objectURLs[id]) {
            URL.revokeObjectURL(objectURLs[id]);
            delete objectURLs[id];
          }
          if (get().currentWallpaper === reference) {
            set({
              currentWallpaper: DEFAULT_WALLPAPER_PATH,
              wallpaperSource: DEFAULT_WALLPAPER_PATH,
            });
          }
          get().bumpCustomWallpapersRevision();
          emitCloudSyncDomainChange("custom-wallpapers");
        } catch (e) {
          console.error("deleteCustomWallpaper", e);
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
      setScreenSaverEnabled: (v) => {
        set({ screenSaverEnabled: v });
        track(SETTINGS_ANALYTICS.SCREENSAVER_CHANGE, { enabled: v });
      },
      setScreenSaverType: (v) => {
        set({ screenSaverType: v });
        track(SETTINGS_ANALYTICS.SCREENSAVER_CHANGE, { screenSaverType: v });
      },
      setScreenSaverIdleTime: (v) => {
        set({ screenSaverIdleTime: v });
        track(SETTINGS_ANALYTICS.SCREENSAVER_CHANGE, {
          idleMinutesBucket: v <= 5 ? "0-5" : v <= 15 ? "6-15" : "16+",
        });
      },

      // Debug mode
      debugMode: false,
      setDebugMode: (enabled) => set({ debugMode: enabled }),

      // Show resizers (debug sub-setting)
      showResizers: false,
      setShowResizers: (enabled) => set({ showResizers: enabled }),

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
        showResizers: state.showResizers,
        htmlPreviewSplit: state.htmlPreviewSplit,
      }),
      merge: (persistedState, currentState) => {
        const merged = {
          ...currentState,
          ...(persistedState as Partial<DisplaySettingsState> | undefined),
        };
        const cw = merged.currentWallpaper;
        const ws = merged.wallpaperSource;
        // Persisted blob: object URLs are invalid after reload; never hydrate them as the CSS/video src.
        if (
          typeof cw === "string" &&
          cw.startsWith(INDEXEDDB_PREFIX) &&
          typeof ws === "string" &&
          (ws.startsWith("blob:") || ws === cw)
        ) {
          return { ...merged, wallpaperSource: cw };
        }
        return merged;
      },
    }
  )
);

// Helper functions for backward compatibility
export const loadHtmlPreviewSplit = () =>
  useDisplaySettingsStore.getState().htmlPreviewSplit;
export const saveHtmlPreviewSplit = (v: boolean) =>
  useDisplaySettingsStore.getState().setHtmlPreviewSplit(v);

/**
 * Shallow-equality selector hook for this store. Co-located with the store
 * (rather than a central helpers barrel) so importing it doesn't pull other
 * stores into the bundle.
 */
export function useDisplaySettingsStoreShallow<T>(
  selector: (state: ReturnType<typeof useDisplaySettingsStore.getState>) => T
): T {
  return useStoreShallow(useDisplaySettingsStore, selector);
}
