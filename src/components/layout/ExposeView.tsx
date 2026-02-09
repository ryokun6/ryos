import { useEffect, useCallback, useMemo } from "react";
import { useEventListener, useCustomEventListener } from "@/hooks/useEventListener";
import { usePrevious } from "@/hooks/useLatestRef";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStoreShallow } from "@/stores/helpers";
import { getAppIconPath } from "@/config/appRegistry";
import { getTranslatedAppName } from "@/utils/i18n";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { useFilesStore } from "@/stores/useFilesStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { useSound, Sounds } from "@/hooks/useSound";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { AppInstance } from "@/stores/useAppStore";
import type { AppletViewerInitialData } from "@/apps/applet-viewer";
import {
  calculateExposeGrid,
  getExposeCellCenter,
  getExposeScale,
} from "./exposeUtils";
import { useTranslation } from "react-i18next";

interface ExposeViewProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExposeView({ isOpen, onClose }: ExposeViewProps) {
  const { t } = useTranslation();
  const {
    instances,
    setExposeMode,
    bringInstanceToForeground,
    restoreInstance,
  } = useAppStoreShallow((state) => ({
    instances: state.instances,
    setExposeMode: state.setExposeMode,
    bringInstanceToForeground: state.bringInstanceToForeground,
    restoreInstance: state.restoreInstance,
  }));

  const files = useFilesStore((s) => s.items);
  const currentTheme = useThemeStore((state) => state.current);
  const isMacOSXTheme = currentTheme === "macosx";
  const isMobile = useIsMobile();

  // Sounds for expose view open/close
  const { play: playOpenSound } = useSound(Sounds.WINDOW_ZOOM_MAXIMIZE, 0.5);
  const { play: playCloseSound } = useSound(Sounds.WINDOW_ZOOM_MINIMIZE, 0.5);

  // Track previous isOpen state to detect changes
  const prevIsOpen = usePrevious(isOpen);

  // Get all open instances (excluding minimized and stickies)
  const openInstances = useMemo(() => {
    return Object.values(instances).filter(
      (inst) => inst.isOpen && !inst.isMinimized && inst.appId !== "stickies"
    );
  }, [instances]);

  // Set expose mode when view opens/closes
  useEffect(() => {
    setExposeMode(isOpen);
  }, [isOpen, setExposeMode]);

  // Play sounds when expose view opens/closes
  useEffect(() => {
    if (prevIsOpen === undefined) {
      return;
    }

    if (isOpen !== prevIsOpen) {
      if (isOpen) {
        playOpenSound();
      } else {
        playCloseSound();
      }
    }
  }, [isOpen, prevIsOpen, playOpenSound, playCloseSound]);

  // Helper to get applet info (icon and name) from instance
  const getAppletInfo = useCallback(
    (instance: AppInstance) => {
      const initialData = instance.initialData as
        | AppletViewerInitialData
        | undefined;
      const path = initialData?.path || "";
      const file = files[path];

      // Get filename from path for label
      const getFileName = (filePath: string): string => {
        const parts = filePath.split("/");
        const fileName = parts[parts.length - 1];
        return fileName.replace(/\.(html|app)$/i, "");
      };

      const label = path ? getFileName(path) : t("common.dock.appletStore");

      // Check if the file icon is an emoji (not a file path)
      const fileIcon = file?.icon;
      const isEmojiIcon =
        fileIcon &&
        !fileIcon.startsWith("/") &&
        !fileIcon.startsWith("http") &&
        fileIcon.length <= 10;

      // If no path (applet store), use the applet viewer icon
      // Otherwise, use file icon if emoji, or fallback to package emoji
      let icon: string;
      let isEmoji: boolean;
      if (!path) {
        // Applet store - use app icon
        icon = getAppIconPath("applet-viewer");
        isEmoji = false;
      } else {
        icon = isEmojiIcon ? fileIcon : "📦";
        isEmoji = true;
      }

      return { icon, label, isEmoji };
    },
    [files]
  );

  // Handle window selection (called from AppManager)
  const handleWindowSelect = useCallback(
    (instanceId: string) => {
      const instance = instances[instanceId];
      if (!instance) return;

      // Restore if minimized
      if (instance.isMinimized) {
        restoreInstance(instanceId);
      }

      // Bring to foreground
      bringInstanceToForeground(instanceId);
      onClose();
    },
    [instances, restoreInstance, bringInstanceToForeground, onClose]
  );

  // Expose the handleWindowSelect for AppManager
  useCustomEventListener<{ instanceId: string }>(
    "exposeWindowSelect",
    (e) => handleWindowSelect(e.detail.instanceId)
  );

  // Handle keyboard navigation - escape to close
  useEventListener("keydown", (e) => {
    if (isOpen && e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  });

  // Calculate grid for label positioning
  const grid = useMemo(() => {
    return calculateExposeGrid(
      openInstances.length,
      window.innerWidth,
      window.innerHeight,
      60, // padding
      24, // gap
      isMobile
    );
  }, [openInstances.length, isMobile]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop - clicking closes expose view */}
          <motion.div
            className="fixed inset-0 z-[9998] bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
          />

          {/* Global style to disable iframe interactions in expose mode */}
          <style>{`
            iframe, webview, object, embed {
              pointer-events: none !important;
            }
          `}</style>

          {/* Window labels overlay */}
          <motion.div
            className="fixed inset-0 z-[10001] pointer-events-none flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            {openInstances.length === 0 ? (
              <div
                className={`text-white ${isMacOSXTheme ? "font-bold" : "drop-shadow-lg"}`}
                style={{
                  textShadow: isMacOSXTheme
                    ? "rgba(0, 0, 0, 0.9) 0px 1px 0px, rgba(0, 0, 0, 0.85) 0px 1px 3px, rgba(0, 0, 0, 0.45) 0px 2px 3px"
                    : undefined,
                  fontSize: "1rem",
                }}
              >
                {t("common.expose.noWindows")}
              </div>
            ) : (
            openInstances.map((instance, index) => {
              const isApplet = instance.appId === "applet-viewer";
              const appletInfo = isApplet ? getAppletInfo(instance) : null;
              const displayIcon =
                appletInfo?.icon || getAppIconPath(instance.appId);
              const displayLabel =
                appletInfo?.label ||
                instance.title ||
                instance.displayTitle ||
                getTranslatedAppName(instance.appId);
              const isEmoji = appletInfo?.isEmoji || false;

              const cellCenter = getExposeCellCenter(
                index,
                grid,
                window.innerWidth,
                window.innerHeight
              );

              // Calculate scaled window bottom for accurate label positioning
              const windowHeight = instance.size?.height || 400;
              const windowWidth = instance.size?.width || 600;
              const scale = getExposeScale(windowWidth, windowHeight, grid.cellWidth, grid.cellHeight);
              const scaledWindowHalfHeight = (windowHeight * scale) / 2;

              // macOS-style text shadow (same as file icon labels)
              const macOSTextShadow = isMacOSXTheme
                ? "rgba(0, 0, 0, 0.9) 0px 1px 0px, rgba(0, 0, 0, 0.85) 0px 1px 3px, rgba(0, 0, 0, 0.45) 0px 2px 3px"
                : undefined;

              return (
                <div
                  key={instance.instanceId}
                  className="absolute flex flex-col items-center gap-1 pointer-events-none"
                  style={{
                    left: cellCenter.x,
                    top: cellCenter.y + scaledWindowHalfHeight + 8,
                    transform: "translateX(-50%)",
                  }}
                >
                  {/* Icon */}
                  <div className="flex items-center gap-2">
                    {isEmoji ? (
                      <span className="text-2xl">{displayIcon}</span>
                    ) : (
                      <ThemedIcon
                        name={displayIcon}
                        alt=""
                        className="w-6 h-6 [image-rendering:pixelated]"
                      />
                    )}
                    {/* Title */}
                    <div
                      className={`text-sm font-medium text-white line-clamp-1 max-w-[200px] ${
                        isMacOSXTheme ? "font-bold" : "drop-shadow-lg"
                      }`}
                      style={{
                        textShadow: macOSTextShadow,
                      }}
                    >
                      {displayLabel}
                    </div>
                  </div>
                </div>
              );
            })
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
