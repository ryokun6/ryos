import { AppManager } from "./apps/base/AppManager";
import { appRegistry } from "./config/appRegistry";
import { useEffect, useMemo, useReducer, useCallback } from "react";
import { applyDisplayMode } from "./utils/displayMode";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";
import { useAppStoreShallow } from "@/stores/useAppStore";
import { useDisplaySettingsStoreShallow } from "@/stores/useDisplaySettingsStore";
import { BootScreen } from "./components/dialogs/BootScreen";
import { getNextBootMessage, clearNextBootMessage, isBootDebugMode } from "./utils/bootMessage";
import { AnyApp } from "./apps/base/types";
import { useThemeFlags } from "./hooks/useThemeFlags";
import { useIsMobile } from "./hooks/useIsMobile";
import { useOffline } from "./hooks/useOffline";
import { useTranslation } from "react-i18next";
import { isDesktop } from "./utils/platform";
import { checkDesktopUpdate, onDesktopUpdate, DesktopUpdateResult } from "./utils/prefetch";
import {
  getDesktopDownloadUrl,
  getSupportedDesktopDownloadTarget,
} from "./utils/desktopDownload";
import { DownloadSimple } from "@phosphor-icons/react";
import { ScreenSaverOverlay } from "./components/screensavers/ScreenSaverOverlay";
import { useBackgroundChatNotifications } from "./hooks/useBackgroundChatNotifications";
import { DesktopErrorBoundary } from "@/components/errors/ErrorBoundaries";
import { DeferredAutoCloudSync } from "@/hooks/useDeferredAutoCloudSync";
import { AirDropListener } from "@/components/AirDropListener";
import { useFilesStore } from "@/stores/useFilesStore";
import { WallpaperAccentRunner } from "@/hooks/WallpaperAccentRunner";
import { installNativeToastNotifications } from "@/utils/nativeToastNotifications";

// Convert registry to array
const apps: AnyApp[] = Object.values(appRegistry);

installNativeToastNotifications();

interface BootUiState {
  bootScreenMessage: string | null;
  showBootScreen: boolean;
  bootDebugMode: boolean;
}

const bootUiInitialState: BootUiState = {
  bootScreenMessage: null,
  showBootScreen: false,
  bootDebugMode: false,
};

type BootUiAction =
  | { type: "setMessage"; value: string | null }
  | { type: "setVisible"; value: boolean }
  | { type: "setDebugMode"; value: boolean };

function bootUiReducer(state: BootUiState, action: BootUiAction): BootUiState {
  switch (action.type) {
    case "setMessage":
      return { ...state, bootScreenMessage: action.value };
    case "setVisible":
      return { ...state, showBootScreen: action.value };
    case "setDebugMode":
      return { ...state, bootDebugMode: action.value };
    default:
      return state;
  }
}

export function App() {
  const { t } = useTranslation();
  const { isFirstBoot, setHasBooted, setLastSeenDesktopVersion } = useAppStoreShallow(
    (state) => ({
      isFirstBoot: state.isFirstBoot,
      setHasBooted: state.setHasBooted,
      setLastSeenDesktopVersion: state.setLastSeenDesktopVersion,
    })
  );
  const displayMode = useDisplaySettingsStoreShallow((state) => state.displayMode);
  const { isWindowsTheme, isMacOSTheme, isSystem7Theme, isAquaGlass } =
    useThemeFlags();
  const isMobile = useIsMobile();
  // Initialize offline detection
  useOffline();
  useBackgroundChatNotifications();

  // Determine toast position and offset based on theme and device
  const toastConfig = useMemo(() => {
    // The Aqua glass dock sits a bit higher than the classic dock (6px lift +
    // 8px taller bar = 70px tall), so add a little extra clearance to clear it.
    const dockHeight = isMacOSTheme ? (isAquaGlass ? 70 : 56) : 0;
    const taskbarHeight = isWindowsTheme ? 30 : 0;

    // Mobile: always show at bottom-center with dock/taskbar and safe area clearance
    if (isMobile) {
      // Tighten the gap above the (taller) glass dock so toasts don't float too high.
      const gap = isAquaGlass ? 12 : 16;
      const bottomOffset = dockHeight + taskbarHeight + gap;
      return {
        position: "bottom-center" as const,
        offset: `calc(env(safe-area-inset-bottom, 0px) + ${bottomOffset}px)`,
      };
    }

    if (isWindowsTheme) {
      // Windows themes: bottom-right with taskbar clearance (30px + padding)
      return {
        position: "bottom-right" as const,
        offset: `calc(env(safe-area-inset-bottom, 0px) + 42px)`,
      };
    } else {
      // macOS themes: top-right with menubar clearance
      const menuBarHeight = isSystem7Theme ? 30 : 25;
      return {
        position: "top-right" as const,
        offset: `${menuBarHeight + 12}px`,
      };
    }
  }, [isWindowsTheme, isMacOSTheme, isSystem7Theme, isAquaGlass, isMobile]);

  const [bootUiState, dispatchBootUi] = useReducer(
    bootUiReducer,
    bootUiInitialState
  );
  const { bootScreenMessage, showBootScreen, bootDebugMode } = bootUiState;
  const setBootScreenMessage = useCallback((value: string | null) => {
    dispatchBootUi({ type: "setMessage", value });
  }, []);
  const setShowBootScreen = useCallback((value: boolean) => {
    dispatchBootUi({ type: "setVisible", value });
  }, []);
  const setBootDebugMode = useCallback((value: boolean) => {
    dispatchBootUi({ type: "setDebugMode", value });
  }, []);

  useEffect(() => {
    applyDisplayMode(displayMode);
  }, [displayMode]);

  useEffect(() => {
    Promise.resolve(
      useFilesStore.getState().syncRootDirectoriesFromDefaults()
    ).catch((err) => {
      console.error("Root directory sync failed on app mount", err);
    });
  }, []);

  useEffect(() => {
    // Only show boot screen for system operations (reset/restore/format/debug)
    const persistedMessage = getNextBootMessage();
    if (persistedMessage) {
      setBootScreenMessage(persistedMessage);
      setBootDebugMode(isBootDebugMode());
      setShowBootScreen(true);
    }

    // Set first boot flag without showing boot screen
    if (isFirstBoot) {
      setHasBooted();
    }
  }, [
    isFirstBoot,
    setBootDebugMode,
    setBootScreenMessage,
    setHasBooted,
    setShowBootScreen,
  ]);

  // Show download toast for supported desktop platforms when a new shell is available
  // For web: show on first visit and updates
  // For desktop shell: only show on updates (not first time)
  useEffect(() => {
    const desktopDownloadTarget = getSupportedDesktopDownloadTarget();
    const isInDesktop = isDesktop();

    if (!desktopDownloadTarget) {
      return;
    }

    // Handler for showing the desktop update toast
    const showDesktopUpdateToast = (result: DesktopUpdateResult) => {
      if (result.type === 'update' && result.version) {
        const downloadUrl = getDesktopDownloadUrl(result.version, desktopDownloadTarget);
        if (!downloadUrl) {
          return;
        }
        // Mark as seen immediately so dismissing the toast won't show it again
        setLastSeenDesktopVersion(result.version);
        // New version available - show update toast (both web and desktop shell)
        toast(`ryOS ${result.version} for ${desktopDownloadTarget.platformLabel} is available`, {
          id: 'desktop-update',
          icon: <DownloadSimple className="size-4" weight="bold" />,
          duration: Infinity,
          action: {
            label: "Download",
            onClick: () => {
              window.open(downloadUrl, "_blank");
            },
          },
        });
      } else if (result.type === 'first-time' && result.version && !isInDesktop) {
        const downloadUrl = getDesktopDownloadUrl(result.version, desktopDownloadTarget);
        if (!downloadUrl) {
          return;
        }
        // Mark as seen immediately so dismissing the toast won't show it again
        setLastSeenDesktopVersion(result.version);
        // First time user on web - show initial download toast (not in desktop shell)
        toast(`ryOS is available as a ${desktopDownloadTarget.platformLabel} app`, {
          id: 'desktop-update',
          icon: <DownloadSimple className="size-4" weight="bold" />,
          duration: Infinity,
          action: {
            label: "Download",
            onClick: () => {
              window.open(downloadUrl, "_blank");
            },
          },
        });
      } else if (result.type === 'first-time' && result.version && isInDesktop) {
        // First time in desktop shell - just store the version without showing toast
        setLastSeenDesktopVersion(result.version);
      }
    };

    // Register callback for periodic/manual update checks
    onDesktopUpdate(showDesktopUpdateToast);

    // Initial check on load (delayed to let app render first)
    const timer = setTimeout(async () => {
      const result = await checkDesktopUpdate();
      showDesktopUpdateToast(result);
    }, 2000);

    return () => clearTimeout(timer);
  }, [setLastSeenDesktopVersion]);

  if (showBootScreen) {
    return (
      <BootScreen
        isOpen={true}
        onOpenChange={() => {}}
        title={bootScreenMessage || t("common.system.systemRestoring")}
        debugMode={bootDebugMode}
        onBootComplete={() => {
          clearNextBootMessage();
          setShowBootScreen(false);
        }}
      />
    );
  }

  return (
    <>
      <DesktopErrorBoundary>
        <AppManager apps={apps} />
      </DesktopErrorBoundary>
      <Toaster position={toastConfig.position} offset={toastConfig.offset} />
      <AirDropListener />
      <DeferredAutoCloudSync />
      <WallpaperAccentRunner />
      <ScreenSaverOverlay />
    </>
  );
}
