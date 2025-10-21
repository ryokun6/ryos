import { useAppStore } from "@/stores/useAppStore";
import { AppId } from "@/config/appRegistry";

// Export the interface
export interface LaunchAppOptions {
  initialPath?: string;
  initialData?: unknown; // Add initialData field
  multiWindow?: boolean; // Add multiWindow flag
}

export const useLaunchApp = () => {
  // Get the launch method and instances from the store
  const launchAppInstance = useAppStore((state) => state.launchApp);
  const instances = useAppStore((state) => state.instances);
  const bringInstanceToForeground = useAppStore(
    (state) => state.bringInstanceToForeground
  );
  const updateInstanceInitialData = useAppStore(
    (state) => state.updateInstanceInitialData
  );

  const launchApp = (appId: AppId, options?: LaunchAppOptions) => {
    console.log(`[useLaunchApp] Launch event received for ${appId}`, options);

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
        // Check for empty applet viewer instance (no content)
        const emptyInstance = appletInstances.find((inst) => {
          const data = inst.initialData as
            | { path?: string; content?: string }
            | undefined;
          return !data?.content || data.content.trim().length === 0;
        });

        if (emptyInstance) {
          // Swap the empty instance with the new content
          console.log(
            `[useLaunchApp] Found empty applet viewer instance ${emptyInstance.instanceId}, updating with content`
          );
          updateInstanceInitialData(emptyInstance.instanceId, initialData);
          bringInstanceToForeground(emptyInstance.instanceId);
          return emptyInstance.instanceId;
        }
      } else {
        // Launching empty state - don't launch if instances already exist
        if (appletInstances.length > 0) {
          console.log(
            `[useLaunchApp] Applet viewer instances already exist, bringing most recent to foreground instead of launching empty state`
          );
          // Bring the most recent instance to foreground
          const mostRecent = appletInstances[appletInstances.length - 1];
          bringInstanceToForeground(mostRecent.instanceId);
          return mostRecent.instanceId;
        }
      }
    }

    // Always use multi-window for apps that support it
    const multiWindow =
      options?.multiWindow ||
      appId === "finder" ||
      appId === "textedit" ||
      appId === "applet-viewer";

    // Use the new instance-based launch system
    const instanceId = launchAppInstance(
      appId,
      initialData,
      undefined,
      multiWindow
    );
    console.log(
      `[useLaunchApp] Created instance ${instanceId} for app ${appId} with multiWindow: ${multiWindow}`
    );

    return instanceId;
  };

  return launchApp;
};
