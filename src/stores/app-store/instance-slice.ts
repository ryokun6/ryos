import { AppId, getWindowConfig, getMobileWindowSize } from "@/config/appRegistry";
import { useAppletStore } from "@/stores/useAppletStore";
import { track } from "@vercel/analytics";
import { APP_ANALYTICS } from "@/utils/analytics";
import type { AppStoreState, LaunchOriginRect } from "./types";
import { getForegroundInstance, getInstancesByAppId } from "./selectors";

export function createInstanceSlice(
  set: (partial: Partial<AppStoreState> | ((state: AppStoreState) => Partial<AppStoreState>)) => void,
  get: () => AppStoreState
): Pick<
  AppStoreState,
  | "instances"
  | "instanceOrder"
  | "foregroundInstanceId"
  | "nextInstanceId"
  | "createAppInstance"
  | "markInstanceAsLoaded"
  | "closeAppInstance"
  | "bringInstanceToForeground"
  | "updateInstanceWindowState"
  | "getInstancesByAppId"
  | "getForegroundInstance"
  | "navigateToNextInstance"
  | "navigateToPreviousInstance"
  | "minimizeInstance"
  | "restoreInstance"
  | "updateInstanceTitle"
  | "launchApp"
  | "clearInstanceInitialData"
  | "updateInstanceInitialData"
  | "_debugCheckInstanceIntegrity"
> {
  return {
    instances: {},
    instanceOrder: [],
    foregroundInstanceId: null,
    nextInstanceId: 0,

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

    createAppInstance: (appId: AppId, initialData?: unknown, title?: string, launchOrigin?: LaunchOriginRect) => {
      let createdId = "";
      set((state) => {
        const nextNum = state.nextInstanceId + 1;
        createdId = nextNum.toString();
        const openInstances = state.instanceOrder.length;
        const baseOffset = 16;
        const offsetStep = 32;
        const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
        const position = {
          x: isMobile ? 0 : baseOffset + openInstances * offsetStep,
          y: isMobile ? 28 + openInstances * offsetStep : 40 + openInstances * 20,
        };
        const cfg = getWindowConfig(appId);
        let size = isMobile ? getMobileWindowSize(appId) : cfg.defaultSize;

        if (appId === "applet-viewer") {
          try {
            const path = (initialData as { path?: string } | undefined)?.path;
            if (path) {
              const saved = useAppletStore.getState().getAppletWindowSize(path);
              if (saved) size = saved;
            }
          } catch {
            // ignore and fall back to default size
          }
        }

        const isLazy = appId !== "finder";

        const instances = {
          ...state.instances,
          [createdId]: {
            instanceId: createdId,
            appId,
            isOpen: true,
            isForeground: !isLazy,
            isLoading: isLazy,
            initialData,
            title,
            position,
            size,
            createdAt: Date.now(),
            launchOrigin,
          },
        } as typeof state.instances;

        if (!isLazy) {
          Object.keys(instances).forEach((id) => {
            if (id !== createdId) instances[id] = { ...instances[id], isForeground: false };
          });
        }

        const instanceOrder = [...state.instanceOrder.filter((id) => id !== createdId), createdId];
        return {
          instances,
          instanceOrder,
          foregroundInstanceId: isLazy ? state.foregroundInstanceId : createdId,
          nextInstanceId: nextNum,
        };
      });
      if (createdId) {
        get().addRecentApp(appId);

        const dataWithPath = initialData as
          | { path?: string; name?: string; icon?: string; isDirectory?: boolean }
          | undefined;
        const isFolder =
          appId === "finder" ||
          dataWithPath?.isDirectory === true ||
          dataWithPath?.path === "/" ||
          dataWithPath?.path === "/Applications" ||
          dataWithPath?.path === "/Documents" ||
          dataWithPath?.path === "/Desktop" ||
          dataWithPath?.path === "/Applets" ||
          dataWithPath?.path === "/Trash";

        if (dataWithPath?.path && !isFolder) {
          const fileName =
            dataWithPath.name || dataWithPath.path.split("/").pop() || dataWithPath.path;
          get().addRecentDocument(dataWithPath.path, fileName, appId, dataWithPath.icon);
        }

        window.dispatchEvent(
          new CustomEvent("instanceStateChange", {
            detail: {
              instanceId: createdId,
              isOpen: true,
              isForeground: appId === "finder",
            },
          })
        );
        track(APP_ANALYTICS.APP_LAUNCH, { appId });
      }
      return createdId;
    },

    markInstanceAsLoaded: (instanceId: string) => {
      set((state) => {
        const inst = state.instances[instanceId];
        if (!inst || !inst.isLoading) return state;

        const instances = { ...state.instances };
        Object.keys(instances).forEach((id) => {
          instances[id] = { ...instances[id], isForeground: id === instanceId };
        });

        instances[instanceId] = {
          ...inst,
          isLoading: false,
          isForeground: true,
        };

        const order = [...state.instanceOrder.filter((id) => id !== instanceId), instanceId];

        window.dispatchEvent(
          new CustomEvent("instanceStateChange", {
            detail: { instanceId, isOpen: true, isForeground: true },
          })
        );

        return {
          instances,
          instanceOrder: order,
          foregroundInstanceId: instanceId,
        };
      });
    },

    closeAppInstance: (instanceId: string) => {
      set((state) => {
        const inst = state.instances[instanceId];
        if (!inst?.isOpen) return state;
        const instances = { ...state.instances };
        delete instances[instanceId];
        let order = state.instanceOrder.filter((id) => id !== instanceId);
        let nextForeground: string | null = null;
        for (let i = order.length - 1; i >= 0; i--) {
          const id = order[i];
          if (instances[id]?.appId === inst.appId && instances[id].isOpen) {
            nextForeground = id;
            break;
          }
        }
        if (!nextForeground && order.length) nextForeground = order[order.length - 1];
        Object.keys(instances).forEach((id) => {
          instances[id] = { ...instances[id], isForeground: id === nextForeground };
        });
        if (nextForeground) {
          order = [...order.filter((id) => id !== nextForeground), nextForeground];
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

    bringInstanceToForeground: (instanceId: string) => {
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
            instances[id] = { ...instances[id], isForeground: id === instanceId };
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

    updateInstanceWindowState: (
      instanceId: string,
      position: { x: number; y: number },
      size: { width: number; height: number }
    ) =>
      set((state) => ({
        instances: {
          ...state.instances,
          [instanceId]: { ...state.instances[instanceId], position, size },
        },
      })),

    getInstancesByAppId: (appId: AppId) => getInstancesByAppId(get(), appId),
    getForegroundInstance: () => getForegroundInstance(get()),

    navigateToNextInstance: (currentId: string) => {
      const { instanceOrder } = get();
      if (instanceOrder.length <= 1) return;
      const idx = instanceOrder.indexOf(currentId);
      if (idx === -1) return;
      const next = instanceOrder[(idx + 1) % instanceOrder.length];
      get().bringInstanceToForeground(next);
    },
    navigateToPreviousInstance: (currentId: string) => {
      const { instanceOrder } = get();
      if (instanceOrder.length <= 1) return;
      const idx = instanceOrder.indexOf(currentId);
      if (idx === -1) return;
      const prev = (idx - 1 + instanceOrder.length) % instanceOrder.length;
      get().bringInstanceToForeground(instanceOrder[prev]);
    },

    minimizeInstance: (instanceId: string) => {
      set((state) => {
        const inst = state.instances[instanceId];
        if (!inst || inst.isMinimized) return state;

        const instances = { ...state.instances };
        instances[instanceId] = { ...inst, isMinimized: true, isForeground: false };

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

    restoreInstance: (instanceId: string) => {
      set((state) => {
        const inst = state.instances[instanceId];
        if (!inst || !inst.isMinimized) return state;

        const instances = { ...state.instances };
        Object.keys(instances).forEach((id) => {
          instances[id] = { ...instances[id], isForeground: false };
        });
        instances[instanceId] = { ...inst, isMinimized: false, isForeground: true };

        const order = [...state.instanceOrder.filter((id) => id !== instanceId), instanceId];

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

    updateInstanceTitle: (instanceId: string, title: string) => {
      set((state) => {
        const inst = state.instances[instanceId];
        if (!inst) return state;
        if (inst.displayTitle === title) return state;
        return {
          instances: {
            ...state.instances,
            [instanceId]: { ...inst, displayTitle: title },
          },
        };
      });
    },

    launchApp: (
      appId: AppId,
      initialData?: unknown,
      title?: string,
      multiWindow = false,
      launchOrigin?: LaunchOriginRect
    ) => {
      const state = get();

      const appInstances = Object.values(state.instances).filter(
        (inst) => inst.appId === appId && inst.isOpen
      );

      if (appInstances.length > 0) {
        const allMinimized = appInstances.every((inst) => inst.isMinimized);

        if (allMinimized) {
          let lastRestoredId: string | null = null;
          appInstances.forEach((inst) => {
            if (inst.isMinimized) {
              state.restoreInstance(inst.instanceId);
              lastRestoredId = inst.instanceId;
            }
          });

          if (lastRestoredId) {
            state.bringInstanceToForeground(lastRestoredId);
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
      return state.createAppInstance(appId, initialData, title, launchOrigin);
    },

    _debugCheckInstanceIntegrity: () => {
      set((state) => {
        const openIds = Object.values(state.instances)
          .filter((i) => i.isOpen)
          .map((i) => i.instanceId);
        const filtered = state.instanceOrder.filter((id) => openIds.includes(id));
        const missing = openIds.filter((id) => !filtered.includes(id));
        if (!missing.length && filtered.length === state.instanceOrder.length) return state;
        return { instanceOrder: [...filtered, ...missing] };
      });
    },
  };
}
