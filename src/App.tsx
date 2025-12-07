import { AppManager } from "./apps/base/AppManager";
import { appRegistry } from "./config/appRegistry";
import { useEffect, useState, useMemo } from "react";
import { applyDisplayMode } from "./utils/displayMode";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";
import { useAppStoreShallow } from "@/stores/helpers";
import { BootScreen } from "./components/dialogs/BootScreen";
import { getNextBootMessage, clearNextBootMessage } from "./utils/bootMessage";
import { AnyApp } from "./apps/base/types";
import { useThemeStore } from "./stores/useThemeStore";
import { useIsMobile } from "./hooks/useIsMobile";
import { useOffline } from "./hooks/useOffline";
import { useTranslation } from "react-i18next";
import { isTauri } from "./utils/platform";
import { checkDesktopUpdate, onDesktopUpdate, DesktopUpdateResult } from "./utils/prefetch";
import { Download } from "lucide-react";

// Convert registry to array
const apps: AnyApp[] = Object.values(appRegistry);

export function App() {
  const { t } = useTranslation();
  const { displayMode, isFirstBoot, setHasBooted, setLastSeenDesktopVersion } = useAppStoreShallow(
    (state) => ({
      displayMode: state.displayMode,
      isFirstBoot: state.isFirstBoot,
      setHasBooted: state.setHasBooted,
      setLastSeenDesktopVersion: state.setLastSeenDesktopVersion,
    })
  );
  const currentTheme = useThemeStore((state) => state.current);
  const isMobile = useIsMobile();
  // Initialize offline detection
  useOffline();

  // Determine toast position and offset based on theme and device
  const toastConfig = useMemo(() => {
    const isWindowsTheme = currentTheme === "xp" || currentTheme === "win98";
    const dockHeight = currentTheme === "macosx" ? 56 : 0;
    const taskbarHeight = isWindowsTheme ? 30 : 0;
    
    // Mobile: always show at bottom-center with dock/taskbar and safe area clearance
    if (isMobile) {
      const bottomOffset = dockHeight + taskbarHeight + 16;
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
      const menuBarHeight = currentTheme === "system7" ? 30 : 25;
      return {
        position: "top-right" as const,
        offset: `${menuBarHeight + 12}px`,
      };
    }
  }, [currentTheme, isMobile]);

  const [bootScreenMessage, setBootScreenMessage] = useState<string | null>(
    null
  );
  const [showBootScreen, setShowBootScreen] = useState(false);

  useEffect(() => {
    applyDisplayMode(displayMode);
  }, [displayMode]);

  useEffect(() => {
    // Only show boot screen for system operations (reset/restore/format/debug)
    const persistedMessage = getNextBootMessage();
    if (persistedMessage) {
      setBootScreenMessage(persistedMessage);
      setShowBootScreen(true);
    }

    // Set first boot flag without showing boot screen
    if (isFirstBoot) {
      setHasBooted();
    }
  }, [isFirstBoot, setHasBooted]);

  // Show download toast for macOS web users when new desktop version is available
  useEffect(() => {
    const isMacOS = navigator.platform.toLowerCase().includes("mac");

    if (!isMacOS || isTauri()) {
      return;
    }

    // Handler for showing the desktop update toast
    const showDesktopUpdateToast = (result: DesktopUpdateResult) => {
      if (result.type === 'update' && result.version) {
        // New version available - show update toast
        toast(`ryOS ${result.version} for Mac is available`, {
          id: 'desktop-update',
          icon: <Download className="h-4 w-4" />,
          duration: Infinity,
          action: {
            label: "Download",
            onClick: () => {
              window.open(
                `https://github.com/ryokun6/ryos/releases/download/v${result.version}/ryOS_${result.version}_aarch64.dmg`,
                "_blank"
              );
              // Mark as seen after clicking download
              setLastSeenDesktopVersion(result.version!);
            },
          },
        });
      } else if (result.type === 'first-time' && result.version) {
        // First time user - show initial download toast
        toast("ryOS is available as a Mac app", {
          id: 'desktop-update',
          icon: <Download className="h-4 w-4" />,
          duration: Infinity,
          action: {
            label: "Download",
            onClick: () => {
              window.open(
                `https://github.com/ryokun6/ryos/releases/download/v${result.version}/ryOS_${result.version}_aarch64.dmg`,
                "_blank"
              );
              setLastSeenDesktopVersion(result.version!);
            },
          },
        });
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
        onBootComplete={() => {
          clearNextBootMessage();
          setShowBootScreen(false);
        }}
      />
    );
  }

  return (
    <>
      <AppManager apps={apps} />
      <Toaster position={toastConfig.position} offset={toastConfig.offset} />
    </>
  );
}
