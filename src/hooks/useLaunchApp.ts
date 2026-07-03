import { useCallback } from "react";
import { useAppStore, LaunchOriginRect } from "@/stores/useAppStore";
import { AppId } from "@/config/appRegistry";
import { createClientLogger } from "@/utils/logger";

const log = createClientLogger("LaunchApp");

// Export the interface
export interface LaunchAppOptions {
  initialPath?: string;
  initialData?: unknown; // Add initialData field
  multiWindow?: boolean; // Add multiWindow flag
  launchOrigin?: LaunchOriginRect; // Position of icon that launched the app
}

export const useLaunchApp = () => {
  const launchAppInstance = useAppStore((state) => state.launchApp);
  const bringInstanceToForeground = useAppStore(
    (state) => state.bringInstanceToForeground
  );
  const restoreInstance = useAppStore((state) => state.restoreInstance);
  const updateInstanceInitialData = useAppStore(
    (state) => state.updateInstanceInitialData
  );

  const launchApp = useCallback(
    (appId: AppId, options?: LaunchAppOptions) => {
      log.debug("Launch event received", {
        appId,
        hasInitialPath: Boolean(options?.initialPath),
        hasInitialData: Boolean(options?.initialData),
        multiWindow: options?.multiWindow,
      });
      const { instances } = useAppStore.getState();

      // Convert initialPath to proper initialData for Finder
      let initialData = options?.initialData;
      if (appId === "finder" && options?.initialPath && !initialData) {
        initialData = { path: options.initialPath };
      }

      // Special handling for applet-viewer
      if (appId === "applet-viewer") {
        const appletInstances = Object.values(instances).filter(
          (inst) => inst.appId === "applet-viewer" && inst.isOpen
        );

        // If launching with content (initialData exists)
        if (initialData) {
          const data = initialData as {
            path?: string;
            content?: string;
            shareCode?: string;
            forceNewInstance?: boolean;
          };

          // Skip empty instance check if forceNewInstance is true
          if (!data.forceNewInstance) {
            // First, check if the same applet (by path or shareCode) is already open
            if (data.path || data.shareCode) {
              const existingInstance = appletInstances.find((inst) => {
                const instData = inst.initialData as
                  | { path?: string; content?: string; shareCode?: string }
                  | undefined;

                // Check by path if provided
                if (data.path && instData?.path === data.path) {
                  return true;
                }

                // Check by shareCode if provided
                if (data.shareCode && instData?.shareCode === data.shareCode) {
                  return true;
                }

                return false;
              });

              if (existingInstance) {
                // Same applet already open, bring it to foreground
                const identifier = data.path || data.shareCode;
                log.debug("Applet already open; bringing to foreground", {
                  identifierType: data.path ? "path" : "shareCode",
                  hasIdentifier: Boolean(identifier),
                  instanceId: existingInstance.instanceId,
                });
                bringInstanceToForeground(existingInstance.instanceId);
                // Refresh initialData so persisted instances (whose content was
                // stripped to "" for storage) pick up the freshly loaded content.
                if (data.content) {
                  updateInstanceInitialData(
                    existingInstance.instanceId,
                    initialData
                  );
                }
                return existingInstance.instanceId;
              }
              // If opening a specific applet that's not already open, create a new instance
              // (don't reuse empty instances for different applets)
            } else {
              // Opening applet store (no path, no shareCode) - can reuse empty instance
              const emptyInstance = appletInstances.find((inst) => {
                const instData = inst.initialData as
                  | { path?: string; content?: string; shareCode?: string }
                  | undefined;
                // Empty instance is one without path, content, or shareCode
                return (
                  !instData?.path &&
                  !instData?.content &&
                  !instData?.shareCode
                );
              });

              if (emptyInstance) {
                // Reuse the empty applet store instance
                log.debug("Reusing empty applet store instance", {
                  instanceId: emptyInstance.instanceId,
                });
                bringInstanceToForeground(emptyInstance.instanceId);
                return emptyInstance.instanceId;
              }
            }
          }
        } else {
          // Launching empty state - check if there's already an applet store window (empty instance)
          const appletStoreInstance = appletInstances.find((inst) => {
            const instData = inst.initialData as
              | { path?: string; content?: string; shareCode?: string }
              | undefined;
            // An applet store window is one without path, content, or shareCode
            return (
              !instData?.path &&
              !instData?.content &&
              !instData?.shareCode
            );
          });

          if (appletStoreInstance) {
            // Bring the applet store window to foreground
            log.debug("Existing applet store window found", {
              instanceId: appletStoreInstance.instanceId,
            });
            bringInstanceToForeground(appletStoreInstance.instanceId);
            return appletStoreInstance.instanceId;
          }

          // If no applet store window exists, create a new one
          // (fall through to the launchAppInstance call below)
          log.debug("No applet store window found; creating new one");
        }
      }

      // Check if all instances of this app are minimized
      // If so, restore them instead of creating a new instance
      const appInstances = Object.values(instances).filter(
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
              restoreInstance(inst.instanceId);
              lastRestoredId = inst.instanceId;
            }
          });

          // Bring the most recently restored instance to foreground
          if (lastRestoredId) {
            log.debug("Restored minimized app instances", {
              appId,
              foregroundInstanceId: lastRestoredId,
              instanceCount: appInstances.length,
            });
            bringInstanceToForeground(lastRestoredId);
            // Update initialData if provided (e.g. pre-fill commands from Spotlight)
            if (initialData) {
              updateInstanceInitialData(lastRestoredId, initialData);
            }
            return lastRestoredId;
          }
        }
      }

      // Always use multi-window for apps that support it
      const multiWindow =
        options?.multiWindow ||
        appId === "finder" ||
        appId === "textedit" ||
        appId === "preview" ||
        appId === "applet-viewer";

      // Use the new instance-based launch system
      const instanceId = launchAppInstance(
        appId,
        initialData,
        undefined,
        multiWindow,
        options?.launchOrigin
      );
      log.debug("Created app instance", { instanceId, appId, multiWindow });

      return instanceId;
    },
    [
      bringInstanceToForeground,
      launchAppInstance,
      restoreInstance,
      updateInstanceInitialData,
    ]
  );

  return launchApp;
};
