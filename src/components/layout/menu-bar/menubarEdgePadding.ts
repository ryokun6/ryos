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
 * Aqua Glass, and every theme outside the iOS shell, offset the menubar box
 * by `--desktop-content-*` so it stops at the status bar. Inner padding is
 * only the existing rhythm (or the 78px traffic-light prefix), otherwise the
 * inset would be applied twice. Wallpaper does not use these variables.
 *
 * Opaque Mac chrome in the iOS shell (classic Mac OS X and System 7) does
 * the opposite with the same insets: the bar's background and bottom border
 * run to the screen edges, and the insets move into padding so the menu
 * content stays put. The content row keeps its theme height. The box grows
 * upward by `--menubar-safe-top`, so its bottom stays at
 * `menuBarHeight + safeTop` — the same edge window clamping already uses.
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
 *
 * `--menubar-safe-top` is `env(safe-area-inset-top)` inside the iOS shell and
 * 0px in the browser. Aqua Glass keeps its theme height and sits under that
 * inset, so wallpaper stays full-bleed in the strip above it. Opaque Mac
 * chrome in the shell paints that strip with the menubar instead.
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
  /** The shell's side status bar. A matching window size without it is an iPad window, not the Duo cover. */
  hasSideStatusBar: boolean;
}): boolean {
  if (!input.iosShell || !input.coarseTouch || !input.hasSideStatusBar) return false;
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

/** Menubar box top. 0px until the iOS shell consumes the top safe area. */
export function menubarSafeTop(): string {
  return "var(--menubar-safe-top, 0px)";
}

/**
 * Opaque Mac menubars (classic Mac OS X and System 7) inside the iOS shell
 * paint through the safe-area insets. Aqua Glass stays inset so the
 * wallpaper shows above a transparent bar. Safari and desktop keep the
 * inset box even when `env(safe-area-inset-*)` is non-zero, because those
 * insets are only copied into the menubar variables for the shell.
 */
export function menubarFillsSafeArea(input: {
  iosShell: boolean;
  /** False for Aqua Glass. Classic Aqua and System 7 are opaque. */
  opaqueMenubar: boolean;
}): boolean {
  return input.iosShell && input.opaqueMenubar;
}

/** Menubar box top. Edge of the screen when the background fills the inset. */
export function menubarBoxTop(fillsSafeArea: boolean): string {
  return fillsSafeArea ? "0px" : menubarSafeTop();
}

/** Menubar box left. The corner floor and status-bar inset become padding when filling. */
export function menubarBoxLeft(fillsSafeArea: boolean): string {
  return fillsSafeArea ? "0px" : menubarLeftEdge();
}

/** Menubar box right. Same split as {@link menubarBoxLeft}. */
export function menubarBoxRight(fillsSafeArea: boolean): string {
  return fillsSafeArea ? "0px" : menubarRightEdge();
}

/**
 * Border-box height. Filling adds the top inset on top of the theme height
 * so the content row stays the same size and the bottom edge does not move.
 */
export function menubarBoxHeight(
  fillsSafeArea: boolean,
  contentHeight: string,
): string {
  if (!fillsSafeArea) return contentHeight;
  return `calc(${contentHeight} + ${menubarSafeTop()})`;
}

/** Top padding that holds the content row below the filled safe area. */
export function menubarPaddingTop(fillsSafeArea: boolean): string {
  return fillsSafeArea ? menubarSafeTop() : "0px";
}

/**
 * Horizontal padding. The inset box already starts at the content edge, so
 * it only needs the rhythm. The full-bleed box adds that edge as padding.
 */
export function menubarHorizontalPadding(input: {
  fillsSafeArea: boolean;
  side: "left" | "right";
  trafficLightClearance: boolean;
}): string {
  const inner = menubarInnerPadding({
    side: input.side,
    trafficLightClearance: input.trafficLightClearance,
  });
  if (!input.fillsSafeArea) return inner;
  const edge = input.side === "left" ? menubarLeftEdge() : menubarRightEdge();
  return `calc(${edge} + ${inner})`;
}

let safeTopProbe: HTMLDivElement | null = null;

/**
 * Used pixel height of `--menubar-safe-top`. A custom property that still
 * holds `env()` or `var()` does not parse with `parseInt`, so this resolves
 * it through layout. 0 when the document is unavailable or the inset is 0.
 */
export function measureMenubarSafeTop(): number {
  if (typeof document === "undefined") return 0;
  if (!safeTopProbe) {
    safeTopProbe = document.createElement("div");
    safeTopProbe.setAttribute("aria-hidden", "true");
    safeTopProbe.style.cssText = [
      "position:fixed",
      "left:0",
      "top:0",
      "width:0",
      "visibility:hidden",
      "pointer-events:none",
      "padding:0",
      "margin:0",
      "border:0",
      "height:var(--menubar-safe-top, 0px)",
    ].join(";");
    document.documentElement.appendChild(safeTopProbe);
  }
  return Math.round(Math.max(0, safeTopProbe.getBoundingClientRect().height));
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

/**
 * Inner display held upright (669×951pt, iOS 27.1 simulator), inside the iOS
 * shell only. The system draws the clock and wi-fi as a pill in the top-right
 * corner, about x 542–653pt and y 19–75pt, and reports only an 82pt top inset
 * with no side inset. iOS exposes no frame for that pill, so its place is
 * measured, the same way the 84pt cover strip is.
 *
 * In this pose the menubar row moves up beside the pill instead of below the
 * 82pt inset: the row is centred on the pill's centre line and its right end
 * stops 12px short of the pill's left edge. Windows, icons, the dock and the
 * wallpaper keep the system inset. Every other display, orientation and the
 * browser keep the layout above.
 */
export const INNER_STATUS_PILL_CENTER_Y_PX = 47;
export const INNER_STATUS_PILL_LEFT_PX = 542;
export const STATUS_PILL_CLEARANCE_PX = 12;

/**
 * The inner display upright is 669 wide and 951 tall. A regular iPhone is at
 * most ~440 wide; any full-screen iPad is at least 744 wide. An iPad window of
 * a similar size gets a top inset of ~24–32px, never the 82px this pose has.
 */
export const INNER_UPRIGHT_MIN_WIDTH_PX = 600;
export const INNER_UPRIGHT_MAX_WIDTH_PX = 720;
export const INNER_UPRIGHT_MIN_HEIGHT_PX = 880;
export const INNER_UPRIGHT_MAX_HEIGHT_PX = 1000;
export const INNER_UPRIGHT_MIN_TOP_INSET_PX = 60;

export function shouldRaiseMenubarBesideStatusPill(input: {
  iosShell: boolean;
  coarseTouch: boolean;
  viewportWidth: number;
  viewportHeight: number;
  /** Used height of `--menubar-safe-top`, from {@link measureMenubarSafeTop}. */
  safeTop: number;
}): boolean {
  return (
    input.iosShell &&
    input.coarseTouch &&
    input.viewportWidth >= INNER_UPRIGHT_MIN_WIDTH_PX &&
    input.viewportWidth <= INNER_UPRIGHT_MAX_WIDTH_PX &&
    input.viewportHeight >= INNER_UPRIGHT_MIN_HEIGHT_PX &&
    input.viewportHeight <= INNER_UPRIGHT_MAX_HEIGHT_PX &&
    input.safeTop >= INNER_UPRIGHT_MIN_TOP_INSET_PX
  );
}

/** Distance from the viewport's right edge to where the row must stop. */
export function statusPillRightClearance(viewportWidth: number): number {
  return Math.max(
    0,
    viewportWidth - INNER_STATUS_PILL_LEFT_PX + STATUS_PILL_CLEARANCE_PX,
  );
}

/**
 * Box for the raised row. Same row height. An inset (Aqua Glass) box sits on
 * the pill's centre line and ends at the clearance. A filling (opaque) box
 * still paints from the top edge across the full width; the row moves with
 * its top padding and the clearance becomes right padding.
 */
export function raisedMenubarBox(input: {
  fillsSafeArea: boolean;
  contentHeight: string;
  viewportWidth: number;
}): {
  top: string;
  right: string;
  height: string;
  paddingTop: string;
  paddingRight: string;
} {
  const center = `${INNER_STATUS_PILL_CENTER_Y_PX}px`;
  const rowTop = `calc(${center} - (${input.contentHeight}) / 2)`;
  const clearance = `${statusPillRightClearance(input.viewportWidth)}px`;
  if (input.fillsSafeArea) {
    return {
      top: "0px",
      right: "0px",
      height: `calc(${center} + (${input.contentHeight}) / 2)`,
      paddingTop: rowTop,
      paddingRight: `calc(${clearance} + ${MENUBAR_HORIZONTAL_RHYTHM})`,
    };
  }
  return {
    top: rowTop,
    right: clearance,
    height: input.contentHeight,
    paddingTop: "0px",
    paddingRight: MENUBAR_HORIZONTAL_RHYTHM,
  };
}

/**
 * Live check for the pose above: the native iOS shell, a coarse pointer, and
 * the inner display's upright size and top inset. False in the browser and
 * on the server.
 */
export function readMenubarBesideStatusPill(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }
  const iosShell = window.ryosDesktop?.platform === "ios";
  if (!iosShell) return false;
  const coarseTouch =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  return shouldRaiseMenubarBesideStatusPill({
    iosShell,
    coarseTouch,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    safeTop: measureMenubarSafeTop(),
  });
}

/**
 * Safe top for windows: the menubar's bottom minus the menubar height. Window
 * limits add the menubar height to it, so in the pill pose the top limit
 * moves up by exactly what the row moved, and the gap under the bar stays the
 * same. Everywhere else this is {@link measureMenubarSafeTop}.
 */
export function windowSafeTopBesideStatusPill(menuBarHeight: number): number {
  return Math.max(0, INNER_STATUS_PILL_CENTER_Y_PX - menuBarHeight / 2);
}

export function measureWindowSafeTop(menuBarHeight: number): number {
  // No Mac menubar (Windows themes): nothing moved, keep the system inset.
  return menuBarHeight > 0 && readMenubarBesideStatusPill()
    ? windowSafeTopBesideStatusPill(menuBarHeight)
    : measureMenubarSafeTop();
}
