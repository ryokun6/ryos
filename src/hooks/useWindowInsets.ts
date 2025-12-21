import { useCallback, useMemo } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { useDockStore } from "@/stores/useDockStore";
import { getThemeMetadata, type ThemeMetadata } from "@/themes";

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
  const currentTheme = useThemeStore((state) => state.current);
  const dockScale = useDockStore((state) => state.scale);
  const dockHiding = useDockStore((state) => state.hiding);

  // Get theme metadata from centralized theme definitions
  const themeMetadata: ThemeMetadata = useMemo(
    () => getThemeMetadata(currentTheme),
    [currentTheme]
  );

  const { isWindows: isXpTheme, isMac: isMacTheme } = themeMetadata;

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
    const isTauriApp = typeof window !== "undefined" && "__TAURI__" in window;

    // In Tauri, menubar is 32px for mac themes; otherwise use theme defaults
    const needsTauriMenubar = isTauriApp && isMacTheme;
    const menuBarHeight = needsTauriMenubar
      ? 32
      : themeMetadata.menuBarHeight;

    const taskbarHeight = themeMetadata.taskbarHeight;

    // Use scaled dock height for accurate constraints (0 if dock hiding is enabled)
    const dockHeight =
      themeMetadata.hasDock && !dockHiding
        ? Math.round(themeMetadata.baseDockHeight * dockScale)
        : 0;

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
    themeMetadata,
    isMacTheme,
    getSafeAreaBottomInset,
    dockScale,
    dockHiding,
  ]);

  return {
    computeInsets,
    getSafeAreaBottomInset,
    isXpTheme,
    isMacTheme,
    currentTheme,
    themeMetadata,
  };
}
