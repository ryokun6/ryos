import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AppId, getWindowConfig } from "@/config/appRegistry";
import { appIds } from "@/config/appIds";
import { AppManagerState, AppState } from "@/apps/base/types";
import { checkShaderPerformance } from "@/utils/performanceCheck";
import { ShaderType } from "@/components/shared/GalaxyBackground";
import { DisplayMode } from "@/utils/displayMode";
import { AIModel } from "@/types/aiModels";
import { ensureIndexedDBInitialized } from "@/utils/indexedDB";
export type { AIModel } from "@/types/aiModels";

// ---------------- Types ---------------------------------------------------------
export interface AppInstance extends AppState {
  instanceId: string;
  appId: AppId;
  title?: string;
  createdAt: number; // stable ordering for taskbar (creation time)
  isMinimized?: boolean; // minimized to taskbar (XP/Win98)
}

const getInitialState = (): AppManagerState => {
  const apps: { [appId: string]: AppState } = appIds.reduce(
    (acc: { [appId: string]: AppState }, id) => {
      acc[id] = { isOpen: false };
      return acc;
    },
    {} as { [appId: string]: AppState }
  );
  return { windowOrder: [], apps };
};

interface AppStoreState extends AppManagerState {
  // Instance (window) management
  instances: Record<string, AppInstance>;
  instanceOrder: string[]; // END = TOP (foreground)
  foregroundInstanceId: string | null;
  nextInstanceId: number;

  // Version / migration
  version: number;

  // Instance methods
  createAppInstance: (
    appId: AppId,
    initialData?: unknown,
    title?: string
  ) => string;
  closeAppInstance: (instanceId: string) => void;
  bringInstanceToForeground: (instanceId: string) => void;
  updateInstanceWindowState: (
    instanceId: string,
    position: { x: number; y: number },
    size: { width: number; height: number }
  ) => void;
  minimizeInstance: (instanceId: string) => void;
  restoreInstance: (instanceId: string) => void;
  toggleMinimizeInstance: (instanceId: string) => void;
  restoreAllMinimizedInstances: () => void;
  getInstancesByAppId: (appId: AppId) => AppInstance[];
  getForegroundInstance: () => AppInstance | null;
  navigateToNextInstance: (currentInstanceId: string) => void;
  navigateToPreviousInstance: (currentInstanceId: string) => void;
  launchApp: (
    appId: AppId,
    initialData?: unknown,
    title?: string,
    multiWindow?: boolean
  ) => string;

  // Legacy app‑level window APIs (kept as wrappers)
  bringToForeground: (appId: AppId | "") => void;
  toggleApp: (appId: AppId, initialData?: unknown) => void;
  closeApp: (appId: AppId) => void;
  navigateToNextApp: (currentAppId: AppId) => void;
  navigateToPreviousApp: (currentAppId: AppId) => void;
  launchOrFocusApp: (appId: AppId, initialData?: unknown) => void;

  // Misc state & helpers
  clearInitialData: (appId: AppId) => void;
  clearInstanceInitialData: (instanceId: string) => void;
  debugMode: boolean;
  setDebugMode: (v: boolean) => void;
  shaderEffectEnabled: boolean;
  setShaderEffectEnabled: (v: boolean) => void;
  selectedShaderType: ShaderType;
  setSelectedShaderType: (t: ShaderType) => void;
  aiModel: AIModel;
  setAiModel: (m: AIModel) => void;
  terminalSoundsEnabled: boolean;
  setTerminalSoundsEnabled: (v: boolean) => void;
  uiSoundsEnabled: boolean;
  setUiSoundsEnabled: (v: boolean) => void;
  typingSynthEnabled: boolean;
  setTypingSynthEnabled: (v: boolean) => void;
  speechEnabled: boolean;
  setSpeechEnabled: (v: boolean) => void;
  speechVolume: number;
  setSpeechVolume: (v: number) => void;
  ttsModel: "openai" | "elevenlabs" | null;
  setTtsModel: (m: "openai" | "elevenlabs" | null) => void;
  ttsVoice: string | null;
  setTtsVoice: (v: string | null) => void;
  synthPreset: string;
  setSynthPreset: (v: string) => void;
  displayMode: DisplayMode;
  setDisplayMode: (m: DisplayMode) => void;
  updateWindowState: (
    appId: AppId,
    position: { x: number; y: number },
    size: { width: number; height: number }
  ) => void;
  currentWallpaper: string;
  setCurrentWallpaper: (p: string) => void;
  wallpaperSource: string;
  setWallpaper: (p: string | File) => Promise<void>;
  loadCustomWallpapers: () => Promise<string[]>;
  getWallpaperData: (reference: string) => Promise<string | null>;
  isFirstBoot: boolean;
  setHasBooted: () => void;
  htmlPreviewSplit: boolean;
  setHtmlPreviewSplit: (v: boolean) => void;
  uiVolume: number;
  setUiVolume: (v: number) => void;
  chatSynthVolume: number;
  setChatSynthVolume: (v: number) => void;
  ipodVolume: number;
  setIpodVolume: (v: number) => void;
  masterVolume: number;
  setMasterVolume: (v: number) => void;
  _debugCheckInstanceIntegrity: () => void;
}

const CURRENT_APP_STORE_VERSION = 3; // bump for instanceOrder unification
const initialShaderState = checkShaderPerformance();

// ---------------- Store ---------------------------------------------------------
export const useAppStore = create<AppStoreState>()(
  persist(
    (set, get) => ({
      ...getInitialState(),
      version: CURRENT_APP_STORE_VERSION,

      // Misc toggles / settings
      debugMode: false,
      setDebugMode: (enabled) => set({ debugMode: enabled }),
      shaderEffectEnabled: initialShaderState,
      setShaderEffectEnabled: (enabled) =>
        set({ shaderEffectEnabled: enabled }),
      selectedShaderType: ShaderType.AURORA,
      setSelectedShaderType: (t) => set({ selectedShaderType: t }),
      aiModel: null,
      setAiModel: (m) => set({ aiModel: m }),
      terminalSoundsEnabled: true,
      setTerminalSoundsEnabled: (v) => set({ terminalSoundsEnabled: v }),
      uiSoundsEnabled: true,
      setUiSoundsEnabled: (v) => set({ uiSoundsEnabled: v }),
      typingSynthEnabled: false,
      setTypingSynthEnabled: (v) => set({ typingSynthEnabled: v }),
      speechEnabled: false,
      setSpeechEnabled: (v) => set({ speechEnabled: v }),
      speechVolume: 2,
      setSpeechVolume: (v) => set({ speechVolume: v }),
      ttsModel: null,
      setTtsModel: (m) => set({ ttsModel: m }),
      ttsVoice: null,
      setTtsVoice: (v) => set({ ttsVoice: v }),
      synthPreset: "classic",
      setSynthPreset: (v) => set({ synthPreset: v }),
      displayMode: "color",
      setDisplayMode: (m) => set({ displayMode: m }),
      isFirstBoot: true,
      setHasBooted: () => set({ isFirstBoot: false }),
      masterVolume: 1,
      setMasterVolume: (vol) => set({ masterVolume: vol }),

      updateWindowState: (appId, position, size) =>
        set((state) => ({
          apps: {
            ...state.apps,
            [appId]: { ...state.apps[appId], position, size },
          },
        })),

      currentWallpaper: "/wallpapers/videos/blue_flowers_loop.mp4",
      wallpaperSource: "/wallpapers/videos/blue_flowers_loop.mp4",
      setCurrentWallpaper: (p) =>
        set({ currentWallpaper: p, wallpaperSource: p }),

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

      // Legacy app-level wrappers (kept)
      bringToForeground: (appId) => {
        set((state) => {
          const newState: AppManagerState = {
            windowOrder: [...state.windowOrder],
            apps: { ...state.apps },
          };
          if (!appId) {
            Object.keys(newState.apps).forEach((id) => {
              newState.apps[id] = { ...newState.apps[id], isForeground: false };
            });
          } else {
            newState.windowOrder = [
              ...newState.windowOrder.filter((id) => id !== appId),
              appId,
            ];
            Object.keys(newState.apps).forEach((id) => {
              newState.apps[id] = {
                ...newState.apps[id],
                isForeground: id === appId,
              };
            });
          }
          window.dispatchEvent(
            new CustomEvent("appStateChange", {
              detail: {
                appId,
                isOpen: newState.apps[appId]?.isOpen || false,
                isForeground: true,
              },
            })
          );
          return newState;
        });
      },
      toggleApp: (appId, initialData) => {
        set((state) => {
          const isOpen = state.apps[appId]?.isOpen;
          let windowOrder = [...state.windowOrder];
          windowOrder = isOpen
            ? windowOrder.filter((id) => id !== appId)
            : [...windowOrder, appId];
          const apps: Record<string, AppState> = { ...state.apps };
          const shouldBringPrev = isOpen && windowOrder.length > 0;
          const prev = shouldBringPrev
            ? windowOrder[windowOrder.length - 1]
            : null;
          Object.keys(apps).forEach((id) => {
            if (id === appId) {
              apps[id] = {
                ...apps[id],
                isOpen: !isOpen,
                isForeground: !isOpen,
                initialData: !isOpen ? initialData : undefined,
              };
            } else {
              apps[id] = {
                ...apps[id],
                isForeground: shouldBringPrev && id === prev,
              };
            }
          });
          window.dispatchEvent(
            new CustomEvent("appStateChange", {
              detail: { appId, isOpen: !isOpen, isForeground: !isOpen },
            })
          );
          return { windowOrder, apps };
        });
      },
      closeApp: (appId) => {
        set((state) => {
          if (!state.apps[appId]?.isOpen) return state;
          const windowOrder = state.windowOrder.filter((id) => id !== appId);
          const nextId = windowOrder.length
            ? windowOrder[windowOrder.length - 1]
            : null;
          const apps = { ...state.apps };
          Object.keys(apps).forEach((id) => {
            if (id === appId)
              apps[id] = {
                ...apps[id],
                isOpen: false,
                isForeground: false,
                initialData: undefined,
              };
            else apps[id] = { ...apps[id], isForeground: id === nextId };
          });
          window.dispatchEvent(
            new CustomEvent("appStateChange", {
              detail: { appId, isOpen: false, isForeground: false },
            })
          );
          return { windowOrder, apps };
        });
      },
      launchOrFocusApp: (appId, initialData) => {
        set((state) => {
          const isOpen = state.apps[appId]?.isOpen;
          let windowOrder = [...state.windowOrder];
          if (isOpen)
            windowOrder = [...windowOrder.filter((id) => id !== appId), appId];
          else windowOrder.push(appId);
          const apps = { ...state.apps };
          Object.keys(apps).forEach((id) => {
            const target = id === appId;
            apps[id] = {
              ...apps[id],
              isOpen: target ? true : apps[id].isOpen,
              isForeground: target,
              initialData: target ? initialData : apps[id].initialData,
            };
          });
          window.dispatchEvent(
            new CustomEvent("appStateChange", {
              detail: {
                appId,
                isOpen: true,
                isForeground: true,
                updatedData: !!initialData,
              },
            })
          );
          return { windowOrder, apps };
        });
      },
      navigateToNextApp: (current) => {
        const { windowOrder } = get();
        if (windowOrder.length <= 1) return;
        const idx = windowOrder.indexOf(current);
        if (idx === -1) return;
        get().bringToForeground(
          windowOrder[(idx + 1) % windowOrder.length] as AppId
        );
      },
      navigateToPreviousApp: (current) => {
        const { windowOrder } = get();
        if (windowOrder.length <= 1) return;
        const idx = windowOrder.indexOf(current);
        if (idx === -1) return;
        const prev = (idx - 1 + windowOrder.length) % windowOrder.length;
        get().bringToForeground(windowOrder[prev] as AppId);
      },

      clearInitialData: (appId) =>
        set((state) => {
          if (!state.apps[appId]?.initialData) return state;
          return {
            apps: {
              ...state.apps,
              [appId]: { ...state.apps[appId], initialData: undefined },
            },
          };
        }),
      clearInstanceInitialData: (instanceId: string) =>
        set((state) => {
          if (!state.instances[instanceId]?.initialData) return state;
          return {
            instances: {
              ...state.instances,
              [instanceId]: {
                ...state.instances[instanceId],
                initialData: undefined,
              },
            },
          };
        }),

      htmlPreviewSplit: true,
      setHtmlPreviewSplit: (v) => set({ htmlPreviewSplit: v }),
      uiVolume: 1,
      setUiVolume: (v) => set({ uiVolume: v }),
      chatSynthVolume: 2,
      setChatSynthVolume: (v) => set({ chatSynthVolume: v }),
      ipodVolume: 1,
      setIpodVolume: (v) => set({ ipodVolume: v }),

      // Instance store
      instances: {},
      instanceOrder: [],
      foregroundInstanceId: null,
      nextInstanceId: 0,

      createAppInstance: (appId, initialData, title) => {
        let createdId = "";
        set((state) => {
          const nextNum = state.nextInstanceId + 1;
          createdId = nextNum.toString();
          // Stagger position based on total number of open instances (global), not per-app
          const openInstances = state.instanceOrder.length; // existing before adding new
          const baseOffset = 16;
          const offsetStep = 32;
          const isMobile =
            typeof window !== "undefined" && window.innerWidth < 768;
          const position = {
            x: isMobile ? 0 : baseOffset + openInstances * offsetStep,
            y: isMobile
              ? 28 + openInstances * offsetStep
              : 40 + openInstances * 20,
          };
          const cfg = getWindowConfig(appId);
          const size = isMobile
            ? { width: window.innerWidth, height: cfg.defaultSize.height }
            : cfg.defaultSize;
          const instances = {
            ...state.instances,
            [createdId]: {
              instanceId: createdId,
              appId,
              isOpen: true,
              isForeground: true,
              isMinimized: false,
              initialData,
              title,
              position,
              size,
              createdAt: Date.now(),
            },
          } as typeof state.instances;
          Object.keys(instances).forEach((id) => {
            if (id !== createdId)
              instances[id] = { ...instances[id], isForeground: false };
          });
          const instanceOrder = [
            ...state.instanceOrder.filter((id) => id !== createdId),
            createdId,
          ];
          return {
            instances,
            instanceOrder,
            foregroundInstanceId: createdId,
            nextInstanceId: nextNum,
          };
        });
        if (createdId) {
          window.dispatchEvent(
            new CustomEvent("instanceStateChange", {
              detail: {
                instanceId: createdId,
                isOpen: true,
                isForeground: true,
              },
            })
          );
        }
        return createdId;
      },

      closeAppInstance: (instanceId) => {
        set((state) => {
          const inst = state.instances[instanceId];
          if (!inst?.isOpen) return state;
          const instances = { ...state.instances };
          delete instances[instanceId];
          let order = state.instanceOrder.filter((id) => id !== instanceId);
          // pick next foreground: last same-app in order, else last overall
          let nextForeground: string | null = null;
          for (let i = order.length - 1; i >= 0; i--) {
            const id = order[i];
            if (instances[id]?.appId === inst.appId && instances[id].isOpen) {
              nextForeground = id;
              break;
            }
          }
          if (!nextForeground && order.length)
            nextForeground = order[order.length - 1];
          Object.keys(instances).forEach((id) => {
            instances[id] = {
              ...instances[id],
              isForeground: id === nextForeground,
            };
          });
          if (nextForeground) {
            order = [
              ...order.filter((id) => id !== nextForeground),
              nextForeground,
            ];
          }
          window.dispatchEvent(
            new CustomEvent("instanceStateChange", {
              detail: { instanceId, isOpen: false, isForeground: false },
            })
          );
          return {
            instances,
            instanceOrder: order,
            foregroundInstanceId: nextForeground,
          };
        });
      },

      bringInstanceToForeground: (instanceId) => {
        set((state) => {
          if (instanceId && !state.instances[instanceId]) {
            console.warn(`[AppStore] focus missing instance ${instanceId}`);
            return state;
          }
          const instances = { ...state.instances };
          let order = [...state.instanceOrder];
          let foreground: string | null = null;
          if (!instanceId) {
            Object.keys(instances).forEach((id) => {
              instances[id] = { ...instances[id], isForeground: false };
            });
          } else {
            Object.keys(instances).forEach((id) => {
              instances[id] = {
                ...instances[id],
                // restore if minimized when bringing to foreground
                isMinimized:
                  id === instanceId ? false : instances[id].isMinimized,
                isForeground: id === instanceId,
              };
            });
            order = [...order.filter((id) => id !== instanceId), instanceId];
            foreground = instanceId;
          }
          window.dispatchEvent(
            new CustomEvent("instanceStateChange", {
              detail: {
                instanceId,
                isOpen: !!instances[instanceId]?.isOpen,
                isForeground: !!foreground && foreground === instanceId,
              },
            })
          );
          return {
            instances,
            instanceOrder: order,
            foregroundInstanceId: foreground,
          };
        });
      },

      minimizeInstance: (instanceId) => {
        set((state) => {
          const target = state.instances[instanceId];
          if (!target?.isOpen) return state;
          const instances = { ...state.instances };
          instances[instanceId] = {
            ...instances[instanceId],
            isMinimized: true,
            isForeground: false,
          };
          // choose next foreground: last open and not minimized
          let nextForeground: string | null = null;
          for (let i = state.instanceOrder.length - 1; i >= 0; i--) {
            const id = state.instanceOrder[i];
            const inst = instances[id];
            if (inst?.isOpen && !inst.isMinimized) {
              nextForeground = id;
              break;
            }
          }
          Object.keys(instances).forEach((id) => {
            instances[id] = {
              ...instances[id],
              isForeground: id === nextForeground,
            };
          });
          return {
            instances,
            foregroundInstanceId: nextForeground,
          };
        });
      },

      restoreInstance: (instanceId) => {
        set((state) => {
          if (!state.instances[instanceId]) return state;
          const instances = { ...state.instances };
          instances[instanceId] = {
            ...instances[instanceId],
            isMinimized: false,
          };
          return { instances };
        });
        // then bring to foreground
        get().bringInstanceToForeground(instanceId);
      },

      toggleMinimizeInstance: (instanceId) => {
        const inst = get().instances[instanceId];
        if (!inst) return;
        if (inst.isMinimized) get().restoreInstance(instanceId);
        else get().minimizeInstance(instanceId);
      },

      restoreAllMinimizedInstances: () => {
        set((state) => {
          const instances = { ...state.instances };
          Object.keys(instances).forEach((id) => {
            if (instances[id]?.isOpen && instances[id].isMinimized) {
              instances[id] = { ...instances[id], isMinimized: false };
            }
          });
          return { instances };
        });
      },

      updateInstanceWindowState: (instanceId, position, size) =>
        set((state) => ({
          instances: {
            ...state.instances,
            [instanceId]: { ...state.instances[instanceId], position, size },
          },
        })),

      getInstancesByAppId: (appId) =>
        Object.values(get().instances).filter((i) => i.appId === appId),
      getForegroundInstance: () => {
        const id = get().foregroundInstanceId;
        return id ? get().instances[id] || null : null;
      },
      navigateToNextInstance: (currentId) => {
        const { instanceOrder } = get();
        if (instanceOrder.length <= 1) return;
        const idx = instanceOrder.indexOf(currentId);
        if (idx === -1) return;
        const next = instanceOrder[(idx + 1) % instanceOrder.length];
        get().bringInstanceToForeground(next);
      },
      navigateToPreviousInstance: (currentId) => {
        const { instanceOrder } = get();
        if (instanceOrder.length <= 1) return;
        const idx = instanceOrder.indexOf(currentId);
        if (idx === -1) return;
        const prev = (idx - 1 + instanceOrder.length) % instanceOrder.length;
        get().bringInstanceToForeground(instanceOrder[prev]);
      },
      launchApp: (appId, initialData, title, multiWindow = false) => {
        const state = get();
        const supportsMultiWindow =
          multiWindow || appId === "textedit" || appId === "finder";
        if (!supportsMultiWindow) {
          const existing = Object.values(state.instances).find(
            (i) => i.appId === appId && i.isOpen
          );
          if (existing) {
            state.bringInstanceToForeground(existing.instanceId);
            if (initialData) {
              set((s) => ({
                instances: {
                  ...s.instances,
                  [existing.instanceId]: {
                    ...s.instances[existing.instanceId],
                    initialData,
                  },
                },
              }));
            }
            return existing.instanceId;
          }
        }
        return state.createAppInstance(appId, initialData, title);
      },

      _debugCheckInstanceIntegrity: () => {
        set((state) => {
          const openIds = Object.values(state.instances)
            .filter((i) => i.isOpen)
            .map((i) => i.instanceId);
          const filtered = state.instanceOrder.filter((id) =>
            openIds.includes(id)
          );
          const missing = openIds.filter((id) => !filtered.includes(id));
          if (!missing.length && filtered.length === state.instanceOrder.length)
            return state;
          return { instanceOrder: [...filtered, ...missing] };
        });
      },
    }),
    {
      name: "ryos:app-store",
      version: CURRENT_APP_STORE_VERSION,
      partialize: (state): Partial<AppStoreState> => ({
        windowOrder: state.windowOrder,
        apps: state.apps,
        version: state.version,
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
        ttsModel: state.ttsModel,
        ttsVoice: state.ttsVoice,
        ipodVolume: state.ipodVolume,
        masterVolume: state.masterVolume,
        instances: Object.fromEntries(
          Object.entries(state.instances).filter(([, inst]) => inst.isOpen)
        ),
        instanceOrder: state.instanceOrder.filter(
          (id) => state.instances[id]?.isOpen
        ),
        foregroundInstanceId: state.foregroundInstanceId,
        nextInstanceId: state.nextInstanceId,
      }),
      migrate: (persisted: unknown, version: number) => {
        const prev = persisted as AppStoreState & {
          instanceStackOrder?: string[];
          instanceWindowOrder?: string[];
          instanceOrder?: string[];
        };
        console.log(
          "[AppStore] Migrating from",
          version,
          "to",
          CURRENT_APP_STORE_VERSION
        );
        // v1->2 handled TTS; keep prior logic if present
        if (version < 2) {
          prev.ttsModel = null;
          prev.ttsVoice = null;
        }
        // v<3 unify ordering arrays
        if (version < 3) {
          const legacyStack: string[] | undefined = prev.instanceStackOrder;
          const legacyWindow: string[] | undefined = prev.instanceWindowOrder;
          prev.instanceOrder = (
            legacyStack && legacyStack.length ? legacyStack : legacyWindow || []
          ).filter((id: string) => prev.instances?.[id]);
          delete prev.instanceStackOrder;
          delete prev.instanceWindowOrder;
        }
        prev.version = CURRENT_APP_STORE_VERSION;
        return prev;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Clean instanceOrder after rehydrate
        if (
          (state as unknown as { instanceOrder?: string[] }).instanceOrder &&
          state.instances
        ) {
          (state as unknown as { instanceOrder?: string[] }).instanceOrder = (
            state as unknown as { instanceOrder?: string[] }
          ).instanceOrder!.filter((id: string) => state.instances[id]);
        }
        // Fix nextInstanceId
        if (state.instances && Object.keys(state.instances).length) {
          const max = Math.max(
            ...Object.keys(state.instances).map((id) => parseInt(id, 10))
          );
          if (!isNaN(max) && max >= state.nextInstanceId)
            state.nextInstanceId = max + 1;
        }
        // Ensure positions & sizes
        Object.keys(state.instances || {}).forEach((id) => {
          const inst = state.instances[id];
          if (!inst.createdAt) {
            const numericId = parseInt(id, 10);
            inst.createdAt = !isNaN(numericId) ? numericId : Date.now();
          }
          if (!inst.position || !inst.size) {
            const cfg = getWindowConfig(inst.appId);
            const isMobile = window.innerWidth < 768;
            if (!inst.position)
              inst.position = { x: isMobile ? 0 : 16, y: isMobile ? 28 : 40 };
            if (!inst.size)
              inst.size = isMobile
                ? { width: window.innerWidth, height: cfg.defaultSize.height }
                : cfg.defaultSize;
          }
        });
        // Migrate old app states (pre-instance system)
        const hasOldOpen = Object.values(state.apps || {}).some(
          (a) => a.isOpen
        );
        if (hasOldOpen && Object.keys(state.instances || {}).length === 0) {
          let idCounter = state.nextInstanceId || 0;
          const instances: Record<string, AppInstance> = {};
          const order: string[] = [];
          state.windowOrder.forEach((appId) => {
            const a = state.apps[appId];
            if (a?.isOpen) {
              const instId = (++idCounter).toString();
              instances[instId] = {
                instanceId: instId,
                appId: appId as AppId,
                isOpen: true,
                isForeground: a.isForeground,
                position: a.position,
                size: a.size,
                initialData: a.initialData,
                createdAt: Date.now(),
              };
              order.push(instId);
            }
          });
          state.instances = instances;
          (state as unknown as { instanceOrder?: string[] }).instanceOrder =
            order;
          state.nextInstanceId = idCounter;
          // Reset legacy app flags
          Object.keys(state.apps).forEach((appId) => {
            state.apps[appId] = { isOpen: false, isForeground: false };
          });
          state.windowOrder = [];
        }
      },
    }
  )
);

// ---------------- IndexedDB wallpaper helpers ----------------------------------
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

// Global helpers ---------------------------------------------------------------
export const clearAllAppStates = (): void => {
  try {
    localStorage.clear();
  } catch (e) {
    console.error("clearAllAppStates", e);
  }
};
export const loadHtmlPreviewSplit = () =>
  useAppStore.getState().htmlPreviewSplit;
export const saveHtmlPreviewSplit = (v: boolean) =>
  useAppStore.getState().setHtmlPreviewSplit(v);
