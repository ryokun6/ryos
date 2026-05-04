import { createContext, useContext } from "react";
import type { WindowInsets } from "@/hooks/useWindowInsets";

/**
 * Context exposed by `WindowFrame` to its `drawer` slot so the drawer can
 * read the window's current bounds and (optionally) request the window to
 * reposition / resize when its preferred expansion side does not fit the
 * viewport.
 *
 * Values are kept intentionally minimal: the drawer only needs raw geometry,
 * the constraints already in effect for this window, and a function to apply
 * a new (position, size) pair via the same code path the WindowManager uses
 * for snap / maximize.
 */
export interface WindowFrameDrawerContextValue {
  position: { x: number; y: number };
  size: { width: number; height: number };
  /** Resolved window constraints (already merged with app defaults). */
  constraints: {
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number | string;
    maxHeight?: number | string;
  };
  /**
   * True while the user is actively dragging or resizing the window. Drawer
   * implementations should suppress automatic reposition/resize requests
   * during this period to avoid fighting the manual input.
   */
  isInteracting: boolean;
  /** Compute current insets (menu bar / dock / taskbar / safe-area). */
  computeInsets: () => WindowInsets;
  /**
   * Apply a new position + size to the window, going through the same
   * persistence path as snap / maximize. May be a no-op if the window does
   * not have an instance id yet.
   */
  applyWindowFrame: (next: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
}

export const WindowFrameDrawerContext =
  createContext<WindowFrameDrawerContextValue | null>(null);

/** Hook for drawers rendered inside a `WindowFrame`'s drawer slot. */
export function useWindowFrameDrawerContext():
  | WindowFrameDrawerContextValue
  | null {
  return useContext(WindowFrameDrawerContext);
}
