/**
 * Horizontal edge clearance for full-bleed shell chrome.
 *
 * Apple documents no API that detects iPhone Duo. Only the native iOS shell
 * (`html[data-ios-shell]`, set when `window.ryosDesktop.platform === "ios"`)
 * consumes `env(safe-area-inset-left)` and `env(safe-area-inset-right)`.
 * Safari and desktop browsers keep a 0px content origin because the browser
 * already handles its safe areas. The right-hand status bar is the trailing
 * inset — 84pt on the closed outer display in the iOS 27.1 simulator. When
 * the system paints that bar over the web view, `env(safe-area-inset-right)`
 * is 0, so the folded cover display (466×678pt) floors the right inset at
 * 84px. A regular iPhone portrait is at most ~440pt wide, and the open inner
 * display's shorter side is at least 626pt, so neither matches.
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
 * simulator profile). A 25px menubar still meets that curve on both ends, so
 * both menubar edges use a 28px floor when both viewport axes are at least
 * 500px. The cover display's shorter side is 466pt and a regular iPhone's is
 * under 450pt, so those keep the content inset. Windows, icons, and the dock
 * stay on `--desktop-content-*`.
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
 * Menubar box offset on each side of the fully expanded inner display.
 * The menu trigger adds `px-2` inside the 8px rhythm, so the glyph starts
 * 16px past this floor — past the 55pt corner through a 25px bar.
 * The same floor applies on the right. A larger status-bar inset wins.
 */
export const EXPANDED_MENUBAR_CORNER_FLOOR_PX = 28;

/**
 * Trailing status bar on the folded cover display (iOS 27.1 simulator).
 * Applied as a floor under `env(safe-area-inset-right)`, not added to it.
 */
export const FOLDED_COVER_STATUS_BAR_PX = 84;

export function shouldApplyFoldedStatusBarInset(input: {
  iosShell: boolean;
  coarseTouch: boolean;
  viewportWidth: number;
  viewportHeight: number;
}): boolean {
  if (!input.iosShell || !input.coarseTouch) return false;
  const portraitCover =
    input.viewportWidth >= 450 &&
    input.viewportWidth <= 520 &&
    input.viewportHeight >= 600;
  const landscapeCover =
    input.viewportWidth >= 620 &&
    input.viewportWidth <= 760 &&
    input.viewportHeight >= 440 &&
    input.viewportHeight <= 540;
  return portraitCover || landscapeCover;
}

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
 * Menubar box edge. At least the content inset, and at least
 * `--menubar-corner-floor` when the expanded-display query sets it.
 * A larger safe-area inset wins, so the floor is not added on top.
 * Left and right use the same floor.
 */
export function menubarLeftEdge(): string {
  return "max(var(--desktop-content-left), var(--menubar-corner-floor, 0px))";
}

export function menubarRightEdge(): string {
  return "max(var(--desktop-content-right), var(--menubar-corner-floor, 0px))";
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
