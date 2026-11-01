import { useCallback } from "react";
import { useDockStore } from "@/stores/useDockStore";
import type { ThemeMetadata } from "@/themes";
import { useThemeFlags } from "./useThemeFlags";
import { hasDesktopWindowChrome } from "@/utils/platform";
import { measureMenubarSafeTop } from "@/components/layout/menu-bar/menubarEdgePadding";
import { getDockLayout } from "@/components/layout/dock/dockPlacement";
import {
  computeWindowChromeInsets,
  readSafeAreaBottom,
  type WindowInsets,
} from "@/utils/windowInsets";

export type { WindowInsets };

/**
 * Hook that computes window insets based on current theme and platform.
 * Centralizes the logic for calculating menu bar, taskbar, dock heights
 * and safe areas for window positioning/sizing.
 */
export function useWindowInsets() {
  const {
    currentTheme,
    metadata: themeMetadata,
    isWindowsTheme,
    isMacTheme,
    isMacOSTheme,
    isSystem7Theme,
    isWinXp,
    isWin98,
    isAquaGlass,
  } = useThemeFlags();
  const dockScale = useDockStore((state) => state.scale);
  const dockHiding = useDockStore((state) => state.hiding);

  const themeMetaTyped = themeMetadata as ThemeMetadata;

  const getSafeAreaBottomInset = useCallback(() => readSafeAreaBottom(), []);

  const computeInsets = useCallback((): WindowInsets => {
    // In a desktop window shell, menubar is 32px for mac themes; otherwise use theme defaults
    const needsDesktopMenubar = hasDesktopWindowChrome() && isMacTheme;
    const menuBarHeight = needsDesktopMenubar
      ? 32
      : themeMetaTyped.menuBarHeight;

    return computeWindowChromeInsets({
      menuBarHeight,
      taskbarHeight: themeMetaTyped.taskbarHeight,
      hasDock: themeMetaTyped.hasDock,
      baseDockHeight: themeMetaTyped.baseDockHeight,
      dockScale,
      dockHiding,
      dockPlacement: getDockLayout().placement,
      isAquaGlass,
      safeAreaBottom: getSafeAreaBottomInset(),
      safeTop: measureMenubarSafeTop(),
    });
  }, [
    themeMetaTyped,
    isMacTheme,
    isAquaGlass,
    getSafeAreaBottomInset,
    dockScale,
    dockHiding,
  ]);

  return {
    computeInsets,
    getSafeAreaBottomInset,
    isMacTheme,
    currentTheme,
    themeMetadata: themeMetaTyped,
    isWindowsTheme,
    isMacOSTheme,
    isSystem7Theme,
    isWinXp,
    isWin98,
  };
}
