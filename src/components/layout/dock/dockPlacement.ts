/**
 * Where the Mac dock sits.
 *
 * The iPhone Duo reserves an 84px trailing strip for its vertical status bar,
 * folded and open (`--desktop-content-right`). The menubar, desktop icons,
 * and windows already stop at that strip, so a bottom dock leaves it empty
 * while taking the bottom of a short screen. When a side content inset is at
 * least `SIDE_DOCK_MIN_INSET_PX`, the dock runs vertically inside that strip
 * instead and windows get the bottom of the screen back.
 *
 * Apple documents no Duo detection API, so this follows the measured content
 * insets, not a device check. Left and right are independent: the larger
 * qualifying inset wins, and the trailing (right) side wins a tie. A regular
 * iPhone in landscape reports at most ~62px per side with the Dynamic Island
 * mid-edge, so it keeps the bottom dock. Browsers keep 0px insets, so desktop
 * and Safari always keep the bottom dock.
 */

import {
  type DesktopContentBounds,
  getDesktopContentBounds,
} from "@/utils/desktopContentBounds";
import { SIDE_BAR_EXTENT_VAR } from "@/utils/platform";

export type DockPlacement = "bottom" | "left" | "right";
export type SideDockPlacement = Exclude<DockPlacement, "bottom">;

export type DockLayout = {
  placement: DockPlacement;
  /** Width of the safe-area strip that holds a side dock. 0 for the bottom dock. */
  stripWidth: number;
};

/** Smallest side content inset that moves the dock into that strip. */
export const SIDE_DOCK_MIN_INSET_PX = 72;

/**
 * Gap below the system status cluster at the top of the strip, and the
 * margin left at the bottom of the strip.
 */
export const SIDE_DOCK_CLEARANCE_PX = 12;

/** Minimum gap between a side dock and either edge of its strip. */
export const SIDE_DOCK_GUTTER_PX = 6;

export const BOTTOM_DOCK_LAYOUT: DockLayout = Object.freeze({
  placement: "bottom",
  stripWidth: 0,
});

export function resolveDockLayout(
  viewportWidth: number,
  bounds: DesktopContentBounds,
): DockLayout {
  const left = Math.max(0, bounds.x);
  const right = Math.max(0, viewportWidth - bounds.right);
  if (right >= SIDE_DOCK_MIN_INSET_PX && right >= left) {
    return { placement: "right", stripWidth: right };
  }
  if (left >= SIDE_DOCK_MIN_INSET_PX) {
    return { placement: "left", stripWidth: left };
  }
  return BOTTOM_DOCK_LAYOUT;
}

/**
 * Icon size for a side dock. The bar (icon plus cross padding on both sides)
 * must fit inside the strip with a gutter on each side, so the user's dock
 * scale can shrink a side dock but not grow it past the strip.
 */
export function fitSideDockButtonSize(input: {
  stripWidth: number;
  buttonSize: number;
  crossPadding: number;
}): number {
  const room = Math.floor(
    input.stripWidth - 2 * SIDE_DOCK_GUTTER_PX - 2 * input.crossPadding,
  );
  return Math.max(0, Math.min(input.buttonSize, room));
}

/** Horizontal shift that slides a hidden side dock fully past the screen edge. */
export function sideDockHiddenOffset(input: {
  placement: SideDockPlacement;
  stripWidth: number;
  thickness: number;
}): number {
  const distance = Math.ceil((input.stripWidth + input.thickness) / 2) + 10;
  return input.placement === "right" ? distance : -distance;
}

/**
 * Strip padding at one end. The dock's top sits `SIDE_DOCK_CLEARANCE_PX`
 * below the status cluster the iOS shell reports in `--side-bar-extent`
 * (150px folded, 88px open). The bottom keeps the same margin. The dock is
 * capped to the height between them and scrolls past it, so it never grows
 * up into the cluster. The menubar's top safe-area inset is separate and
 * does not feed this.
 */
export function sideDockEndPadding(end: "top" | "bottom"): string {
  return end === "top"
    ? `calc(var(${SIDE_BAR_EXTENT_VAR}, 0px) + ${SIDE_DOCK_CLEARANCE_PX}px)`
    : `${SIDE_DOCK_CLEARANCE_PX}px`;
}

let snapshot: DockLayout = BOTTOM_DOCK_LAYOUT;

/** Current layout. Referentially stable until the placement or strip width changes. */
export function getDockLayout(): DockLayout {
  if (typeof window === "undefined") return BOTTOM_DOCK_LAYOUT;
  const next = resolveDockLayout(window.innerWidth, getDesktopContentBounds());
  if (
    next.placement !== snapshot.placement ||
    next.stripWidth !== snapshot.stripWidth
  ) {
    snapshot = next;
  }
  return snapshot;
}
