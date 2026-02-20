import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AnyApp } from "./types";
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
import { SpotlightSearch } from "@/components/layout/SpotlightSearch";
import { AppSwitcher } from "@/components/layout/AppSwitcher";
import type { SwitcherApp } from "@/components/layout/AppSwitcher";

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
    minimizeInstance,
    restoreInstance,
    foregroundInstanceId,
    exposeMode,
  } = useAppStoreShallow((state) => ({
    instances: state.instances,
    instanceOrder: state.instanceOrder,
    launchApp: state.launchApp,
    bringInstanceToForeground: state.bringInstanceToForeground,
    navigateToNextInstance: state.navigateToNextInstance,
    navigateToPreviousInstance: state.navigateToPreviousInstance,
    minimizeInstance: state.minimizeInstance,
    restoreInstance: state.restoreInstance,
    foregroundInstanceId: state.foregroundInstanceId,
    exposeMode: state.exposeMode,
  }));

  // Get current theme to determine if we should show the desktop menubar
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98" || currentTheme === "win7";
  
  // For Mac/System7 themes, hide the desktop menubar when there's a foreground app
  // For XP/98, the menubar is actually a taskbar and should always show
  // Always show menubar in expose mode
  const hasForegroundApp = !!foregroundInstanceId;
  const showDesktopMenuBar = isXpTheme || !hasForegroundApp || exposeMode;

  const [isInitialMount, setIsInitialMount] = useState(true);
  const [isExposeViewOpen, setIsExposeViewOpen] = useState(false);

  // App switcher state
  const [switcherVisible, setSwitcherVisible] = useState(false);
  const [switcherApps, setSwitcherApps] = useState<SwitcherApp[]>([]);
  const [switcherIndex, setSwitcherIndex] = useState(0);

  // Refs for stable event listener closures
  const instancesRef = useRef(instances);
  const instanceOrderRef = useRef(instanceOrder);
  const launchAppRef = useRef(launchApp);
  const foregroundInstanceIdRef = useRef(foregroundInstanceId);
  const minimizeInstanceRef = useRef(minimizeInstance);
  const restoreInstanceRef = useRef(restoreInstance);
  const bringInstanceToForegroundRef = useRef(bringInstanceToForeground);
  const navigateToNextInstanceRef = useRef(navigateToNextInstance);
  const navigateToPreviousInstanceRef = useRef(navigateToPreviousInstance);
  // Refs that mirror switcher state for use inside event handlers
  const switcherVisibleRef = useRef(false);
  const switcherAppsRef = useRef<SwitcherApp[]>([]);
  const switcherIndexRef = useRef(0);

  useEffect(() => {
    instancesRef.current = instances;
  }, [instances]);

  useEffect(() => {
    instanceOrderRef.current = instanceOrder;
  }, [instanceOrder]);

  useEffect(() => {
    launchAppRef.current = launchApp;
  }, [launchApp]);

  useEffect(() => {
    foregroundInstanceIdRef.current = foregroundInstanceId;
  }, [foregroundInstanceId]);

  useEffect(() => {
    minimizeInstanceRef.current = minimizeInstance;
  }, [minimizeInstance]);

  useEffect(() => {
    restoreInstanceRef.current = restoreInstance;
  }, [restoreInstance]);

  useEffect(() => {
    bringInstanceToForegroundRef.current = bringInstanceToForeground;
  }, [bringInstanceToForeground]);

  useEffect(() => {
    navigateToNextInstanceRef.current = navigateToNextInstance;
  }, [navigateToNextInstance]);

  useEffect(() => {
    navigateToPreviousInstanceRef.current = navigateToPreviousInstance;
  }, [navigateToPreviousInstance]);


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
          }, 0);

          window.history.replaceState({}, "", "/"); // Clean URL
        }
      } else if (path.startsWith("/applet-viewer/")) {
        const shareCode = extractCodeFromPath(path);
        if (shareCode) {
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
          }, 0);

          window.history.replaceState({}, "", "/"); // Clean URL
        } else {
          launchAppletViewer();
        }
      } else if (path.startsWith("/ipod/")) {
        const videoId = path.substring("/ipod/".length);
        if (videoId) {
          toast.info(t("common.loading.openingSharedIpodTrack"));
          setTimeout(() => {
            const event = new CustomEvent("launchApp", {
              detail: {
                appId: "ipod",
                initialData: { videoId },
              },
            });
            window.dispatchEvent(event);
          }, 0);
          window.history.replaceState({}, "", "/"); // Clean URL
        }
      } else if (path.startsWith("/listen/")) {
        const sessionId = path.substring("/listen/".length).split("?")[0]; // Remove query params from sessionId
        
        if (sessionId) {
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
          }, 100);
          window.history.replaceState({}, "", "/"); // Clean URL
        }
      } else if (path.startsWith("/karaoke/")) {
        const videoId = path.substring("/karaoke/".length);
        if (videoId) {
          toast.info(t("common.loading.openingSharedKaraokeTrack"));
          setTimeout(() => {
            const event = new CustomEvent("launchApp", {
              detail: {
                appId: "karaoke",
                initialData: { videoId },
              },
            });
            window.dispatchEvent(event);
          }, 0);
          window.history.replaceState({}, "", "/"); // Clean URL
        }
      } else if (path.startsWith("/videos/")) {
        const videoId = path.substring("/videos/".length);
        if (videoId) {
          toast.info(t("common.loading.openingSharedVideo"));
          setTimeout(() => {
            const event = new CustomEvent("launchApp", {
              detail: {
                appId: "videos",
                initialData: { videoId },
              },
            });
            window.dispatchEvent(event);
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
  }, [t]); // Run only once on mount (except locale changes)

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

      // Check if there's an existing instance before launching
      const existingInstance = Object.values(instancesRef.current).find(
        (instance) => instance.appId === appId && instance.isOpen,
      );

      // Use instance system
      const instanceId = launchAppRef.current(appId, initialData);

      // Store initialPath if provided
      if (initialPath) {
        localStorage.setItem(`ryos:app:${appId}:initial-path`, initialPath);
      }

      // If there was an existing instance and we have initialData, dispatch updateApp event
      if (
        existingInstance &&
        initialData &&
        instanceId === existingInstance.instanceId
      ) {
        const updateEvent = new CustomEvent("updateApp", {
          detail: { appId, instanceId, initialData },
        });
        window.dispatchEvent(updateEvent);
      }
    };

    window.addEventListener("launchApp", handleAppLaunch as EventListener);
    return () => {
      window.removeEventListener("launchApp", handleAppLaunch as EventListener);
    };
  }, []);

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
      // ⌘+Space / Ctrl+Space to toggle Spotlight Search
      if (e.key === " " && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        // Close Expose if open before toggling Spotlight
        setIsExposeViewOpen(false);
        window.dispatchEvent(new CustomEvent("toggleSpotlight"));
      }
    };

    // Close Expose when Spotlight opens via any trigger (icon click, Start Menu "Run...")
    const handleSpotlightToggle = () => {
      setIsExposeViewOpen(false);
    };

    window.addEventListener("toggleExposeView", handleExposeToggle);
    window.addEventListener("toggleSpotlight", handleSpotlightToggle);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("toggleExposeView", handleExposeToggle);
      window.removeEventListener("toggleSpotlight", handleSpotlightToggle);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Global macOS-style window management and app switcher keyboard shortcuts
  useEffect(() => {
    const buildMruApps = (): SwitcherApp[] => {
      const insts = instancesRef.current;
      const order = instanceOrderRef.current;
      const seen = new Set<string>();
      const result: SwitcherApp[] = [];
      // instanceOrder end = most recently used
      for (let i = order.length - 1; i >= 0; i--) {
        const inst = insts[order[i]];
        if (inst?.isOpen && !seen.has(inst.appId)) {
          seen.add(inst.appId);
          result.push({ appId: inst.appId as AppId, instanceId: inst.instanceId });
        }
      }
      return result;
    };

    const commitSwitcher = () => {
      if (!switcherVisibleRef.current) return;
      const apps = switcherAppsRef.current;
      if (apps.length === 0) {
        switcherVisibleRef.current = false;
        switcherIndexRef.current = 0;
        switcherAppsRef.current = [];
        setSwitcherVisible(false);
        setSwitcherIndex(0);
        setSwitcherApps([]);
        return;
      }

      const index =
        ((switcherIndexRef.current % apps.length) + apps.length) % apps.length;
      const selected = apps[index];
      if (selected) {
        const insts = instancesRef.current;
        const order = instanceOrderRef.current;
        // Find most recent non-minimized instance of selected app
        let targetId: string | null = null;
        for (let i = order.length - 1; i >= 0; i--) {
          const inst = insts[order[i]];
          if (inst?.isOpen && !inst.isMinimized && inst.appId === selected.appId) {
            targetId = inst.instanceId;
            break;
          }
        }
        // Fall back to restoring most recent minimized instance
        if (!targetId) {
          for (let i = order.length - 1; i >= 0; i--) {
            const inst = insts[order[i]];
            if (inst?.isOpen && inst.appId === selected.appId) {
              restoreInstanceRef.current(inst.instanceId);
              targetId = inst.instanceId;
              break;
            }
          }
        }
        if (targetId) {
          bringInstanceToForegroundRef.current(targetId);
        }
      }
      switcherVisibleRef.current = false;
      switcherIndexRef.current = 0;
      switcherAppsRef.current = [];
      setSwitcherVisible(false);
      setSwitcherIndex(0);
      setSwitcherApps([]);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Use Alt/Option as the modifier for window management shortcuts.
      // ⌘/Ctrl shortcuts (⌘W, ⌘M, ⌘H, ⌘Tab) are captured by the browser or
      // OS before JavaScript sees them and cannot be overridden in a web app.
      // Alt/Option key combos are not intercepted on macOS or Windows for these keys.
      //
      // IMPORTANT: We use e.code (physical key position) instead of e.key for
      // letter checks because on macOS, Option+letter produces a Unicode character
      // (e.g. Option+W → "∑", Option+M → "µ") so e.key never equals "w" or "m".
      // e.code is always the physical key name regardless of modifiers.
      if (!e.altKey) return;

      const fgId = foregroundInstanceIdRef.current;

      // Alt+Space — toggle Spotlight Search
      if (e.code === "Space") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("toggleSpotlight"));
        return;
      }

      // Alt+W — close the foreground window
      if (e.code === "KeyW" && !e.shiftKey) {
        if (fgId) {
          e.preventDefault();
          requestCloseWindow(fgId);
        }
        return;
      }

      // Alt+M — minimize the foreground window
      if (e.code === "KeyM" && !e.shiftKey) {
        if (fgId) {
          e.preventDefault();
          minimizeInstanceRef.current(fgId);
        }
        return;
      }

      // Alt+Shift+H — hide others (minimize all non-foreground windows)
      if (e.code === "KeyH" && e.shiftKey) {
        e.preventDefault();
        const insts = instancesRef.current;
        Object.values(insts).forEach((inst) => {
          if (inst.isOpen && !inst.isMinimized && inst.instanceId !== fgId) {
            minimizeInstanceRef.current(inst.instanceId);
          }
        });
        return;
      }

      // Alt+H — hide current app (minimize all windows of foreground appId)
      if (e.code === "KeyH" && !e.shiftKey) {
        e.preventDefault();
        const insts = instancesRef.current;
        const fgInst = fgId ? insts[fgId] : null;
        if (fgInst) {
          const appId = fgInst.appId;
          Object.values(insts).forEach((inst) => {
            if (inst.isOpen && !inst.isMinimized && inst.appId === appId) {
              minimizeInstanceRef.current(inst.instanceId);
            }
          });
        }
        return;
      }

      // Alt+` — cycle to next window
      if (e.code === "Backquote" && !e.shiftKey) {
        e.preventDefault();
        if (fgId) navigateToNextInstanceRef.current(fgId);
        return;
      }

      // Alt+Shift+` — cycle to previous window
      if (e.code === "Backquote" && e.shiftKey) {
        e.preventDefault();
        if (fgId) navigateToPreviousInstanceRef.current(fgId);
        return;
      }

      // Alt+Tab / Alt+Shift+Tab — app switcher
      // Note: works on macOS (Option+Tab is not captured by the OS or browser).
      // On Windows, Alt+Tab is captured by the OS and will not reach here.
      if (e.code === "Tab") {
        e.preventDefault();
        if (!switcherVisibleRef.current) {
          // First press — build list and show switcher
          const mruApps = buildMruApps();
          if (mruApps.length === 0) return;
          switcherAppsRef.current = mruApps;
          setSwitcherApps(mruApps);
          switcherVisibleRef.current = true;
          setSwitcherVisible(true);
          const startIndex =
            ((e.shiftKey ? -1 : 1) + mruApps.length) % mruApps.length;
          switcherIndexRef.current = startIndex;
          setSwitcherIndex(startIndex);
        } else {
          // Subsequent press — cycle selection
          const len = switcherAppsRef.current.length;
          const cur = switcherIndexRef.current;
          const next = e.shiftKey ? (cur - 1 + len) % len : (cur + 1) % len;
          switcherIndexRef.current = next;
          setSwitcherIndex(next);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Commit app switcher selection when the Alt/Option key is released
      if (e.key === "Alt") {
        commitSwitcher();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
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
        if (exposeMode && instance.appId === "stickies") return null;

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
      />

      {/* Spotlight Search */}
      <SpotlightSearch />

      {/* Expose View (Mission Control) - Backdrop and labels */}
      <ExposeView
        isOpen={isExposeViewOpen}
        onClose={() => setIsExposeViewOpen(false)}
      />

      {/* ⌘Tab App Switcher */}
      <AppSwitcher
        isVisible={switcherVisible}
        apps={switcherApps}
        selectedIndex={switcherIndex}
      />
    </>
  );
}
