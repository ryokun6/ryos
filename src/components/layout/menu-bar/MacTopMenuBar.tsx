import type { ReactNode } from "react";
import { Menubar } from "@/components/ui/menubar";
import { AppleMenu } from "../AppleMenu";
import { AppMenu } from "../AppMenu";
import { useAppStoreShallow } from "@/stores/useAppStore";
import { useDisplaySettingsStoreShallow } from "@/stores/useDisplaySettingsStore";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useIsPhone } from "@/hooks/useIsPhone";
import { isTauri, isTauriWindows } from "@/utils/platform";
import { getTranslatedAppName } from "@/utils/i18n";
import { ScrollableMenuWrapper } from "./ScrollableMenuWrapper";
import { FinderAppMenu } from "./FinderAppMenu";
import { DefaultMenuItems } from "./DefaultMenuItems";
import { Clock } from "./MenuBarClock";
import { VolumeControl } from "./VolumeControl";
import { OfflineIndicator } from "./OfflineIndicator";
import { CloudSyncIndicator } from "./CloudSyncIndicator";
import { ExposeButton } from "./ExposeButton";
import { SpotlightMenuBarButton } from "./SpotlightMenuBarButton";
import { useTauriFullscreen } from "./useTauriFullscreen";

export interface MacTopMenuBarProps {
  children?: ReactNode;
}

export function MacTopMenuBar({ children }: MacTopMenuBarProps) {
  const { getForegroundInstance, exposeMode } = useAppStoreShallow((s) => ({
    getForegroundInstance: s.getForegroundInstance,
    exposeMode: s.exposeMode,
  }));

  const debugMode = useDisplaySettingsStoreShallow((s) => s.debugMode);
  const foregroundInstance = getForegroundInstance();
  const hasActiveApp = !!foregroundInstance;

  const { isMacOSTheme, isMacTheme } = useThemeFlags();
  const isPhone = useIsPhone();
  const isTauriApp = isTauri();
  const isFullscreen = useTauriFullscreen();

  const isWindowsPlatform = isTauriWindows();
  const isTauriMacMenubar =
    isTauriApp &&
    !isWindowsPlatform &&
    isMacTheme;
  const needsTrafficLightClearance = isTauriMacMenubar && !isFullscreen;
  const menuBarHeight = needsTrafficLightClearance
    ? "32px"
    : "var(--os-metrics-menubar-height)";

  return (
    <div
      className={`fixed top-0 left-0 right-0 flex border-b-[length:var(--os-metrics-border-width)] border-os-menubar items-center font-os-ui ${exposeMode ? "z-[9997]" : "z-[10002]"}`}
      style={{
        background: isMacOSTheme
          ? "var(--os-color-menubar-surface, rgba(248, 248, 248, 0.85))"
          : "var(--os-color-menubar-bg)",
        backgroundImage:
          isMacOSTheme ? "var(--os-pinstripe-menubar)" : undefined,
        backdropFilter: isMacOSTheme ? "blur(20px)" : undefined,
        WebkitBackdropFilter:
          isMacOSTheme ? "blur(20px)" : undefined,
        boxShadow:
          isMacOSTheme
            ? "0 2px 8px rgba(0, 0, 0, 0.15)"
            : undefined,
        fontFamily: "var(--os-font-ui)",
        fontSize: isMacOSTheme ? "var(--os-typography-button)" : undefined,
        color: "var(--os-color-menubar-text)",
        paddingLeft: needsTrafficLightClearance
          ? "calc(78px + env(safe-area-inset-left, 0px))"
          : "calc(0.5rem + env(safe-area-inset-left, 0px))",
        paddingRight: "calc(0.5rem + env(safe-area-inset-right, 0px))",
        height: menuBarHeight,
        minHeight: menuBarHeight,
        maxHeight: menuBarHeight,
      }}
    >
      <ScrollableMenuWrapper>
        <Menubar
          className="flex items-stretch border-none bg-transparent space-x-0 p-0 rounded-none h-full"
        >
          <AppleMenu />
          {isMacOSTheme && hasActiveApp && foregroundInstance && (
            <AppMenu
              appId={foregroundInstance.appId}
              appName={getTranslatedAppName(foregroundInstance.appId) || foregroundInstance.appId}
              instanceId={foregroundInstance.instanceId}
            />
          )}
          {isMacOSTheme && !hasActiveApp && (
            <FinderAppMenu />
          )}
          {hasActiveApp ? children : <DefaultMenuItems />}
        </Menubar>
      </ScrollableMenuWrapper>
      {isTauriApp && (
        // biome-ignore lint/a11y/noStaticElementInteractions: Window drag handle for Tauri
        <div
          className="flex-1"
          style={{
            background: debugMode ? "rgba(255, 0, 0, 0.3)" : undefined,
            minHeight: "100%",
          }}
          onMouseDown={async (e) => {
            if (e.buttons !== 1) return;
            try {
              const { getCurrentWindow } = await import("@tauri-apps/api/window");
              if (e.detail === 2) {
                await getCurrentWindow().toggleMaximize();
              } else {
                await getCurrentWindow().startDragging();
              }
            } catch {
              // Ignore errors - Tauri window APIs may not be available in browser
            }
          }}
        />
      )}
      <div className={`${isPhone ? "flex-shrink-0 pl-1 pr-0.5" : "ml-auto"} flex items-center h-full`}>
        <OfflineIndicator />
        <CloudSyncIndicator />
        <ExposeButton />
        <div className="hidden sm:flex">
          <VolumeControl />
        </div>
        <Clock enableCalendarOpen />
        <SpotlightMenuBarButton />
      </div>
    </div>
  );
}
