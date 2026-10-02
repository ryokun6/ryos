/**
 * Horizontal edge clearance for full-bleed shell chrome.
 *
 * Apple documents no API that detects iPhone Duo. The page consumes
 * `env(safe-area-inset-left)` and `env(safe-area-inset-right)` independently
 * (`viewport-fit=cover` is set in index.html). The right-hand status bar is
 * the trailing inset — 84pt on the closed outer display in the iOS 27.1
 * simulator — and is never given an extra floor. When the inset is 0 (desktop
 * browsers, and a shell that has not extended under the bar), chrome stays on
 * today's rhythm.
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

const COARSE_TOUCH_MEDIA = "(hover: none) and (pointer: coarse)";

export function displayCornerFloorMediaQuery(): string {
  return COARSE_TOUCH_MEDIA;
}

export function shouldApplyDisplayCornerFloor(input: {
  coarseTouch: boolean;
  viewportWidth: number;
}): boolean {
  return input.coarseTouch && input.viewportWidth > PHONE_LAYOUT_MAX_WIDTH_PX;
}

/** Box offset. Right is the status-bar inset only; left may include the wide-touch floor. */
export function desktopContentEdge(side: "left" | "right"): string {
  return side === "left"
    ? "var(--desktop-content-left)"
    : "var(--desktop-content-right)";
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
