/**
 * Horizontal edge clearance for full-bleed shell chrome.
 *
 * Apple documents no API that detects iPhone Duo. Only the native iOS shell
 * (`html[data-ios-shell]`, set when `window.ryosDesktop.platform === "ios"`)
 * consumes `env(safe-area-inset-left)` and `env(safe-area-inset-right)`.
 * Safari and desktop browsers keep a 0px content origin because the browser
 * already handles its safe areas. The right-hand status bar is the trailing
 * inset — 84pt on the closed outer display in the iOS 27.1 simulator — and is
 * never given an extra floor.
 *
 * The menubar and taskbar are offset by `--desktop-content-*` so their boxes
 * stop at the status bar. Inner padding is only the existing rhythm (or the
 * 78px traffic-light prefix), otherwise the inset would be applied twice.
 * Wallpaper does not use these variables.
 *
 * A 12px left floor applies only on wide coarse-touch viewports, via the
 * `--desktop-content-left` media query in index.css. The menubar rhythm is
 * `0.5rem` (8px at the 16px root). Folding that floor into padding on desktop
 * would grow 8px to 20px. Phone-width stays on the raw inset.
 *
 * Fully expanded, the inner display is 669×951pt with 55pt corners (iOS 27.1
 * simulator profile). A 25px menubar still meets that curve, so the menubar's
 * left edge uses a 28px floor when both viewport axes are at least 500px.
 * The cover display's shorter side is 466pt and a regular iPhone's is under
 * 450pt, so those keep the 12px floor. Windows, icons, and the dock stay on
 * `--desktop-content-*`.
 *
 * Traffic-light clearance stays a separate 78px prefix gated by
 * `needsTrafficLightClearance`.
 */

export const MENUBAR_HORIZONTAL_RHYTHM = "0.5rem";

/** Minimum left inset once the corner floor is active. Applied as a box offset, not extra padding. */
export const DISPLAY_CORNER_FLOOR_PX = 12;

/**
 * Viewports at or below this width keep the raw left inset.
 * Matches the default breakpoint in `useIsPhone` (`innerWidth < 640`).
 * The CSS media query uses `min-width: 641px`.
 */
export const PHONE_LAYOUT_MAX_WIDTH_PX = 640;

/**
 * Both axes must clear this before the larger menubar corner floor applies.
 * Sits between the cover display's shorter side (466pt) and the fully
 * expanded inner display's shorter side (626–669pt).
 */
export const EXPANDED_DISPLAY_MIN_PX = 500;

/**
 * Menubar box offset on the fully expanded inner display.
 * The Apple menu trigger adds `px-2` inside the 8px rhythm, so the glyph
 * starts 16px past this floor — past the 55pt corner through a 25px bar.
 */
export const EXPANDED_MENUBAR_LEFT_FLOOR_PX = 28;

const COARSE_TOUCH_MEDIA = "(hover: none) and (pointer: coarse)";

export function displayCornerFloorMediaQuery(): string {
  return COARSE_TOUCH_MEDIA;
}

export function shouldApplyDisplayCornerFloor(input: {
  iosShell: boolean;
  coarseTouch: boolean;
  viewportWidth: number;
}): boolean {
  return (
    input.iosShell &&
    input.coarseTouch &&
    input.viewportWidth > PHONE_LAYOUT_MAX_WIDTH_PX
  );
}

/** Box offset. Right is the status-bar inset only; left may include the wide-touch floor. */
export function desktopContentEdge(side: "left" | "right"): string {
  return side === "left"
    ? "var(--desktop-content-left)"
    : "var(--desktop-content-right)";
}

/**
 * True on the fully expanded inner display inside the iOS shell.
 * Requires both axes so a wide-but-short cover or a landscape iPhone misses.
 */
export function shouldApplyExpandedMenubarCorner(input: {
  iosShell: boolean;
  coarseTouch: boolean;
  viewportWidth: number;
  viewportHeight: number;
}): boolean {
  return (
    input.iosShell &&
    input.coarseTouch &&
    input.viewportWidth >= EXPANDED_DISPLAY_MIN_PX &&
    input.viewportHeight >= EXPANDED_DISPLAY_MIN_PX
  );
}

/**
 * Menubar left box edge. At least the content inset, and at least
 * `--menubar-corner-floor` when the expanded-display query sets it.
 * A larger safe-area inset wins, so the floor is not added on top.
 */
export function menubarLeftEdge(): string {
  return "max(var(--desktop-content-left), var(--menubar-corner-floor, 0px))";
}

/**
 * Padding inside the already-offset menubar box.
 * Traffic lights (left only): `78px`. Otherwise `0.5rem`.
 */
export function menubarInnerPadding(options: {
  side: "left" | "right";
  trafficLightClearance: boolean;
}): string {
  if (options.trafficLightClearance && options.side === "left") {
    return "78px";
  }
  return MENUBAR_HORIZONTAL_RHYTHM;
}
