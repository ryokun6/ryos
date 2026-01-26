import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AnyApp, AppState } from "./types";
import { MenuBar } from "@/components/layout/MenuBar";
import { Desktop } from "@/components/layout/Desktop";
import { Dock } from "@/components/layout/Dock";
import { ExposeView } from "@/components/layout/ExposeView";
import { getAppComponent, appRegistry } from "@/config/appRegistry";
import type { AppId } from "@/config/appRegistry";
import { useAppStoreShallow } from "@/stores/helpers";
import { extractCodeFromPath } from "@/utils/sharedUrl";
import { toast } from "sonner";
import { requestCloseWindow } from "@/utils/windowUtils";
import { useThemeStore } from "@/stores/useThemeStore";

interface AppManagerProps {
  apps: AnyApp[];
}

const BASE_Z_INDEX = 1;

export function AppManager({ apps }: AppManagerProps) {
  const { t } = useTranslation();

  // Instance-based state
  const {
    instances,
    instanceOrder,
    launchApp,
    bringInstanceToForeground,
    navigateToNextInstance,
    navigateToPreviousInstance,
    foregroundInstanceId,
    exposeMode,
  } = useAppStoreShallow((state) => ({
    instances: state.instances,
    instanceOrder: state.instanceOrder,
    launchApp: state.launchApp,
    bringInstanceToForeground: state.bringInstanceToForeground,
    navigateToNextInstance: state.navigateToNextInstance,
    navigateToPreviousInstance: state.navigateToPreviousInstance,
    foregroundInstanceId: state.foregroundInstanceId,
    exposeMode: state.exposeMode,
  }));

  // Get current theme to determine if we should show the desktop menubar
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  
  // For Mac/System7 themes, hide the desktop menubar when there's a foreground app
  // For XP/98, the menubar is actually a taskbar and should always show
  // Always show menubar in expose mode
  const hasForegroundApp = !!foregroundInstanceId;
  const showDesktopMenuBar = isXpTheme || !hasForegroundApp || exposeMode;

  const [isInitialMount, setIsInitialMount] = useState(true);
  const [isExposeViewOpen, setIsExposeViewOpen] = useState(false);


  // Create legacy-compatible appStates from instances for Desktop component
  // NOTE: There can be multiple open instances for the same appId. We need to
  // aggregate their state so that legacy consumers (e.g. Desktop)
  // still receive correct information. In particular, `isOpen` should be true
  // if ANY instance is open, and `isForeground` should reflect the foreground
  // instance. We also prefer the foreground instance for position/size data.

  const legacyAppStates = Object.values(instances).reduce(
    (acc, instance) => {
      const existing = acc[instance.appId];

      // Determine whether this instance should be the source of foreground /
      // positional data. We always keep foreground instance data if available.
      const shouldReplace =
        !existing || // first encounter
        (instance.isForeground && !existing.isForeground); // take foreground

      acc[instance.appId] = {
        // isOpen is true if any instance is open
        isOpen: (existing?.isOpen ?? false) || instance.isOpen,
        // isForeground true if this particular instance is foreground, or an
        // earlier one already marked foreground
        isForeground:
          (existing?.isForeground ?? false) || instance.isForeground,
        // For position / size / initialData, prefer the chosen instance
        position: shouldReplace ? instance.position : existing?.position,
        size: shouldReplace ? instance.size : existing?.size,
        initialData: shouldReplace
          ? instance.initialData
          : existing?.initialData,
      };

      return acc;
    },
    {} as { [appId: string]: AppState },
  );

  const getZIndexForInstance = (instanceId: string) => {
    const index = instanceOrder.indexOf(instanceId);
    if (index === -1) return BASE_Z_INDEX;
    return BASE_Z_INDEX + index + 1;
  };

  // Set isInitialMount to false after a short delay
  useEffect(() => {
    const timer = setTimeout(() => setIsInitialMount(false), 500);
    return () => clearTimeout(timer);
  }, []);

  // Process shared URLs and direct app launch paths
  useEffect(() => {
    const handleUrlNavigation = async () => {
      const path = window.location.pathname;
      console.log("[AppManager] Checking path:", path); // Keep this log for debugging

      const launchAppletViewer = () => {
        toast.info(t("common.loading.openingAppletStore"));

        setTimeout(() => {
          const event = new CustomEvent("launchApp", {
            detail: { appId: "applet-viewer" as AppId },
          });
          window.dispatchEvent(event);
          window.history.replaceState({}, "", "/");
        }, 100);
      };

      if (path === "/applet-viewer" || path === "/applet-viewer/") {
        launchAppletViewer();
      } else if (path.startsWith("/internet-explorer/")) {
        const shareCode = extractCodeFromPath(path);
        if (shareCode) {
          // Handle shared Internet Explorer URL - Pass code directly
          console.log("[AppManager] Detected IE share code:", shareCode);
          toast.info(t("common.loading.openingSharedIELink"));

          // Use setTimeout to ensure the event listener is ready
          setTimeout(() => {
            const event = new CustomEvent("launchApp", {
              detail: {
                appId: "internet-explorer",
                initialData: {
                  shareCode: shareCode,
                },
              },
            });
            window.dispatchEvent(event);
            console.log(
              "[AppManager] Dispatched launchApp event for IE share code.",
            );
          }, 0);

          window.history.replaceState({}, "", "/"); // Clean URL
        }
      } else if (path.startsWith("/applet-viewer/")) {
        const shareCode = extractCodeFromPath(path);
        if (shareCode) {
          // Handle shared Applet Viewer URL - Pass code directly
          console.log("[AppManager] Detected applet share code:", shareCode);
          toast.info(t("common.loading.openingSharedApplet"));

          // Use setTimeout to ensure the event listener is ready
          setTimeout(() => {
            const event = new CustomEvent("launchApp", {
              detail: {
                appId: "applet-viewer",
                initialData: {
                  shareCode: shareCode,
                  path: "", // Empty path for shared applets
                  content: "", // Will be fetched from API
                  icon: undefined, // Will be set from API response
                  name: undefined, // Will be set from API response
                },
              },
            });
            window.dispatchEvent(event);
            console.log(
              "[AppManager] Dispatched launchApp event for applet share code.",
            );
          }, 0);

          window.history.replaceState({}, "", "/"); // Clean URL
        } else {
          console.log(
            "[AppManager] No share code detected for applet viewer path, opening base app.",
          );
          launchAppletViewer();
        }
      } else if (path.startsWith("/ipod/")) {
        const videoId = path.substring("/ipod/".length);
        if (videoId) {
          console.log("[AppManager] Detected iPod videoId:", videoId);
          toast.info(t("common.loading.openingSharedIpodTrack"));
          setTimeout(() => {
            const event = new CustomEvent("launchApp", {
              detail: {
                appId: "ipod",
                initialData: { videoId },
              },
            });
            window.dispatchEvent(event);
            console.log(
              "[AppManager] Dispatched launchApp event for iPod videoId.",
            );
          }, 0);
          window.history.replaceState({}, "", "/"); // Clean URL
        }
      } else if (path.startsWith("/listen/")) {
        const sessionId = path.substring("/listen/".length).split("?")[0]; // Remove query params from sessionId
        
        if (sessionId) {
          console.log("[AppManager] Detected listen session:", sessionId, "app: karaoke");
          toast.info("Opening live session...");
          // Use 100ms delay to ensure event listener is ready after store hydration
          setTimeout(() => {
            const event = new CustomEvent("launchApp", {
              detail: {
                appId: "karaoke",
                initialData: { listenSessionId: sessionId },
              },
            });
            window.dispatchEvent(event);
            console.log(
              `[AppManager] Dispatched launchApp event for listen session in karaoke.`,
            );
          }, 100);
          window.history.replaceState({}, "", "/"); // Clean URL
        }
      } else if (path.startsWith("/karaoke/")) {
        const videoId = path.substring("/karaoke/".length);
        if (videoId) {
          console.log("[AppManager] Detected Karaoke videoId:", videoId);
          toast.info(t("common.loading.openingSharedKaraokeTrack"));
          setTimeout(() => {
            const event = new CustomEvent("launchApp", {
              detail: {
                appId: "karaoke",
                initialData: { videoId },
              },
            });
            window.dispatchEvent(event);
            console.log(
              "[AppManager] Dispatched launchApp event for Karaoke videoId.",
            );
          }, 0);
          window.history.replaceState({}, "", "/"); // Clean URL
        }
      } else if (path.startsWith("/videos/")) {
        const videoId = path.substring("/videos/".length);
        if (videoId) {
          console.log("[AppManager] Detected Videos videoId:", videoId);
          toast.info(t("common.loading.openingSharedVideo"));
          setTimeout(() => {
            const event = new CustomEvent("launchApp", {
              detail: {
                appId: "videos",
                initialData: { videoId },
              },
            });
            window.dispatchEvent(event);
            console.log(
              "[AppManager] Dispatched launchApp event for Videos videoId.",
            );
          }, 0);
          window.history.replaceState({}, "", "/"); // Clean URL
        }
      } else if (path.startsWith("/") && path.length > 1) {
        // Handle direct app launch path (e.g., /soundboard)
        const potentialAppId = path.substring(1) as AppId;

        // Check if it's a valid app ID from the registry
        if (potentialAppId in appRegistry) {
          const appName = appRegistry[potentialAppId]?.name || potentialAppId;
          toast.info(`Launching ${appName}...`);

          // Use a slight delay to ensure the app launch event is caught
          setTimeout(() => {
            const event = new CustomEvent("launchApp", {
              detail: { appId: potentialAppId },
            });
            window.dispatchEvent(event);
            window.history.replaceState({}, "", "/"); // Clean URL
          }, 100); // Small delay might help robustness
        } else {
          // Optional: Handle invalid app paths if necessary, or just ignore
          // console.log(`Path ${path} does not correspond to a known app.`);
          // Maybe redirect to root or show a 404 within the app context
          // For now, just clean the URL if it wasn't a valid app path or IE code
          // Update condition: Only clean if it's not a handled share path (we handle cleaning above)
          // Update condition: Also check for ipod, videos, and applet-viewer paths
          if (
            !path.startsWith("/internet-explorer/") &&
            !path.startsWith("/applet-viewer/") &&
            !path.startsWith("/ipod/") &&
            !path.startsWith("/karaoke/") &&
            !path.startsWith("/videos/")
          ) {
            window.history.replaceState({}, "", "/");
          }
        }
      }
    };

    // Process URL on initial load
    handleUrlNavigation();
  }, []); // Run only once on mount

  // Listen for app launch events (e.g., from Finder, URL handling)
  useEffect(() => {
    const handleAppLaunch = (
      event: CustomEvent<{
        appId: AppId;
        initialPath?: string;
        initialData?: unknown;
      }>,
    ) => {
      const { appId, initialPath, initialData } = event.detail;

      console.log(
        `[AppManager] Launch event received for ${appId}`,
        event.detail,
      );

      // Check if there's an existing instance before launching
      const existingInstance = Object.values(instances).find(
        (instance) => instance.appId === appId && instance.isOpen,
      );

      // Use instance system
      const instanceId = launchApp(appId, initialData);
      console.log(
        `[AppManager] Launched instance ${instanceId} for app ${appId}`,
      );

      // Store initialPath if provided
      if (initialPath) {
        localStorage.setItem(`ryos:app:${appId}:initial-path`, initialPath);
      }

      // If there was an existing instance and we have initialData, dispatch updateApp event
      if (existingInstance && initialData) {
        console.log(
          `[AppManager] Dispatching updateApp event for existing ${appId} instance with initialData:`,
          initialData,
        );
        const updateEvent = new CustomEvent("updateApp", {
          detail: { appId, initialData },
        });
        window.dispatchEvent(updateEvent);
      }
    };

    window.addEventListener("launchApp", handleAppLaunch as EventListener);
    return () => {
      window.removeEventListener("launchApp", handleAppLaunch as EventListener);
    };
  }, [instances, launchApp]);

  // Listen for expose view toggle events (e.g., from keyboard shortcut, dock menu)
  useEffect(() => {
    const handleExposeToggle = () => {
      setIsExposeViewOpen((prev) => !prev);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // F3 key to toggle Expose view (Mission Control)
      if (e.key === "F3" || (e.key === "f" && e.metaKey)) {
        e.preventDefault();
        setIsExposeViewOpen((prev) => !prev);
      }
    };

    window.addEventListener("toggleExposeView", handleExposeToggle);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("toggleExposeView", handleExposeToggle);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <>
      {/* MenuBar: For XP/Win98, this is the taskbar (always shown).
          For Mac/System7, hide when a foreground app is loaded since 
          the app renders its own MenuBar. */}
      {showDesktopMenuBar && <MenuBar />}
      {/* macOS Dock */}
      <Dock />
      {/* App Instances */}
      {Object.values(instances).map((instance) => {
        if (!instance.isOpen) return null;

        const appId = instance.appId as AppId;
        const zIndex = getZIndexForInstance(instance.instanceId);
        const AppComponent = getAppComponent(appId);

        return (
          <div
            key={instance.instanceId}
            style={{ zIndex: exposeMode ? 9999 : zIndex }}
            className="absolute inset-x-0 md:inset-x-auto w-full md:w-auto"
            role="presentation"
            onMouseDown={() => {
              if (!instance.isForeground && !exposeMode) {
                bringInstanceToForeground(instance.instanceId);
              }
            }}
            onTouchStart={() => {
              if (!instance.isForeground && !exposeMode) {
                bringInstanceToForeground(instance.instanceId);
              }
            }}
          >
            <AppComponent
              isWindowOpen={instance.isOpen}
              isForeground={exposeMode ? false : instance.isForeground}
              onClose={() => requestCloseWindow(instance.instanceId)}
              className="pointer-events-auto"
              helpItems={apps.find((app) => app.id === appId)?.helpItems}
              skipInitialSound={isInitialMount}
              // @ts-expect-error - Dynamic component system with different initialData types per app
              initialData={instance.initialData}
              instanceId={instance.instanceId}
              title={instance.title}
              onNavigateNext={() => navigateToNextInstance(instance.instanceId)}
              onNavigatePrevious={() =>
                navigateToPreviousInstance(instance.instanceId)
              }
            />
          </div>
        );
      })}

      <Desktop
        apps={apps}
        toggleApp={(appId, initialData, launchOrigin) => {
          launchApp(appId, initialData, undefined, false, launchOrigin);
        }}
        appStates={{ windowOrder: instanceOrder, apps: legacyAppStates }}
      />

      {/* Expose View (Mission Control) - Backdrop and labels */}
      <ExposeView
        isOpen={isExposeViewOpen}
        onClose={() => setIsExposeViewOpen(false)}
      />
    </>
  );
}
