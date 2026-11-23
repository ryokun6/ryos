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

/** Margin on each end of a dock icon along the dock (`DockIconButton`). */
export const SIDE_DOCK_ITEM_MARGIN_PX = 4;

/** Length of a divider along a side dock: 10px padding each end + 1px line. */
export const SIDE_DOCK_DIVIDER_LENGTH_PX = 21;

/**
 * Smallest icon the length fit shrinks to. Below it the dock keeps this size
 * and scrolls inside the strip instead.
 */
export const SIDE_DOCK_MIN_BUTTON_PX = 28;

/**
 * Icon size that lets the whole side dock fit the strip's length: the space
 * between the top padding (under the live status cluster, which grows with
 * the Dynamic Island) and the bottom margin. Bar length is
 * `2 * padding + items * (icon + 2 * margin) + dividers * divider`. Only ever
 * shrinks the given size, never below `SIDE_DOCK_MIN_BUTTON_PX`. An unknown
 * or empty length keeps the size.
 */
export function fitSideDockButtonLength(input: {
  stripLength: number | null;
  buttonSize: number;
  itemCount: number;
  dividerCount: number;
  padding: number;
}): number {
  const { stripLength, buttonSize, itemCount, dividerCount, padding } = input;
  if (stripLength === null || !(stripLength > 0) || itemCount <= 0) {
    return buttonSize;
  }
  const room =
    stripLength - 2 * padding - dividerCount * SIDE_DOCK_DIVIDER_LENGTH_PX;
  const fit = Math.floor(room / itemCount - 2 * SIDE_DOCK_ITEM_MARGIN_PX);
  const floor = Math.min(buttonSize, SIDE_DOCK_MIN_BUTTON_PX);
  return Math.max(floor, Math.min(buttonSize, fit));
}

/**
 * Edge where a phone-width window frame drops its 8px padding. A side dock is
 * centered in its strip, so the window runs to the strip edge and the gap to
 * the dock is the dock's own margin, as in the wider layout where frames
 * have no padding.
 */
export function phoneWindowFlushEdge(
  viewportWidth: number,
  layout: DockLayout,
): SideDockPlacement | null {
  if (viewportWidth >= 768 || layout.placement === "bottom") return null;
  return layout.placement;
}

/**
 * Distance from the screen edge to the side dock's centre line. The system
 * draws the status column (camera, clock, Wi-Fi) a little inward of the
 * strip's centre — about 48pt from the edge in the 84pt Duo strip — and the
 * iOS shell reports that centre (`sideStatusBarCenter`, from the edge that
 * holds the strip). The dock lines up with it. Without a report (other
 * shells, older app builds) the dock stays centred in the strip. The dock
 * never crosses either edge of the strip, and a dock wider than the strip
 * stays centred.
 */
export function sideDockCenterFromEdge(input: {
  stripWidth: number;
  thickness: number;
  center: number | null;
}): number {
  const { stripWidth, thickness, center } = input;
  const middle = stripWidth / 2;
  if (center === null || !Number.isFinite(center) || !(center > 0)) return middle;
  if (thickness >= stripWidth) return middle;
  const half = thickness / 2;
  return Math.min(stripWidth - half, Math.max(half, center));
}

/**
 * Strip padding across a side dock that puts its centre line
 * `sideDockCenterFromEdge` from the screen edge: `outer` on the screen-edge
 * side, `inner` on the content side. Both are 0 when the dock is centred in
 * the strip, so the dock keeps its size and only moves.
 */
export function sideDockCrossPadding(input: {
  stripWidth: number;
  thickness: number;
  center: number | null;
}): { outer: number; inner: number } {
  const offset = 2 * sideDockCenterFromEdge(input) - input.stripWidth;
  return { outer: Math.max(0, offset), inner: Math.max(0, -offset) };
}

/** Horizontal shift that slides a hidden side dock fully past the screen edge. */
export function sideDockHiddenOffset(input: {
  placement: SideDockPlacement;
  stripWidth: number;
  thickness: number;
  /** Centre line's distance from the screen edge; the strip's centre if omitted. */
  centerFromEdge?: number;
}): number {
  const center = input.centerFromEdge ?? input.stripWidth / 2;
  const distance = Math.ceil(center + input.thickness / 2) + 10;
  return input.placement === "right" ? distance : -distance;
}

/**
 * Strip padding at one end. The dock's top sits `SIDE_DOCK_CLEARANCE_PX`
 * below the status cluster the iOS shell reports in `--side-bar-extent`:
 * the live bottom of the status column (it follows the Dynamic Island), or
 * the fixed 150px folded / 104px open before the first reading. The bottom keeps at least the same margin,
 * never less than the home-indicator zone (env safe-area bottom, 34px on
 * both Duo poses), so an overfull dock stays clear of the rounded corner.
 * The icons shrink to fit the height between them
 * (`fitSideDockButtonLength`); past the minimum icon the dock is capped there
 * and scrolls, so it never grows up into the cluster. The menubar's top safe-area inset is separate and
 * does not feed this.
 */
export function sideDockEndPadding(end: "top" | "bottom"): string {
  return end === "top"
    ? `calc(var(${SIDE_BAR_EXTENT_VAR}, 0px) + ${SIDE_DOCK_CLEARANCE_PX}px)`
    : `max(${SIDE_DOCK_CLEARANCE_PX}px, env(safe-area-inset-bottom))`;
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
