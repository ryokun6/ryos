import { useEffect, type CSSProperties, type ReactNode } from "react";
import { Menubar } from "@/components/ui/menubar";
import { AppleMenu } from "../AppleMenu";
import { AppMenu } from "../AppMenu";
import { useAppStoreShallow } from "@/stores/useAppStore";
import { useDisplaySettingsStoreShallow } from "@/stores/useDisplaySettingsStore";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useWallpaperMenubarText } from "@/hooks/useWallpaperMenubarText";
import { useIsPhone } from "@/hooks/useIsPhone";
import { hasDesktopWindowChrome, isDesktopWindows, isIosShell } from "@/utils/platform";
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
import { shouldShowDesktopDragDebugZone } from "./desktopDragDebug";
import { getMenubarWindowChromeLayout } from "./menubarWindowChrome";
import {
  menubarBoxHeight,
  menubarBoxLeft,
  menubarBoxRight,
  menubarBoxTop,
  menubarFillsSafeArea,
  menubarHorizontalPadding,
  menubarPaddingTop,
  raisedMenubarBox,
} from "./menubarEdgePadding";
import { useRaisedMenubarBesideStatusPill } from "./useRaisedMenubarBesideStatusPill";

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

  const { debugMode, showResizers } = useDisplaySettingsStoreShallow((s) => ({
    debugMode: s.debugMode,
    showResizers: s.showResizers,
  }));
  const foregroundInstance = getForegroundInstance();
  const hasActiveApp = !!foregroundInstance;

  const { isMacOSTheme, isMacTheme, isAquaGlass } = useThemeFlags();
  const iosShell = isIosShell();
  const { textColor: glassMenubarText, tone: glassMenubarTone } =
    useWallpaperMenubarText(isAquaGlass || iosShell);
  // Status-bar glyphs sit on the wallpaper, so they follow its tone, not the
  // system appearance. The menubar's own text keeps the theme colour except
  // in Aqua, where the bar is transparent.
  useEffect(() => {
    if (!iosShell) return;
    const bridge = window.ryosDesktop;
    const setTone = bridge?.setStatusBarTone;
    if (typeof setTone !== "function") return;
    try {
      const result: unknown = setTone.call(bridge, glassMenubarTone);
      if (result && typeof (result as Promise<unknown>).catch === "function") {
        (result as Promise<unknown>).catch(() => {});
      }
    } catch {
      // An older shell has no such method.
    }
  }, [iosShell, glassMenubarTone]);
  const isPhone = useIsPhone();
  const hasWindowChrome = hasDesktopWindowChrome();
  const showDesktopDragDebugZone = shouldShowDesktopDragDebugZone({
    isDesktopApp: hasWindowChrome,
    debugMode,
    showResizers,
  });
  const isFullscreen = useDesktopFullscreen();
  const { showWindowDragRegion, needsTrafficLightClearance } =
    getMenubarWindowChromeLayout({
      hasWindowChrome,
      isPhone,
      isWindowsPlatform: isDesktopWindows(),
      isMacTheme,
      isFullscreen,
    });
  const fillsSafeArea = menubarFillsSafeArea({
    iosShell,
    opaqueMenubar: !isAquaGlass,
  });
  const menuBarHeight = needsTrafficLightClearance
    ? "32px"
    : "var(--os-metrics-menubar-height)";
  // Border-box: the top inset is padding, so the content row keeps
  // `menuBarHeight` and the bar's bottom stays at menuBarHeight + safe top.
  const menuBarBoxHeight = menubarBoxHeight(fillsSafeArea, menuBarHeight);
  const horizontalPadding = {
    trafficLightClearance: needsTrafficLightClearance,
    fillsSafeArea,
  };
  // Inner display upright in the iOS shell: the row moves up beside the
  // system clock and wi-fi pill. 0 (no change) everywhere else.
  const raisedViewportWidth = useRaisedMenubarBesideStatusPill(iosShell);
  const raised =
    raisedViewportWidth > 0
      ? raisedMenubarBox({
          fillsSafeArea,
          contentHeight: menuBarHeight,
          viewportWidth: raisedViewportWidth,
        })
      : null;

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
        boxSizing: "border-box",
        top: menubarBoxTop(fillsSafeArea),
        left: menubarBoxLeft(fillsSafeArea),
        right: menubarBoxRight(fillsSafeArea),
        paddingTop: menubarPaddingTop(fillsSafeArea),
        paddingLeft: menubarHorizontalPadding({
          ...horizontalPadding,
          side: "left",
        }),
        paddingRight: menubarHorizontalPadding({
          ...horizontalPadding,
          side: "right",
        }),
        height: menuBarBoxHeight,
        minHeight: menuBarBoxHeight,
        maxHeight: menuBarBoxHeight,
        ...(raised
          ? {
              top: raised.top,
              right: raised.right,
              paddingTop: raised.paddingTop,
              paddingRight: raised.paddingRight,
              height: raised.height,
              minHeight: raised.height,
              maxHeight: raised.height,
            }
          : {}),
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
      {showWindowDragRegion && (
        <div
          className="flex-1"
          style={{
            ...dragRegionStyle,
            background: showDesktopDragDebugZone
              ? "rgba(255, 0, 0, 0.3)"
              : undefined,
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
