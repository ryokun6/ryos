/**
 * Horizontal edge clearance for full-bleed shell chrome (menubar, taskbar).
 *
 * `env(safe-area-inset-*)` is 0 until the page opts into edge-to-edge layout
 * (`viewport-fit=cover` in index.html) and the host webview actually extends
 * under the reserved regions. The iPhone Duo open pose needs a floor so the
 * Apple logo and the opposite status controls still clear the rounded corners
 * when those insets report 0.
 *
 * The floor is not applied on desktop or phone-width layouts. The menubar's
 * existing rhythm is `0.5rem`, which is 8px at the 16px root (`html` does not
 * override the browser default, and Tailwind preflight does not either).
 * `max(inset, 12px) + 0.5rem` with a 0 inset would grow that padding from 8px
 * to 20px. Phone-width (closed Duo) already matches production via `env()`
 * alone, so the floor starts only above `useIsPhone`'s 640px breakpoint, and
 * only for a coarse touch pointer — not for desktop browsers or the Electron
 * shell.
 *
 * Traffic-light clearance stays a separate 78px prefix gated by
 * `needsTrafficLightClearance`. It is never replaced by this floor.
 */

export const MENUBAR_HORIZONTAL_RHYTHM = "0.5rem";

/** Minimum inset once the corner floor is active. The rhythm is added outside this. */
export const DISPLAY_CORNER_FLOOR_PX = 12;

/**
 * Viewports at or below this width keep today's unfloored padding.
 * Matches the default breakpoint in `useIsPhone` (`innerWidth < 640`).
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
  return (
    input.coarseTouch && input.viewportWidth > PHONE_LAYOUT_MAX_WIDTH_PX
  );
}

function insetVariable(side: "left" | "right" | "bottom"): string {
  return `safe-area-inset-${side}`;
}

/**
 * Menubar padding for one side.
 *
 * Unfloored (desktop, phone-width, Electron): `calc(0.5rem + env(...))`.
 * Wide touch: `calc(max(env(...), 12px) + 0.5rem)`.
 * Traffic lights (left only): `calc(78px + env(...))`, floor ignored.
 */
export function menubarHorizontalPadding(options: {
  side: "left" | "right";
  trafficLightClearance: boolean;
  cornerFloor: boolean;
}): string {
  const inset = insetVariable(options.side);
  if (options.trafficLightClearance && options.side === "left") {
    return `calc(78px + env(${inset}, 0px))`;
  }
  if (options.cornerFloor) {
    return `calc(max(env(${inset}, 0px), ${DISPLAY_CORNER_FLOOR_PX}px) + ${MENUBAR_HORIZONTAL_RHYTHM})`;
  }
  return `calc(${MENUBAR_HORIZONTAL_RHYTHM} + env(${inset}, 0px))`;
}

/**
 * Padding for other full-bleed chrome that already sits on the viewport edge
 * with no extra rhythm (the Windows taskbar item row).
 *
 * Unfloored: `env(safe-area-inset-*, 0px)` — 0px on desktop.
 * Wide touch: `max(env(...), 12px)`.
 */
export function edgeChromeHorizontalPadding(options: {
  side: "left" | "right";
  cornerFloor: boolean;
}): string {
  const inset = insetVariable(options.side);
  if (options.cornerFloor) {
    return `max(env(${inset}, 0px), ${DISPLAY_CORNER_FLOOR_PX}px)`;
  }
  return `env(${inset}, 0px)`;
}

/** Real safe-area inset only. 0 on desktop, so centered chrome does not move. */
export function safeAreaInsetPadding(
  side: "left" | "right" | "bottom",
): string {
  return `env(${insetVariable(side)}, 0px)`;
}
