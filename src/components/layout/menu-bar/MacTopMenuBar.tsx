import type { CSSProperties, ReactNode } from "react";
import { Menubar } from "@/components/ui/menubar";
import { AppleMenu } from "../AppleMenu";
import { AppMenu } from "../AppMenu";
import { useAppStoreShallow } from "@/stores/useAppStore";
import { useDisplaySettingsStoreShallow } from "@/stores/useDisplaySettingsStore";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useWallpaperMenubarText } from "@/hooks/useWallpaperMenubarText";
import { useIsPhone } from "@/hooks/useIsPhone";
import { isDesktop, isDesktopWindows } from "@/utils/platform";
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
import { useDesktopFullscreen } from "./useDesktopFullscreen";

const noDragRegionStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;
const dragRegionStyle = { WebkitAppRegion: "drag" } as CSSProperties;

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

  const { isMacOSTheme, isMacTheme, isAquaGlass } = useThemeFlags();
  const { textColor: glassMenubarText, tone: glassMenubarTone } =
    useWallpaperMenubarText(isAquaGlass);
  const isPhone = useIsPhone();
  const isDesktopApp = isDesktop();
  const isFullscreen = useDesktopFullscreen();

  const isWindowsPlatform = isDesktopWindows();
  const isDesktopMacMenubar =
    isDesktopApp && !isWindowsPlatform && isMacTheme;
  const needsTrafficLightClearance = isDesktopMacMenubar && !isFullscreen;
  const menuBarHeight = needsTrafficLightClearance
    ? "32px"
    : "var(--os-metrics-menubar-height)";

  return (
    <div
      className={`mac-top-menubar fixed top-0 left-0 right-0 flex items-center font-os-ui ${isAquaGlass ? "border-transparent" : "border-b-[length:var(--os-metrics-border-width)] border-os-menubar"} ${exposeMode ? "z-[9997]" : "z-[10002]"}`}
      data-menubar-text-tone={isAquaGlass ? glassMenubarTone : undefined}
      style={{
        background: isAquaGlass
          ? "transparent"
          : isMacOSTheme
            ? "var(--os-color-menubar-surface, rgba(248, 248, 248, 0.85))"
            : "var(--os-color-menubar-bg)",
        backgroundImage: isAquaGlass
          ? undefined
          : isMacOSTheme
            ? "var(--os-pinstripe-menubar)"
            : undefined,
        backdropFilter: isAquaGlass
          ? undefined
          : isMacOSTheme
            ? "blur(20px)"
            : undefined,
        WebkitBackdropFilter: isAquaGlass
          ? undefined
          : isMacOSTheme
            ? "blur(20px)"
            : undefined,
        boxShadow: isAquaGlass
          ? undefined
          : isMacOSTheme
            ? "0 2px 8px rgba(0, 0, 0, 0.15)"
            : undefined,
        fontFamily: "var(--os-font-ui)",
        fontSize: isMacOSTheme ? "var(--os-typography-button)" : undefined,
        ...(isAquaGlass
          ? {
              ["--os-color-menubar-text" as string]: glassMenubarText,
              color: glassMenubarText,
            }
          : { color: "var(--os-color-menubar-text)" }),
        paddingLeft: needsTrafficLightClearance
          ? "calc(78px + env(safe-area-inset-left, 0px))"
          : "calc(0.5rem + env(safe-area-inset-left, 0px))",
        paddingRight: "calc(0.5rem + env(safe-area-inset-right, 0px))",
        height: menuBarHeight,
        minHeight: menuBarHeight,
        maxHeight: menuBarHeight,
      }}
    >
      <ScrollableMenuWrapper style={noDragRegionStyle}>
        <Menubar className="flex items-stretch border-none bg-transparent space-x-0 p-0 rounded-none h-full">
          <AppleMenu />
          {isMacOSTheme && hasActiveApp && foregroundInstance && (
            <AppMenu
              appId={foregroundInstance.appId}
              appName={
                getTranslatedAppName(foregroundInstance.appId) ||
                foregroundInstance.appId
              }
              instanceId={foregroundInstance.instanceId}
            />
          )}
          {isMacOSTheme && !hasActiveApp && <FinderAppMenu />}
          {hasActiveApp ? children : <DefaultMenuItems />}
        </Menubar>
      </ScrollableMenuWrapper>
      {isDesktopApp && (
        <div
          className="flex-1"
          style={{
            ...dragRegionStyle,
            background: debugMode ? "rgba(255, 0, 0, 0.3)" : undefined,
            minHeight: "100%",
          }}
          onDoubleClick={() => {
            void window.ryosDesktop?.toggleMaximize();
          }}
        />
      )}
      <div
        className={`menubar-status-controls ${isPhone ? "flex-shrink-0 pl-1 pr-0.5" : "ml-auto"} flex items-center h-full`}
        style={noDragRegionStyle}
      >
        <OfflineIndicator />
        <CloudSyncIndicator />
        <ExposeButton />
        <VolumeControl />
        <Clock enableCalendarOpen />
        <SpotlightMenuBarButton />
      </div>
    </div>
  );
}
