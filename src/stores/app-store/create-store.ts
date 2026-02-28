import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AppId, getWindowConfig, getMobileWindowSize } from "@/config/appRegistry";
import type { AppState } from "@/apps/base/types";
import type { AppInstance, AppStoreState } from "./types";
import { createInstanceSlice } from "./instance-slice";
import { createPreferencesSlice } from "./preferences-slice";
import { createRecentSlice } from "./recent-slice";

const CURRENT_APP_STORE_VERSION = 4;

export function createAppStore() {
  return create<AppStoreState>()(
    persist(
      (set, get) => ({
        version: CURRENT_APP_STORE_VERSION,
        ...createPreferencesSlice(set),
        ...createRecentSlice(set),
        ...createInstanceSlice(set, get),
      }),
      {
        name: "ryos:app-store",
        version: CURRENT_APP_STORE_VERSION,
        partialize: (state): Partial<AppStoreState> => ({
          version: state.version,
          aiModel: state.aiModel,
          isFirstBoot: state.isFirstBoot,
          macAppToastShown: state.macAppToastShown,
          lastSeenDesktopVersion: state.lastSeenDesktopVersion,
          ryOSVersion: state.ryOSVersion,
          ryOSBuildNumber: state.ryOSBuildNumber,
          ryOSBuildTime: state.ryOSBuildTime,
          recentApps: state.recentApps,
          recentDocuments: state.recentDocuments,
          instances: Object.fromEntries(
            Object.entries(state.instances)
              .filter(([, inst]) => inst.isOpen)
              .map(([id, inst]) => {
                const { launchOrigin: _, ...instWithoutLaunchOrigin } = inst;
                if (inst.appId === "applet-viewer" && inst.initialData) {
                  const appletData = inst.initialData as {
                    path?: string;
                    content?: string;
                    shareCode?: string;
                    icon?: string;
                    name?: string;
                  };
                  return [
                    id,
                    {
                      ...instWithoutLaunchOrigin,
                      initialData: {
                        ...appletData,
                        content: "",
                      },
                    },
                  ];
                }
                return [id, instWithoutLaunchOrigin];
              })
          ),
          instanceOrder: state.instanceOrder.filter((id) => state.instances[id]?.isOpen),
          foregroundInstanceId: state.foregroundInstanceId,
          nextInstanceId: state.nextInstanceId,
        }),
        migrate: (persisted: unknown, version: number) => {
          const prev = persisted as AppStoreState & {
            instanceStackOrder?: string[];
            instanceWindowOrder?: string[];
            instanceOrder?: string[];
            apps?: Record<string, AppState>;
            windowOrder?: string[];
          };
          console.log(
            "[AppStore] Migrating from",
            version,
            "to",
            CURRENT_APP_STORE_VERSION
          );
          if (version < 3) {
            const legacyStack: string[] | undefined = prev.instanceStackOrder;
            const legacyWindow: string[] | undefined = prev.instanceWindowOrder;
            prev.instanceOrder = (
              legacyStack && legacyStack.length ? legacyStack : legacyWindow || []
            ).filter((id: string) => prev.instances?.[id]);
            delete prev.instanceStackOrder;
            delete prev.instanceWindowOrder;
          }

          if (version < 4) {
            const hasLegacyApps =
              !!prev.apps && !!prev.windowOrder && prev.windowOrder.length > 0;
            const hasInstances =
              !!prev.instances && Object.keys(prev.instances).length > 0;

            if (hasLegacyApps && !hasInstances) {
              let idCounter = prev.nextInstanceId || 0;
              const instances: Record<string, AppInstance> = {};
              const order: string[] = [];
              let foreground: string | null = null;

              prev.windowOrder?.forEach((appId) => {
                const a = prev.apps?.[appId];
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
                  if (a.isForeground) foreground = instId;
                }
              });

              prev.instances = instances;
              prev.instanceOrder = order;
              prev.nextInstanceId = idCounter;
              prev.foregroundInstanceId =
                foreground || (order.length ? order[order.length - 1] : null);
            }

            delete prev.apps;
            delete prev.windowOrder;
          }

          if (!prev.instances) prev.instances = {};
          if (!prev.instanceOrder) prev.instanceOrder = [];
          if (prev.foregroundInstanceId === undefined) prev.foregroundInstanceId = null;
          if (!prev.nextInstanceId) prev.nextInstanceId = 0;

          prev.version = CURRENT_APP_STORE_VERSION;
          return prev;
        },
        onRehydrateStorage: () => (state) => {
          if (!state) return;
          if (state.instanceOrder && state.instances) {
            state.instanceOrder = state.instanceOrder.filter(
              (id: string) => state.instances[id]
            );
          }
          if (state.instances && Object.keys(state.instances).length) {
            const max = Math.max(
              ...Object.keys(state.instances).map((id) => parseInt(id, 10))
            );
            if (!isNaN(max) && max >= state.nextInstanceId)
              state.nextInstanceId = max + 1;
          }
          Object.keys(state.instances || {}).forEach((id) => {
            const inst = state.instances[id];
            if (!inst.createdAt) {
              const numericId = parseInt(id, 10);
              inst.createdAt = !isNaN(numericId) ? numericId : Date.now();
            }
            if (!inst.position || !inst.size) {
              const cfg = getWindowConfig(inst.appId);
              const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
              if (!inst.position)
                inst.position = { x: isMobile ? 0 : 16, y: isMobile ? 28 : 40 };
              if (!inst.size)
                inst.size = isMobile
                  ? getMobileWindowSize(inst.appId)
                  : cfg.defaultSize;
            }
          });
        },
      }
    )
  );
}
