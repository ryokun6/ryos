import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CaretUp } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import type { AnyApp } from "@/apps/base/types";
import { getAppIconPath } from "@/config/appRegistry";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import type { AppInstance } from "@/stores/useAppStore";
import type { FileSystemItem } from "@/stores/useFilesStore";
import { StartMenu } from "../StartMenu";
import { Clock } from "./MenuBarClock";
import { VolumeControl } from "./VolumeControl";
import { OfflineIndicator } from "./OfflineIndicator";
import { getAppName } from "./menuBarUtils";
import { getAppletDisplayInfo } from "./getAppletDisplayInfo";
import { useTaskbarOverflow } from "./useTaskbarOverflow";

export interface WindowsTaskbarProps {
  apps: AnyApp[];
  instances: Record<string, AppInstance>;
  foregroundInstanceId: string | null;
  bringInstanceToForeground: (instanceId: string) => void;
  restoreInstance: (instanceId: string) => void;
  getFileItem: (path: string) => FileSystemItem | undefined;
  currentTheme: string;
  isWindowsTheme: boolean;
}

export function WindowsTaskbar({
  apps,
  instances,
  foregroundInstanceId,
  bringInstanceToForeground,
  restoreInstance,
  getFileItem,
  currentTheme,
  isWindowsTheme,
}: WindowsTaskbarProps) {
  const {
    runningAreaRef,
    visibleTaskbarIds,
    overflowTaskbarIds,
    allTaskbarIds,
  } = useTaskbarOverflow(instances, true);

    const isWinXp = currentTheme === "xp";
    const isWin98 = currentTheme === "win98";
    const taskbarBackground =
      isWinXp
        ? "linear-gradient(0deg, #042b8e 0%, #0551f6 6%, #0453ff 51%, #0551f6 63%, #0551f6 81%, #3a8be8 90%, #0453ff 100%)"
        : "#c0c0c0";
    return (
      <div
        className="fixed bottom-0 left-0 right-0 px-0 z-50"
        style={{
          background: taskbarBackground,
          fontFamily: "var(--font-ms-sans)",
          fontSize: "11px",
          color: isWinXp ? "#ffffff" : "#000000",
          userSelect: "none",
          width: "100vw",
          height: "calc(30px + env(safe-area-inset-bottom, 0px))",
          position: "fixed",
        }}
      >
      <div
        className="absolute left-0 right-0 flex items-center h-[30px]"
        style={{
          bottom: "env(safe-area-inset-bottom, 0px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
          {/* Start Button */}
          <div className="flex items-center h-full">
            <StartMenu apps={apps} />
          </div>

          {/* Running Apps Area */}
          <div
            ref={runningAreaRef}
            className="flex-1 flex items-center gap-0.5 px-2 overflow-hidden h-full"
          >
            <AnimatePresence mode="popLayout">
            {(() => {
              const idsToRender =
                visibleTaskbarIds.length > 0 || overflowTaskbarIds.length > 0
                  ? visibleTaskbarIds
                  : allTaskbarIds;
              if (idsToRender.length === 0) return null;
              return idsToRender.map((instanceId) => {
                const instance = instances[instanceId];
                if (!instance || !instance.isOpen) return null;

                const isForeground = instanceId === foregroundInstanceId;
                const isMinimized = instance.isMinimized ?? false;
                const isApplet = instance.appId === "applet-viewer";
                
                // Get icon and label based on app type
                const appletInfo = isApplet ? getAppletDisplayInfo(instance, getFileItem) : null;
                const displayIcon = appletInfo?.icon || getAppIconPath(instance.appId);
                const displayLabel = appletInfo?.label || instance.title || getAppName(instance.appId);
                const isEmoji = appletInfo?.isEmoji || false;

                return (
                  <motion.button
                    key={instanceId}
                    data-taskbar-item={instanceId}
                    layout
                    initial={{ scale: 0.8, opacity: 0, width: 0 }}
                    animate={{ scale: 1, opacity: 1, width: "auto" }}
                    exit={{ scale: 0.8, opacity: 0, width: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 400,
                      damping: 30,
                      mass: 0.8,
                    }}
                    className="px-2 gap-1 border-t border-y rounded-sm flex items-center justify-start"
                    onClick={() => {
                      // If minimized, restore it; otherwise just bring to foreground
                      if (isMinimized) {
                        restoreInstance(instanceId);
                      } else {
                        bringInstanceToForeground(instanceId);
                      }
                    }}
                    style={{
                      height: "85%",
                      flex: "0 1 160px",
                      minWidth: "110px",
                      marginTop: "2px",
                      marginRight: "2px",
                      background: isForeground && !isMinimized
                        ? isWinXp
                          ? "#3980f4"
                          : "#c0c0c0"
                        : isWinXp
                        ? "#1658dd"
                        : "#c0c0c0",
                      border:
                        isWinXp
                          ? isForeground && !isMinimized
                            ? "1px solid #255be1"
                            : "1px solid #255be1"
                          : "none",
                      color: isWinXp ? "#ffffff" : "#000000",
                      fontSize: "11px",
                      boxShadow:
                        isWinXp
                          ? "2px 2px 5px rgba(255, 255, 255, 0.267) inset"
                          : isForeground && !isMinimized
                          ? "inset -1px -1px #fff, inset 1px 1px #0a0a0a, inset -2px -2px #dfdfdf, inset 2px 2px grey"
                          : "inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px grey, inset 2px 2px #dfdfdf",
                      transition: "background 0.1s ease, box-shadow 0.1s ease, border-color 0.1s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (isWinXp) {
                        if (isForeground && !isMinimized) {
                          e.currentTarget.style.background = "#4a92f9";
                          e.currentTarget.style.borderColor = "#2c64e3";
                        } else {
                          e.currentTarget.style.background = "#2a6ef1";
                          e.currentTarget.style.borderColor = "#1e56c9";
                        }
                      } else if (isWin98 && (!isForeground || isMinimized)) {
                        e.currentTarget.style.boxShadow =
                          "inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px grey, inset 2px 2px #dfdfdf";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (isWinXp) {
                        if (isForeground && !isMinimized) {
                          e.currentTarget.style.background = "#3980f4";
                          e.currentTarget.style.borderColor = "#255be1";
                        } else {
                          e.currentTarget.style.background = "#1658dd";
                          e.currentTarget.style.borderColor = "#255be1";
                        }
                      } else if (isWin98 && (!isForeground || isMinimized)) {
                        e.currentTarget.style.boxShadow =
                          "inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px grey, inset 2px 2px #dfdfdf";
                      }
                    }}
                  >
                    {isEmoji ? (
                      <span
                        className="flex-shrink-0 flex items-center justify-center"
                        style={{
                          fontSize: "14px",
                          width: "16px",
                          height: "16px",
                        }}
                      >
                        {displayIcon}
                      </span>
                    ) : (
                      <ThemedIcon
                        name={displayIcon}
                        alt=""
                        className="w-4 h-4 flex-shrink-0 [image-rendering:pixelated]"
                      />
                    )}
                    <span className="truncate text-xs">
                      {displayLabel}
                    </span>
                  </motion.button>
                );
              });
            })()}
            </AnimatePresence>

            {/* Overflow menu button */}
            {overflowTaskbarIds.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="px-1 border-t border-y rounded-sm flex items-center justify-center"
                    style={{
                      height: "85%",
                      width: "36px",
                      marginTop: "2px",
                      marginRight: "2px",
                      background: isWinXp ? "#1658dd" : "#c0c0c0",
                      border:
                        isWinXp ? "1px solid #255be1" : "none",
                      color: isWinXp ? "#ffffff" : "#000000",
                      fontSize: "11px",
                      boxShadow:
                        isWinXp
                          ? "2px 2px 5px rgba(255, 255, 255, 0.267) inset"
                          : "inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px grey, inset 2px 2px #dfdfdf",
                      transition: "all 0.1s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (isWinXp) {
                        e.currentTarget.style.background = "#2a6ef1";
                        e.currentTarget.style.borderColor = "#1e56c9";
                      } else if (isWin98) {
                        e.currentTarget.style.boxShadow =
                          "inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px grey, inset 2px 2px #dfdfdf";
                      }
                    }}
                    onMouseDown={(e) => {
                      if (isWinXp) {
                        e.currentTarget.style.background = "#4a92f9";
                        e.currentTarget.style.borderColor = "#2c64e3";
                      } else if (isWin98) {
                        e.currentTarget.style.boxShadow =
                          "inset -1px -1px #fff, inset 1px 1px #0a0a0a, inset -2px -2px #dfdfdf, inset 2px 2px grey";
                      }
                    }}
                    onMouseUp={(e) => {
                      if (isWinXp) {
                        // return to hover shade; mouseleave will handle base
                        e.currentTarget.style.background = "#2a6ef1";
                        e.currentTarget.style.borderColor = "#1e56c9";
                      } else if (isWin98) {
                        // return to raised hover state
                        e.currentTarget.style.boxShadow =
                          "inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px grey, inset 2px 2px #dfdfdf";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (isWinXp) {
                        e.currentTarget.style.background = "#1658dd";
                        e.currentTarget.style.borderColor = "#255be1";
                      } else if (isWin98) {
                        e.currentTarget.style.boxShadow =
                          "inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px grey, inset 2px 2px #dfdfdf";
                      }
                    }}
                  >
                    <CaretUp className="h-4 w-4" weight="bold" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  side={isWindowsTheme ? "top" : "bottom"}
                  sideOffset={4}
                  className="px-0"
                >
                  {overflowTaskbarIds.map((instanceId) => {
                    const instance = instances[instanceId];
                    if (!instance || !instance.isOpen) return null;
                    
                    const isMinimized = instance.isMinimized ?? false;
                    const isApplet = instance.appId === "applet-viewer";
                    const appletInfo = isApplet ? getAppletDisplayInfo(instance, getFileItem) : null;
                    const displayIcon = appletInfo?.icon || getAppIconPath(instance.appId);
                    const displayLabel = appletInfo?.label || instance.title || getAppName(instance.appId);
                    const isEmoji = appletInfo?.isEmoji || false;
                    
                    return (
                      <DropdownMenuItem
                        key={instanceId}
                        onClick={() => {
                          // If minimized, restore it; otherwise just bring to foreground
                          if (isMinimized) {
                            restoreInstance(instanceId);
                          } else {
                            bringInstanceToForeground(instanceId);
                          }
                        }}
                        className="text-md h-6 px-3 flex items-center gap-2"
                      >
                        {isEmoji ? (
                          <span
                            className="flex-shrink-0 flex items-center justify-center"
                            style={{
                              fontSize: "14px",
                              width: "16px",
                              height: "16px",
                            }}
                          >
                            {displayIcon}
                          </span>
                        ) : (
                          <ThemedIcon
                            name={displayIcon}
                            alt=""
                            className="w-4 h-4 [image-rendering:pixelated]"
                          />
                        )}
                        <span className="truncate text-xs">
                          {displayLabel}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* System Tray */}
          <div
            className="flex items-center gap-1 px-2 text-white border box-border flex items-center justify-end text-sm"
            style={{
              height: isWin98 ? "85%" : "100%",
              marginTop: isWin98 ? "2px" : "0px",
              marginRight: isWin98 ? "4px" : "0px",
              background:
                isWinXp
                  ? "linear-gradient(0deg, #0a5bc6 0%, #1198e9 6%, #1198e9 51%, #1198e9 63%, #1198e9 77%, #19b9f3 85%, #19b9f3 93%, #075dca 97%)"
                  : "#c0c0c0", // Flat gray for Windows 98
              boxShadow:
                isWinXp
                  ? "2px -0px 3px #20e2fc inset"
                  : "inset -1px -1px #fff, inset 1px 1px #0a0a0a, inset -2px -2px #dfdfdf, inset 2px 2px grey", // Windows 98 inset
              borderTop:
                isWinXp ? "1px solid #075dca" : "transparent",
              borderBottom:
                isWinXp ? "1px solid #0a5bc6" : "transparent",
              borderRight:
                isWinXp ? "transparent" : "transparent",
              borderLeft:
                isWinXp ? "1px solid #000000" : "transparent",
              paddingTop: isWinXp ? "1px" : "0px",
            }}
          >
            <OfflineIndicator />
            <div className="hidden sm:flex">
              <VolumeControl />
            </div>
            <div
              className={`text-xs ${isWindowsTheme ? "font-bold" : "font-normal"} ${
                isWindowsTheme ? "" : "px-2"
              }`}
              style={{
                color:
                  isWin98
                    ? "#000000"
                    : isWindowsTheme
                    ? "#ffffff"
                    : "#000000",
                textShadow: isWinXp
                  ? "1px 1px 1px rgba(0,0,0,0.5)"
                  : "none",
              }}
            >
              <Clock />
            </div>
          </div>
        </div>
      </div>
    );
}
