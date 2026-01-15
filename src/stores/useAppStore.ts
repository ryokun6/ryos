import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AppId, getWindowConfig, getMobileWindowSize } from "@/config/appRegistry";
import { useAppletStore } from "@/stores/useAppletStore";
import { appIds } from "@/config/appIds";
import { AppManagerState, AppState } from "@/apps/base/types";
import { AIModel } from "@/types/aiModels";
import { track } from "@vercel/analytics";
import { APP_ANALYTICS } from "@/utils/analytics";
export type { AIModel } from "@/types/aiModels";

// ---------------- Types ---------------------------------------------------------
export interface AppInstance extends AppState {
  instanceId: string;
  appId: AppId;
  title?: string;
  displayTitle?: string; // Dynamic title for dock menu (updated by WindowFrame)
  createdAt: number; // stable ordering for taskbar (creation time)
  isLoading?: boolean;
  isMinimized?: boolean;
  /**
   * True when this instance was loaded from persisted storage (rehydration).
   * Used to suppress sounds/animations that should only happen on user-triggered opens.
   */
  restoredFromStorage?: boolean;
}

export interface RecentApp {
  appId: AppId;
  timestamp: number;
}

export interface RecentDocument {
  path: string;
  name: string;
  appId: AppId;
  icon?: string;
  timestamp: number;
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
  markInstanceAsLoaded: (instanceId: string) => void;
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
  minimizeInstance: (instanceId: string) => void;
  restoreInstance: (instanceId: string) => void;
  updateInstanceTitle: (instanceId: string, title: string) => void;
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
  updateInstanceInitialData: (instanceId: string, initialData: unknown) => void;
  aiModel: AIModel;
  setAiModel: (m: AIModel) => void;
  updateWindowState: (
    appId: AppId,
    position: { x: number; y: number },
    size: { width: number; height: number }
  ) => void;
  isFirstBoot: boolean;
  setHasBooted: () => void;
  macAppToastShown: boolean;
  setMacAppToastShown: () => void;
  lastSeenDesktopVersion: string | null;
  setLastSeenDesktopVersion: (version: string) => void;
  _debugCheckInstanceIntegrity: () => void;

  // Expose/Mission Control mode
  exposeMode: boolean;
  setExposeMode: (v: boolean) => void;
  
  // ryOS version (fetched from version.json)
  ryOSVersion: string | null;
  ryOSBuildNumber: string | null;
  ryOSBuildTime: string | null;
  setRyOSVersion: (version: string, buildNumber: string, buildTime?: string) => void;

  // Recent items
  recentApps: RecentApp[];
  recentDocuments: RecentDocument[];
  addRecentApp: (appId: AppId) => void;
  addRecentDocument: (path: string, name: string, appId: AppId, icon?: string) => void;
  clearRecentItems: () => void;
}

const CURRENT_APP_STORE_VERSION = 3; // bump for instanceOrder unification

// ---------------- Store ---------------------------------------------------------
const createUseAppStore = () =>
  create<AppStoreState>()(
    persist(
      (set, get) => ({
      ...getInitialState(),
      version: CURRENT_APP_STORE_VERSION,

      // AI model (kept here as it's core app functionality)
      aiModel: null,
      setAiModel: (m) => set({ aiModel: m }),

      // Boot state
      isFirstBoot: true,
      setHasBooted: () => set({ isFirstBoot: false }),
      macAppToastShown: false,
      setMacAppToastShown: () => set({ macAppToastShown: true }),
      lastSeenDesktopVersion: null,
      setLastSeenDesktopVersion: (version) => set({ lastSeenDesktopVersion: version }),

      // Expose/Mission Control mode
      exposeMode: false,
      setExposeMode: (v) => set({ exposeMode: v }),

      // ryOS version (fetched from version.json)
      ryOSVersion: null,
      ryOSBuildNumber: null,
      ryOSBuildTime: null,
      setRyOSVersion: (version, buildNumber, buildTime) =>
        set({
          ryOSVersion: version,
          ryOSBuildNumber: buildNumber,
          ryOSBuildTime: buildTime || null,
        }),

      // Recent items
      recentApps: [],
      recentDocuments: [],
      addRecentApp: (appId) =>
        set((state) => {
          // Remove existing entry for this app if present
          const filtered = state.recentApps.filter((r) => r.appId !== appId);
          // Add to front with current timestamp
          const newRecent: RecentApp = { appId, timestamp: Date.now() };
          // Keep only last 20 items
          return { recentApps: [newRecent, ...filtered].slice(0, 20) };
        }),
      addRecentDocument: (path, name, appId, icon) =>
        set((state) => {
          // Remove existing entry for this path if present
          const filtered = state.recentDocuments.filter((r) => r.path !== path);
          // Add to front with current timestamp
          const newRecent: RecentDocument = { path, name, appId, icon, timestamp: Date.now() };
          // Keep only last 20 items
          return { recentDocuments: [newRecent, ...filtered].slice(0, 20) };
        }),
      clearRecentItems: () => set({ recentApps: [], recentDocuments: [] }),

      updateWindowState: (appId, position, size) =>
        set((state) => ({
          apps: {
            ...state.apps,
            [appId]: { ...state.apps[appId], position, size },
          },
        })),

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

      updateInstanceInitialData: (instanceId: string, initialData: unknown) =>
        set((state) => {
          if (!state.instances[instanceId]) return state;
          return {
            instances: {
              ...state.instances,
              [instanceId]: {
                ...state.instances[instanceId],
                initialData,
              },
            },
          };
        }),

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
          let size = isMobile
            ? getMobileWindowSize(appId)
            : cfg.defaultSize;

          // If creating an Applet Viewer window and we have a path, prefer saved size
          if (appId === "applet-viewer") {
            try {
              const path = (initialData as { path?: string } | undefined)?.path;
              if (path) {
                const saved = useAppletStore
                  .getState()
                  .getAppletWindowSize(path);
                if (saved) size = saved;
              }
            } catch {
              // ignore and fall back to default size
            }
          }

          // Check if app is lazy (most are, except Finder which is critical)
          // We can assume non-Finder apps might need loading time
          const isLazy = appId !== "finder";

          const instances = {
            ...state.instances,
            [createdId]: {
              instanceId: createdId,
              appId,
              isOpen: true,
              isForeground: !isLazy, // Only foreground immediately if not lazy
              isLoading: isLazy,
              initialData,
              title,
              position,
              size,
              createdAt: Date.now(),
              restoredFromStorage: false,
            },
          } as typeof state.instances;

          if (!isLazy) {
            Object.keys(instances).forEach((id) => {
              if (id !== createdId)
                instances[id] = { ...instances[id], isForeground: false };
            });
          }

          const instanceOrder = [
            ...state.instanceOrder.filter((id) => id !== createdId),
            createdId,
          ];
          return {
            instances,
            instanceOrder,
            foregroundInstanceId: isLazy ? state.foregroundInstanceId : createdId,
            nextInstanceId: nextNum,
          };
        });
        if (createdId) {
          // Track recent app
          get().addRecentApp(appId);
          
          // Track recent document if initialData has a path
          // Skip folders - Finder opens directories, not files
          // Also skip common system folder paths
          const dataWithPath = initialData as { path?: string; name?: string; icon?: string; isDirectory?: boolean } | undefined;
          const isFolder = 
            appId === "finder" || 
            dataWithPath?.isDirectory === true ||
            // Common folder paths that shouldn't be tracked as documents
            dataWithPath?.path === "/" ||
            dataWithPath?.path === "/Applications" ||
            dataWithPath?.path === "/Documents" ||
            dataWithPath?.path === "/Desktop" ||
            dataWithPath?.path === "/Applets" ||
            dataWithPath?.path === "/Trash";
          
          if (dataWithPath?.path && !isFolder) {
            const fileName = dataWithPath.name || dataWithPath.path.split("/").pop() || dataWithPath.path;
            get().addRecentDocument(dataWithPath.path, fileName, appId, dataWithPath.icon);
          }
          
          window.dispatchEvent(
            new CustomEvent("instanceStateChange", {
              detail: {
                instanceId: createdId,
                isOpen: true,
                isForeground: appId === "finder", // Only finder is foreground immediately
              },
            })
          );
          // Track app launch analytics
          track(APP_ANALYTICS.APP_LAUNCH, { appId });
        }
        return createdId;
      },

      markInstanceAsLoaded: (instanceId) => {
        set((state) => {
          const inst = state.instances[instanceId];
          if (!inst || !inst.isLoading) return state;

          // When loaded, bring to foreground
          const instances = { ...state.instances };
          Object.keys(instances).forEach((id) => {
            instances[id] = {
              ...instances[id],
              isForeground: id === instanceId,
            };
          });

          instances[instanceId] = {
            ...inst,
            isLoading: false,
            isForeground: true,
          };

          // Ensure it's at the end of order
          const order = [
            ...state.instanceOrder.filter((id) => id !== instanceId),
            instanceId,
          ];

          window.dispatchEvent(
            new CustomEvent("instanceStateChange", {
              detail: {
                instanceId,
                isOpen: true,
                isForeground: true,
              },
            })
          );

          return {
            instances,
            instanceOrder: order,
            foregroundInstanceId: instanceId,
          };
        });
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
      minimizeInstance: (instanceId) => {
        set((state) => {
          const inst = state.instances[instanceId];
          if (!inst || inst.isMinimized) return state;

          const instances = { ...state.instances };
          instances[instanceId] = { ...inst, isMinimized: true, isForeground: false };

          // Find next foreground from non-minimized windows
          let nextForeground: string | null = null;
          for (let i = state.instanceOrder.length - 1; i >= 0; i--) {
            const id = state.instanceOrder[i];
            if (id !== instanceId && instances[id]?.isOpen && !instances[id]?.isMinimized) {
              nextForeground = id;
              break;
            }
          }

          if (nextForeground) {
            instances[nextForeground] = { ...instances[nextForeground], isForeground: true };
          }

          window.dispatchEvent(
            new CustomEvent("instanceStateChange", {
              detail: { instanceId, isOpen: true, isForeground: false, isMinimized: true },
            })
          );

          return {
            instances,
            foregroundInstanceId: nextForeground,
          };
        });
      },
      restoreInstance: (instanceId) => {
        set((state) => {
          const inst = state.instances[instanceId];
          if (!inst || !inst.isMinimized) return state;

          const instances = { ...state.instances };
          // Remove foreground from all others
          Object.keys(instances).forEach((id) => {
            instances[id] = { ...instances[id], isForeground: false };
          });
          // Restore and bring to foreground
          instances[instanceId] = { ...inst, isMinimized: false, isForeground: true };

          // Move to end of order
          const order = [
            ...state.instanceOrder.filter((id) => id !== instanceId),
            instanceId,
          ];

          window.dispatchEvent(
            new CustomEvent("instanceStateChange", {
              detail: { instanceId, isOpen: true, isForeground: true, isMinimized: false },
            })
          );

          return {
            instances,
            instanceOrder: order,
            foregroundInstanceId: instanceId,
          };
        });
      },
      updateInstanceTitle: (instanceId, title) => {
        set((state) => {
          const inst = state.instances[instanceId];
          if (!inst) return state;
          // Only update if displayTitle actually changed
          if (inst.displayTitle === title) return state;
          return {
            instances: {
              ...state.instances,
              [instanceId]: { ...inst, displayTitle: title },
            },
          };
        });
      },
      launchApp: (appId, initialData, title, multiWindow = false) => {
        const state = get();
        
        // Check if all instances of this app are minimized
        // If so, restore them instead of creating a new instance
        const appInstances = Object.values(state.instances).filter(
          (inst) => inst.appId === appId && inst.isOpen
        );
        
        if (appInstances.length > 0) {
          // Check if all instances are minimized
          const allMinimized = appInstances.every((inst) => inst.isMinimized);
          
          if (allMinimized) {
            // Restore all minimized instances
            let lastRestoredId: string | null = null;
            appInstances.forEach((inst) => {
              if (inst.isMinimized) {
                state.restoreInstance(inst.instanceId);
                lastRestoredId = inst.instanceId;
              }
            });
            
            // Bring the most recently restored instance to foreground
            if (lastRestoredId) {
              state.bringInstanceToForeground(lastRestoredId);
              // Update initialData if provided
              if (initialData) {
                set((s) => ({
                  instances: {
                    ...s.instances,
                    [lastRestoredId!]: {
                      ...s.instances[lastRestoredId!],
                      initialData,
                    },
                  },
                }));
              }
              return lastRestoredId;
            }
          }
        }
        
        const supportsMultiWindow =
          multiWindow ||
          appId === "textedit" ||
          appId === "finder" ||
          appId === "applet-viewer";
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
        // Core app/window state
        windowOrder: state.windowOrder,
        apps: state.apps,
        version: state.version,
        
        // AI model
        aiModel: state.aiModel,
        
        // Boot/version state
        isFirstBoot: state.isFirstBoot,
        macAppToastShown: state.macAppToastShown,
        lastSeenDesktopVersion: state.lastSeenDesktopVersion,
        ryOSVersion: state.ryOSVersion,
        ryOSBuildNumber: state.ryOSBuildNumber,
        ryOSBuildTime: state.ryOSBuildTime,
        
        // Recent items
        recentApps: state.recentApps,
        recentDocuments: state.recentDocuments,
        
        // Instance management
        instances: Object.fromEntries(
          Object.entries(state.instances)
            .filter(([, inst]) => inst.isOpen)
            .map(([id, inst]) => {
              // For applet-viewer, exclude content from initialData to prevent localStorage storage
              if (inst.appId === "applet-viewer" && inst.initialData) {
                const appletData = inst.initialData as { path?: string; content?: string; shareCode?: string; icon?: string; name?: string };
                return [id, {
                  ...inst,
                  initialData: {
                    ...appletData,
                    content: "", // Exclude content - it should be loaded from IndexedDB
                  },
                }];
              }
              return [id, inst];
            })
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
        // Mark all currently restored instances as coming from storage so we can
        // avoid user-only effects (e.g. window open sounds) during app load.
        Object.keys(state.instances || {}).forEach((id) => {
          const inst = state.instances[id];
          if (inst) inst.restoredFromStorage = true;
        });
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
                ? getMobileWindowSize(inst.appId)
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

// Preserve store across Vite HMR to prevent "split-brain" instances.
let useAppStore = createUseAppStore();
if (import.meta.hot) {
  const data = import.meta.hot.data as { useAppStore?: typeof useAppStore };
  if (data.useAppStore) {
    useAppStore = data.useAppStore;
  } else {
    data.useAppStore = useAppStore;
  }
}
export { useAppStore };

// Global helpers ---------------------------------------------------------------
export const clearAllAppStates = (): void => {
  try {
    localStorage.clear();
  } catch (e) {
    console.error("clearAllAppStates", e);
  }
};
