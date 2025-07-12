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
// Re-export for backward compatibility
export type { AIModel } from "@/types/aiModels";

// Add new types for instance management
export interface AppInstance extends AppState {
  instanceId: string;
  appId: AppId;
  title?: string; // For window title customization
}

export interface AppInstanceManagerState {
  instances: Record<string, AppInstance>; // instanceId -> instance
  windowOrder: string[]; // Now contains instanceIds instead of appIds
  nextInstanceId: number;
}

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
  // Add instance management
  instances: Record<string, AppInstance>;
  instanceWindowOrder: string[];
  nextInstanceId: number;

  // Add version tracking
  version: number;

  // Instance management methods
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
  ttsModel: "openai" | "elevenlabs" | null;
  setTtsModel: (model: "openai" | "elevenlabs" | null) => void;
  ttsVoice: string | null;
  setTtsVoice: (voice: string | null) => void;
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
  clearInstanceInitialData: (instanceId: string) => void;
  clearCorruptedStates: () => void;
  recoverFromCrash: () => void;
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

// Define current store version
const CURRENT_APP_STORE_VERSION = 2; // Increment to trigger TTS migration

// Run the check once on script load
const initialShaderState = checkShaderPerformance();

export const useAppStore = create<AppStoreState>()(
  persist(
    (set, get) => ({
      ...getInitialState(),
      // Add version tracking
      version: CURRENT_APP_STORE_VERSION,

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
      ttsModel: null, // Default to null (select option)
      setTtsModel: (model) => set({ ttsModel: model }),
      ttsVoice: null, // Default to null (select option)
      setTtsVoice: (voice) => set({ ttsVoice: voice }),
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

      clearInstanceInitialData: (instanceId) => {
        set((state) => {
          if (!state.instances[instanceId]) {
            console.warn(`[AppStore] Attempted to clear initialData for non-existent instance: ${instanceId}`);
            return state;
          }
          
          return {
            instances: {
              ...state.instances,
              [instanceId]: {
                ...state.instances[instanceId],
                initialData: undefined,
              },
            },
          };
        });
      },

      // New method to clear corrupted states
      clearCorruptedStates: () => {
        set((state) => {
          const cleanedInstances: Record<string, AppInstance> = {};
          const cleanedInstanceWindowOrder: string[] = [];
          
          // Clean up instances
          Object.entries(state.instances).forEach(([instanceId, instance]) => {
            try {
              // Validate instance structure
              if (!instance || typeof instance !== 'object') {
                console.warn(`[AppStore] Removing corrupted instance: ${instanceId}`);
                return;
              }
              
              // Validate required fields
              if (!instance.instanceId || !instance.appId) {
                console.warn(`[AppStore] Removing instance with missing required fields: ${instanceId}`);
                return;
              }
              
              // Sanitize initialData if present
              let sanitizedInitialData = instance.initialData;
              if (instance.initialData !== undefined && instance.initialData !== null) {
                try {
                  if (instance.appId === 'videos' && typeof instance.initialData === 'object') {
                    const videoData = instance.initialData as { videoId?: string };
                    if (videoData.videoId && typeof videoData.videoId !== 'string') {
                      console.warn(`[AppStore] Sanitizing corrupted videoId in instance ${instanceId}:`, videoData.videoId);
                      sanitizedInitialData = { videoId: String(videoData.videoId) };
                    }
                  }
                  // Deep clone to prevent reference issues
                  sanitizedInitialData = JSON.parse(JSON.stringify(sanitizedInitialData));
                } catch (error) {
                  console.warn(`[AppStore] Clearing corrupted initialData in instance ${instanceId}:`, error);
                  sanitizedInitialData = undefined;
                }
              }
              
              cleanedInstances[instanceId] = {
                ...instance,
                initialData: sanitizedInitialData,
              };
              
              // Only add to window order if instance is open
              if (instance.isOpen) {
                cleanedInstanceWindowOrder.push(instanceId);
              }
            } catch (error) {
              console.error(`[AppStore] Error processing instance ${instanceId}:`, error);
            }
          });
          
          return {
            instances: cleanedInstances,
            instanceWindowOrder: cleanedInstanceWindowOrder,
          };
        });
      },

      // Recovery method for app crashes
      recoverFromCrash: () => {
        console.log('[AppStore] Recovering from crash...');
        set((state) => {
          // Close all instances to prevent further issues
          const closedInstances: Record<string, AppInstance> = {};
          Object.entries(state.instances).forEach(([instanceId, instance]) => {
            if (instance && typeof instance === 'object') {
              closedInstances[instanceId] = {
                ...instance,
                isOpen: false,
                isForeground: false,
                initialData: undefined, // Clear all initial data
              };
            }
          });
          
          return {
            instances: closedInstances,
            instanceWindowOrder: [],
          };
        });
      },

      htmlPreviewSplit: true,
      setHtmlPreviewSplit: (val) => set({ htmlPreviewSplit: val }),
      uiVolume: 1,
      setUiVolume: (vol) => set({ uiVolume: vol }),
      chatSynthVolume: 2,
      setChatSynthVolume: (vol) => set({ chatSynthVolume: vol }),
      ipodVolume: 1,
      setIpodVolume: (vol) => set({ ipodVolume: vol }),

      // Add instance management
      instances: {},
      instanceWindowOrder: [],
      nextInstanceId: 0,

      // Instance management methods
      createAppInstance: (appId, initialData, title) => {
        // Validate inputs
        if (!appId || typeof appId !== 'string') {
          console.error('[AppStore] Invalid appId provided to createAppInstance:', appId);
          return '';
        }

        // Sanitize initialData
        let sanitizedInitialData = initialData;
        if (initialData !== undefined && initialData !== null) {
          try {
            // For video links, ensure the data structure is valid
            if (appId === 'videos' && typeof initialData === 'object') {
              const videoData = initialData as { videoId?: string };
              if (videoData.videoId && typeof videoData.videoId !== 'string') {
                console.warn('[AppStore] Invalid videoId type in createAppInstance, sanitizing:', videoData.videoId);
                sanitizedInitialData = { videoId: String(videoData.videoId) };
              }
            }
            
            // Deep clone to prevent reference issues
            sanitizedInitialData = JSON.parse(JSON.stringify(sanitizedInitialData));
          } catch (error) {
            console.error('[AppStore] Error sanitizing initialData in createAppInstance:', error);
            sanitizedInitialData = undefined;
          }
        }

        const instanceId = (++get().nextInstanceId).toString();

        // Calculate position with offset for multiple windows
        const existingInstances = Object.values(get().instances).filter(
          (instance) => instance.appId === appId && instance.isOpen
        );
        const offsetMultiplier = existingInstances.length;
        const baseOffset = 16;
        const offsetStep = 32;

        const isMobile = window.innerWidth < 768;
        const position = {
          x: isMobile ? 0 : baseOffset + offsetMultiplier * offsetStep,
          y: isMobile ? 28 : 40 + offsetMultiplier * 20,
        };

        // Get default size from window config
        const config = getWindowConfig(appId);
        const size = isMobile
          ? {
              width: window.innerWidth,
              height: config.defaultSize.height,
            }
          : config.defaultSize;

        try {
          set((state) => ({
            instances: {
              ...state.instances,
              [instanceId]: {
                instanceId,
                appId,
                isOpen: true,
                isForeground: true,
                initialData: sanitizedInitialData,
                title,
                position,
                size,
              },
            },
            instanceWindowOrder: [...state.instanceWindowOrder, instanceId],
          }));

          // Bring all other instances to background
          set((state) => {
            const updatedInstances = { ...state.instances };
            Object.keys(updatedInstances).forEach((id) => {
              if (id !== instanceId) {
                updatedInstances[id] = {
                  ...updatedInstances[id],
                  isForeground: false,
                };
              }
            });
            return { instances: updatedInstances };
          });

          return instanceId;
        } catch (error) {
          console.error('[AppStore] Error creating app instance:', error);
          return '';
        }
      },
      closeAppInstance: (instanceId) => {
        set((state) => {
          if (!state.instances[instanceId]?.isOpen) {
            console.log(
              `Instance ${instanceId} is already closed. No action taken.`
            );
            return state; // Instance is already closed, do nothing
          }

          console.log(`Closing instance: ${instanceId}`);

          const closingInstance = state.instances[instanceId];
          const newInstanceWindowOrder = state.instanceWindowOrder.filter(
            (id) => id !== instanceId
          );
          const newInstances: Record<string, AppInstance> = {
            ...state.instances,
          };

          // Find the next instance to bring to foreground
          let nextForegroundInstanceId: string | null = null;

          // First, try to find another open instance of the same app
          const sameAppInstances = Object.values(state.instances)
            .filter(
              (instance) =>
                instance.appId === closingInstance.appId &&
                instance.instanceId !== instanceId &&
                instance.isOpen
            )
            .map((instance) => instance.instanceId);

          if (sameAppInstances.length > 0) {
            // Find the most recently used instance of the same app
            // (the one that appears last in the window order among same-app instances)
            for (let i = newInstanceWindowOrder.length - 1; i >= 0; i--) {
              const candidateId = newInstanceWindowOrder[i];
              if (sameAppInstances.includes(candidateId)) {
                nextForegroundInstanceId = candidateId;
                break;
              }
            }

            // If no same-app instance found in window order, use the first available
            if (!nextForegroundInstanceId) {
              nextForegroundInstanceId = sameAppInstances[0];
            }
          } else {
            // No other instances of the same app, fall back to the last instance in window order
            nextForegroundInstanceId =
              newInstanceWindowOrder.length > 0
                ? newInstanceWindowOrder[newInstanceWindowOrder.length - 1]
                : null;
          }

          // Actually remove the closed instance from the store
          delete newInstances[instanceId];

          // Update foreground status for remaining instances
          Object.keys(newInstances).forEach((id) => {
            newInstances[id] = {
              ...newInstances[id],
              // Bring the selected next instance to foreground
              isForeground: id === nextForegroundInstanceId,
            };
          });

          const newState = {
            instances: newInstances,
            instanceWindowOrder: newInstanceWindowOrder,
          };

          // Emit DOM event for closing
          const instanceStateChangeEvent = new CustomEvent(
            "instanceStateChange",
            {
              detail: {
                instanceId,
                isOpen: false,
                isForeground: false,
              },
            }
          );
          window.dispatchEvent(instanceStateChangeEvent);
          console.log(
            `Instance ${instanceId} closed and removed. New instance order:`,
            newInstanceWindowOrder
          );
          console.log(
            `Instance ${
              nextForegroundInstanceId || "none"
            } brought to foreground.`
          );

          return newState;
        });
      },
      bringInstanceToForeground: (instanceId) => {
        set((state) => {
          const newState = {
            instances: { ...state.instances },
            instanceWindowOrder: [...state.instanceWindowOrder],
          };

          // If empty string provided, just clear foreground flags
          if (!instanceId) {
            Object.keys(newState.instances).forEach((id) => {
              newState.instances[id] = {
                ...newState.instances[id],
                isForeground: false,
              };
            });
          } else {
            // Re‑order instanceWindowOrder so that instanceId is last (top‑most)
            newState.instanceWindowOrder = [
              ...newState.instanceWindowOrder.filter(
                (id: string) => id !== instanceId
              ),
              instanceId,
            ];

            // Set foreground flags
            Object.keys(newState.instances).forEach((id) => {
              newState.instances[id] = {
                ...newState.instances[id],
                isForeground: id === instanceId,
              };
            });
          }

          // Emit DOM event (keep behaviour parity)
          const instanceStateChangeEvent = new CustomEvent(
            "instanceStateChange",
            {
              detail: {
                instanceId,
                isOpen: newState.instances[instanceId]?.isOpen || false,
                isForeground: true,
              },
            }
          );
          window.dispatchEvent(instanceStateChangeEvent);

          return newState;
        });
      },
      updateInstanceWindowState: (instanceId, position, size) =>
        set((state) => ({
          instances: {
            ...state.instances,
            [instanceId]: {
              ...state.instances[instanceId],
              position,
              size,
            },
          },
        })),
      getInstancesByAppId: (appId) => {
        return Object.values(get().instances).filter(
          (instance) => instance.appId === appId
        );
      },
      getForegroundInstance: () => {
        const { instanceWindowOrder, instances } = get();
        if (instanceWindowOrder.length > 0) {
          const lastInstanceId =
            instanceWindowOrder[instanceWindowOrder.length - 1];
          return instances[lastInstanceId] || null;
        }
        return null;
      },
      navigateToNextInstance: (currentInstanceId) => {
        const { instanceWindowOrder } = get();
        if (instanceWindowOrder.length <= 1) return;
        const currentIndex = instanceWindowOrder.indexOf(currentInstanceId);
        if (currentIndex === -1) return;
        const nextInstanceId =
          instanceWindowOrder[(currentIndex + 1) % instanceWindowOrder.length];
        get().bringInstanceToForeground(nextInstanceId);
      },
      navigateToPreviousInstance: (currentInstanceId) => {
        const { instanceWindowOrder } = get();
        if (instanceWindowOrder.length <= 1) return;
        const currentIndex = instanceWindowOrder.indexOf(currentInstanceId);
        if (currentIndex === -1) return;
        const prevIndex =
          (currentIndex - 1 + instanceWindowOrder.length) %
          instanceWindowOrder.length;
        const prevInstanceId = instanceWindowOrder[prevIndex];
        get().bringInstanceToForeground(prevInstanceId);
      },
      launchApp: (appId, initialData, title, multiWindow = false) => {
        const state = get();

        // Validate appId
        if (!appId || typeof appId !== 'string') {
          console.error('[AppStore] Invalid appId provided to launchApp:', appId);
          return '';
        }

        // Validate and sanitize initialData
        let sanitizedInitialData = initialData;
        if (initialData !== undefined && initialData !== null) {
          try {
            // For video links, ensure the data structure is valid
            if (appId === 'videos' && typeof initialData === 'object') {
              const videoData = initialData as { videoId?: string };
              if (videoData.videoId && typeof videoData.videoId !== 'string') {
                console.warn('[AppStore] Invalid videoId type, sanitizing:', videoData.videoId);
                sanitizedInitialData = { videoId: String(videoData.videoId) };
              }
            }
            
            // Deep clone to prevent reference issues
            sanitizedInitialData = JSON.parse(JSON.stringify(sanitizedInitialData));
          } catch (error) {
            console.error('[AppStore] Error sanitizing initialData:', error);
            sanitizedInitialData = undefined;
          }
        }

        // Check if multi-window is supported for this app
        const supportsMultiWindow =
          multiWindow || appId === "textedit" || appId === "finder"; // TextEdit and Finder support multi-window

        if (!supportsMultiWindow) {
          // Use existing single-window behavior
          const existingInstance = Object.values(state.instances).find(
            (instance) => instance.appId === appId && instance.isOpen
          );

          if (existingInstance) {
            // Focus existing instance
            state.bringInstanceToForeground(existingInstance.instanceId);
            // Update initialData if provided
            if (sanitizedInitialData) {
              set((s) => ({
                instances: {
                  ...s.instances,
                  [existingInstance.instanceId]: {
                    ...s.instances[existingInstance.instanceId],
                    initialData: sanitizedInitialData,
                  },
                },
              }));
            }
            return existingInstance.instanceId;
          }
        }

        // Create new instance with sanitized data
        return state.createAppInstance(appId, sanitizedInitialData, title);
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
        // Only persist open instances to avoid storing closed instances
        instances: Object.fromEntries(
          Object.entries(state.instances).filter(
            ([, instance]) => instance.isOpen
          )
        ),
        instanceWindowOrder: state.instanceWindowOrder,
        nextInstanceId: state.nextInstanceId,
      }),
      migrate: (persistedState: unknown, version: number) => {
        const migrated = persistedState as AppStoreState;
        console.log(
          "[AppStore] Migrating from version",
          version,
          "to",
          CURRENT_APP_STORE_VERSION
        );

        let migratedState = migrated;

        // Migrate from version 1 to 2: Reset TTS settings to null
        if (version < 2) {
          console.log(
            "[AppStore] Migrating TTS settings to new defaults (null). Previous values:",
            {
              ttsModel: migratedState.ttsModel,
              ttsVoice: migratedState.ttsVoice,
            }
          );
          migratedState = {
            ...migratedState,
            ttsModel: null,
            ttsVoice: null,
          };
        }

        // Update version to current
        migratedState.version = CURRENT_APP_STORE_VERSION;

        return migratedState;
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Clear corrupted states first
          if (state.clearCorruptedStates) {
            state.clearCorruptedStates();
          }

          // Clean up instanceWindowOrder to remove any non-existent instance IDs
          if (state.instanceWindowOrder && state.instances) {
            state.instanceWindowOrder = state.instanceWindowOrder.filter(
              (instanceId) => state.instances[instanceId]
            );
          }

          // Ensure nextInstanceId is set correctly to avoid ID collisions
          if (state.instances && Object.keys(state.instances).length > 0) {
            const maxId = Math.max(
              ...Object.keys(state.instances).map((id) => parseInt(id, 10))
            );
            if (!isNaN(maxId) && maxId >= state.nextInstanceId) {
              state.nextInstanceId = maxId + 1;
              console.log(
                `[AppStore] Adjusted nextInstanceId to ${state.nextInstanceId} to avoid collisions`
              );
            }
          }

          // Ensure all rehydrated instances have their persisted positions and sizes
          if (state.instances) {
            Object.keys(state.instances).forEach((instanceId) => {
              const instance = state.instances[instanceId];
              try {
                // Validate instance structure
                if (!instance || typeof instance !== 'object') {
                  console.warn(`[AppStore] Removing corrupted instance during rehydration: ${instanceId}`);
                  delete state.instances[instanceId];
                  return;
                }

                // Sanitize initialData if present
                if (instance.initialData !== undefined && instance.initialData !== null) {
                  try {
                    if (instance.appId === 'videos' && typeof instance.initialData === 'object') {
                      const videoData = instance.initialData as { videoId?: string };
                      if (videoData.videoId && typeof videoData.videoId !== 'string') {
                        console.warn(`[AppStore] Sanitizing corrupted videoId during rehydration in instance ${instanceId}:`, videoData.videoId);
                        instance.initialData = { videoId: String(videoData.videoId) };
                      }
                    }
                    // Deep clone to prevent reference issues
                    instance.initialData = JSON.parse(JSON.stringify(instance.initialData));
                  } catch (error) {
                    console.warn(`[AppStore] Clearing corrupted initialData during rehydration in instance ${instanceId}:`, error);
                    instance.initialData = undefined;
                  }
                }

                // Ensure instances have position and size
                if (!instance.position || !instance.size) {
                  console.log(
                    `[AppStore] Instance ${instanceId} missing position/size, applying defaults`
                  );
                  const config = getWindowConfig(instance.appId);
                  const isMobile = window.innerWidth < 768;

                  // Apply default position if missing
                  if (!instance.position) {
                    instance.position = {
                      x: isMobile ? 0 : 16,
                      y: isMobile ? 28 : 40,
                    };
                  }

                  // Apply default size if missing
                  if (!instance.size) {
                    instance.size = isMobile
                      ? {
                          width: window.innerWidth,
                          height: config.defaultSize.height,
                        }
                      : config.defaultSize;
                  }
                }
              } catch (error) {
                console.error(`[AppStore] Error processing instance ${instanceId} during rehydration:`, error);
                // Remove corrupted instance
                delete state.instances[instanceId];
              }
            });
          }

          // Migrate old app states to instances
          const hasOldOpenApps = Object.values(state.apps || {}).some(
            (app) => app.isOpen
          );
          const hasInstances = Object.keys(state.instances || {}).length > 0;

          if (hasOldOpenApps && !hasInstances) {
            console.log("[AppStore] Migrating old app states to instances");
            let instanceIdCounter = state.nextInstanceId || 0;
            const newInstances: Record<string, AppInstance> = {};
            const newInstanceWindowOrder: string[] = [];

            // Convert each open app to an instance
            state.windowOrder.forEach((appId) => {
              const appState = state.apps[appId];
              if (appState?.isOpen) {
                try {
                  const instanceId = (++instanceIdCounter).toString();
                  
                  // Sanitize initialData during migration
                  let sanitizedInitialData = appState.initialData;
                  if (appState.initialData !== undefined && appState.initialData !== null) {
                    try {
                      if (appId === 'videos' && typeof appState.initialData === 'object') {
                        const videoData = appState.initialData as { videoId?: string };
                        if (videoData.videoId && typeof videoData.videoId !== 'string') {
                          console.warn(`[AppStore] Sanitizing corrupted videoId during migration:`, videoData.videoId);
                          sanitizedInitialData = { videoId: String(videoData.videoId) };
                        }
                      }
                      sanitizedInitialData = JSON.parse(JSON.stringify(sanitizedInitialData));
                    } catch (error) {
                      console.warn(`[AppStore] Clearing corrupted initialData during migration:`, error);
                      sanitizedInitialData = undefined;
                    }
                  }

                  newInstances[instanceId] = {
                    instanceId,
                    appId: appId as AppId,
                    isOpen: true,
                    isForeground: appState.isForeground,
                    position: appState.position,
                    size: appState.size,
                    initialData: sanitizedInitialData,
                  };
                  newInstanceWindowOrder.push(instanceId);
                } catch (error) {
                  console.error(`[AppStore] Error migrating app ${appId}:`, error);
                }
              }
            });

            state.instances = newInstances;
            state.instanceWindowOrder = newInstanceWindowOrder;
            state.nextInstanceId = instanceIdCounter + 1;
          }
        }
      },
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
  useAppStore.setState({
    instances: {},
    instanceWindowOrder: [],
    nextInstanceId: 0,
  });
};

// Utility function to debug and clear corrupted states
export const debugAndClearCorruptedStates = (): void => {
  const state = useAppStore.getState();
  console.log('[AppStore] Current state before cleanup:', {
    instancesCount: Object.keys(state.instances).length,
    instanceWindowOrderLength: state.instanceWindowOrder.length,
    nextInstanceId: state.nextInstanceId,
  });
  
  // Log any corrupted instances
  Object.entries(state.instances).forEach(([instanceId, instance]) => {
    if (!instance || typeof instance !== 'object') {
      console.warn(`[AppStore] Found corrupted instance: ${instanceId}`, instance);
    } else if (!instance.instanceId || !instance.appId) {
      console.warn(`[AppStore] Found instance with missing required fields: ${instanceId}`, instance);
    }
  });
  
  // Clear corrupted states
  state.clearCorruptedStates();
  
  console.log('[AppStore] State after cleanup:', {
    instancesCount: Object.keys(useAppStore.getState().instances).length,
    instanceWindowOrderLength: useAppStore.getState().instanceWindowOrder.length,
  });
};

// HTML Preview split helpers that rely on the store state
export const loadHtmlPreviewSplit = () =>
  useAppStore.getState().htmlPreviewSplit;

export const saveHtmlPreviewSplit = (val: boolean) =>
  useAppStore.getState().setHtmlPreviewSplit(val);

// -------------------------------------------------------------------------------
