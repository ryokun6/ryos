import { useCallback } from "react";
import { useDockStore } from "@/stores/useDockStore";
import type { ThemeMetadata } from "@/themes";
import { useThemeFlags } from "./useThemeFlags";
import { isDesktop } from "@/utils/platform";

export interface WindowInsets {
  menuBarHeight: number;
  taskbarHeight: number;
  safeAreaBottom: number;
  topInset: number;
  bottomInset: number;
  dockHeight: number;
}

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

  const getSafeAreaBottomInset = useCallback(() => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    // Get the env(safe-area-inset-bottom) value or fallback to 0
    const safeAreaInset = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--sat-safe-area-bottom"
      )
    );
    // On iPadOS, the home indicator height is typically 20px
    return !isNaN(safeAreaInset) ? safeAreaInset : isMobile ? 20 : 0;
  }, []);

  const computeInsets = useCallback((): WindowInsets => {
    const safeAreaBottom = getSafeAreaBottomInset();
    const isDesktopApp = isDesktop();

    // In the desktop shell, menubar is 32px for mac themes; otherwise use theme defaults
    const needsDesktopMenubar = isDesktopApp && isMacTheme;
    const menuBarHeight = needsDesktopMenubar
      ? 32
      : themeMetaTyped.menuBarHeight;

    const taskbarHeight = themeMetaTyped.taskbarHeight;

    // Use scaled dock height for accurate constraints (0 if dock hiding is enabled)
    let dockHeight =
      themeMetaTyped.hasDock && !dockHiding
        ? Math.round(themeMetaTyped.baseDockHeight * dockScale)
        : 0;

    // The Aqua glass dock is taller than the classic dock (8px vertical padding
    // per side vs 4px, see MacDock.tsx) and is lifted 6px off the screen edge
    // (margin-bottom in aqua-glass.css). Reserve that extra space so maximized
    // / resized windows don't overlap the glass dock.
    if (dockHeight > 0 && isAquaGlass) {
      const GLASS_DOCK_LIFT = 6;
      const glassExtraBarHeight =
        (Math.round(8 * dockScale) - Math.round(4 * dockScale)) * 2;
      dockHeight += glassExtraBarHeight + GLASS_DOCK_LIFT;
    }

    const topInset = menuBarHeight;
    // bottomInset includes dock for resize/maximize constraints
    const bottomInset = taskbarHeight + dockHeight + safeAreaBottom;

    return {
      menuBarHeight,
      taskbarHeight,
      safeAreaBottom,
      topInset,
      bottomInset,
      dockHeight,
    };
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
