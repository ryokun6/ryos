import { getDockLayout, type DockPlacement } from "@/components/layout/dock/dockPlacement";
import { measureMenubarSafeTop } from "@/components/layout/menu-bar/menubarEdgePadding";
import { useDockStore } from "@/stores/useDockStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { getThemeMetadata } from "@/themes";
import { hasDesktopWindowChrome } from "@/utils/platform";

export interface WindowInsets {
  menuBarHeight: number;
  taskbarHeight: number;
  safeAreaBottom: number;
  topInset: number;
  bottomInset: number;
  dockHeight: number;
}

export type WindowChromeInsetInput = {
  menuBarHeight: number;
  taskbarHeight: number;
  hasDock: boolean;
  baseDockHeight: number;
  dockScale: number;
  dockHiding: boolean;
  dockPlacement: DockPlacement;
  isAquaGlass: boolean;
  safeAreaBottom: number;
  safeTop: number;
};

/**
 * Menu bar, taskbar, dock, and safe-area insets that a window must stay inside.
 * Pure: callers pass the theme and dock inputs they already have.
 */
export function computeWindowChromeInsets(
  input: WindowChromeInsetInput,
): WindowInsets {
  let dockHeight =
    input.hasDock && !input.dockHiding && input.dockPlacement === "bottom"
      ? Math.round(input.baseDockHeight * input.dockScale)
      : 0;

  // The Aqua glass dock is taller than the classic dock (8px vertical padding
  // per side vs 4px) and is lifted 6px off the screen edge. Reserve that extra
  // space so windows don't overlap the glass dock.
  if (dockHeight > 0 && input.isAquaGlass) {
    const GLASS_DOCK_LIFT = 6;
    const glassExtraBarHeight =
      (Math.round(8 * input.dockScale) - Math.round(4 * input.dockScale)) * 2;
    dockHeight += glassExtraBarHeight + GLASS_DOCK_LIFT;
  }

  const topInset = input.menuBarHeight + Math.max(0, input.safeTop);
  const bottomInset =
    input.taskbarHeight + dockHeight + Math.max(0, input.safeAreaBottom);

  return {
    menuBarHeight: input.menuBarHeight,
    taskbarHeight: input.taskbarHeight,
    safeAreaBottom: input.safeAreaBottom,
    topInset,
    bottomInset,
    dockHeight,
  };
}

/** Parsed `--sat-safe-area-bottom`, or 20px on a phone when the variable is unset. */
export function readSafeAreaBottom(): number {
  if (typeof document === "undefined" || typeof window === "undefined") return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(
    "--sat-safe-area-bottom",
  );
  const safeAreaInset = parseInt(raw, 10);
  const isMobile = window.innerWidth < 768;
  return !isNaN(safeAreaInset) ? safeAreaInset : isMobile ? 20 : 0;
}

/** Current chrome insets from the theme, dock, and safe-area CSS variables. */
export function readLiveWindowInsets(): WindowInsets {
  const themeState = useThemeStore.getState();
  const metadata = getThemeMetadata(themeState.current);
  const isMacTheme = metadata.isMac;
  const isAquaGlass =
    themeState.current === "macosx" && themeState.aquaMaterial === "glass";
  const needsDesktopMenubar = hasDesktopWindowChrome() && isMacTheme;
  const menuBarHeight = needsDesktopMenubar ? 32 : metadata.menuBarHeight;
  const dock = useDockStore.getState();
  const safeTop =
    typeof document === "undefined" ? 0 : measureMenubarSafeTop();

  return computeWindowChromeInsets({
    menuBarHeight,
    taskbarHeight: metadata.taskbarHeight,
    hasDock: metadata.hasDock,
    baseDockHeight: metadata.baseDockHeight,
    dockScale: dock.scale,
    dockHiding: dock.hiding,
    dockPlacement: getDockLayout().placement,
    isAquaGlass,
    safeAreaBottom: readSafeAreaBottom(),
    safeTop,
  });
}
