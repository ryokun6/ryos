import { useAppStore } from "@/stores/useAppStore";
import { AppId } from "@/config/appRegistry";

// Export the interface
export interface LaunchAppOptions {
  initialPath?: string;
  initialData?: unknown; // Add initialData field
  multiWindow?: boolean; // Add multiWindow flag
}

export const useLaunchApp = () => {
  // Get the launch method from the store
  const launchAppInstance = useAppStore((state) => state.launchApp);

  const launchApp = (appId: AppId, options?: LaunchAppOptions) => {
    console.log(`[useLaunchApp] Launch event received for ${appId}`, options);

    // Convert initialPath to proper initialData for Finder
    let initialData = options?.initialData;
    if (appId === "finder" && options?.initialPath && !initialData) {
      initialData = { path: options.initialPath };
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
