/**
 * Usable desktop rectangle.
 *
 * Apple documents no API for detecting iPhone Duo — it reports as an iPhone,
 * and `userInterfaceIdiom` / device model / user agent are the wrong signal.
 * The vertical status bar is whichever safe-area inset is non-zero (84pt on
 * the trailing edge of the closed outer display in the iOS 27.1 simulator).
 * Left and right are independent; do not mirror one side onto the other.
 *
 * `--desktop-content-left/right` are those insets, plus a 12px left floor on
 * wide coarse-touch viewports when the left inset is 0. Wallpaper ignores
 * them and paints the full viewport. Zero insets reproduce today's viewport
 * math exactly.
 */

export type DesktopContentInsets = {
  left: number;
  right: number;
  top?: number;
  bottom?: number;
};

export type DesktopContentBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

const SERVER_BOUNDS: DesktopContentBounds = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  right: 0,
  bottom: 0,
};

export function desktopContentBounds(input: {
  viewportWidth: number;
  viewportHeight: number;
  insets: DesktopContentInsets;
}): DesktopContentBounds {
  const left = Math.max(0, input.insets.left);
  const rightInset = Math.max(0, input.insets.right);
  const top = Math.max(0, input.insets.top ?? 0);
  const bottomInset = Math.max(0, input.insets.bottom ?? 0);
  const width = Math.max(0, input.viewportWidth - left - rightInset);
  const height = Math.max(0, input.viewportHeight - top - bottomInset);
  return {
    x: left,
    y: top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

/** True when chrome must leave the viewport edge. False on desktop (insets 0). */
export function hasHorizontalContentInset(
  bounds: DesktopContentBounds,
  viewportWidth: number,
): boolean {
  return bounds.x > 0 || bounds.right < viewportWidth;
}

/**
 * Phone-width frames stay `"100%"` until a horizontal inset exists.
 * At that point the frame uses a pixel width so `min-width: 100%` cannot
 * pull it back under the status bar.
 */
export function windowUsesExplicitWidth(
  viewportWidth: number,
  bounds: DesktopContentBounds,
): boolean {
  return (
    viewportWidth >= 768 || hasHorizontalContentInset(bounds, viewportWidth)
  );
}

/**
 * Initial / resize fit. With no horizontal inset this matches the previous
 * overflow clamp (`x = max(0, innerWidth - width)` only when the window
 * extends past the viewport) and leaves a negative `x` alone.
 */
export function clampWindowToContentBounds(input: {
  x: number;
  width: number;
  viewportWidth: number;
  bounds: DesktopContentBounds;
  mobile: boolean;
}): { x: number; width: number } {
  const { bounds, viewportWidth } = input;
  if (!hasHorizontalContentInset(bounds, viewportWidth)) {
    if (input.x + input.width > viewportWidth) {
      return { x: Math.max(0, viewportWidth - input.width), width: input.width };
    }
    return { x: input.x, width: input.width };
  }
  if (input.mobile) {
    return { x: bounds.x, width: bounds.width };
  }
  let x = input.x;
  let width = input.width;
  if (bounds.x > 0 && x < bounds.x) x = bounds.x;
  if (x + width > bounds.right) {
    const room = bounds.right - x;
    if (room < width) width = Math.max(0, room);
  }
  return { x, width };
}

export function windowDragLimits(input: {
  windowWidth: number;
  viewportWidth: number;
  bounds: DesktopContentBounds;
}): { minX: number; maxX: number } {
  const right = hasHorizontalContentInset(input.bounds, input.viewportWidth)
    ? input.bounds.right
    : input.viewportWidth;
  return {
    minX: input.bounds.x > 0 ? input.bounds.x : -(input.windowWidth - 80),
    maxX: right - 80,
  };
}

export function windowSnapEdges(
  viewportWidth: number,
  bounds: DesktopContentBounds,
): { left: number; right: number } {
  if (!hasHorizontalContentInset(bounds, viewportWidth)) {
    return { left: 0, right: viewportWidth };
  }
  return { left: bounds.x, right: bounds.right };
}

export function windowSnapGeometry(input: {
  viewportWidth: number;
  bounds: DesktopContentBounds;
  zone: "left" | "right";
}): { x: number; width: number } {
  const inset = hasHorizontalContentInset(input.bounds, input.viewportWidth);
  const span = inset ? input.bounds.width : input.viewportWidth;
  const origin = inset ? input.bounds.x : 0;
  const width = Math.floor(span / 2);
  return {
    width,
    x: input.zone === "left" ? origin : origin + width,
  };
}

export function windowResizeMaxWidth(
  viewportWidth: number,
  bounds: DesktopContentBounds,
): number {
  return hasHorizontalContentInset(bounds, viewportWidth)
    ? bounds.right
    : viewportWidth;
}

export function windowResizeMinLeft(bounds: DesktopContentBounds): number {
  return bounds.x > 0 ? bounds.x : 0;
}

export function mobileFullWidthFrame(
  viewportWidth: number,
  bounds: DesktopContentBounds,
): { x: number; width: number } {
  if (!hasHorizontalContentInset(bounds, viewportWidth)) {
    return { x: 0, width: viewportWidth };
  }
  return { x: bounds.x, width: bounds.width };
}

export function maximizedWindowFrame(input: {
  viewportWidth: number;
  bounds: DesktopContentBounds;
  maxWidthConstraint: number | null;
  defaultWidth: number;
  restoring: boolean;
}): { x: number; width: number } {
  const wide = input.viewportWidth >= 768;
  const inset = hasHorizontalContentInset(input.bounds, input.viewportWidth);
  const available = inset ? input.bounds.width : input.viewportWidth;
  const origin = inset ? input.bounds.x : 0;
  if (input.restoring) {
    return {
      x: Math.max(origin, origin + (available - input.defaultWidth) / 2),
      width: input.defaultWidth,
    };
  }
  let width = available;
  if (wide) {
    const cap = input.maxWidthConstraint ?? available;
    width = Math.min(available, cap);
  }
  return {
    x: wide ? origin + (available - width) / 2 : origin,
    width,
  };
}

let probe: HTMLDivElement | null = null;
let cachedKey = "";
let cachedBounds: DesktopContentBounds = SERVER_BOUNDS;

function measureContentInsets(): { left: number; right: number } {
  if (typeof document === "undefined") return { left: 0, right: 0 };
  if (!probe) {
    probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = [
      "position:fixed",
      "left:0",
      "top:0",
      "height:0",
      "visibility:hidden",
      "pointer-events:none",
      "border:0 solid transparent",
      "box-sizing:content-box",
      "padding:0",
      "margin:0",
    ].join(";");
    document.documentElement.appendChild(probe);
  }
  probe.style.width = "var(--desktop-content-left, 0px)";
  probe.style.borderRightWidth = "var(--desktop-content-right, 0px)";
  const rect = probe.getBoundingClientRect();
  const right = Math.round(parseFloat(getComputedStyle(probe).borderRightWidth) || 0);
  const left = Math.round(Math.max(0, rect.width - right));
  return { left, right };
}

/** Used CSS pixel rect. Cached by viewport + inset so snapshots stay stable. */
export function getDesktopContentBounds(): DesktopContentBounds {
  if (typeof window === "undefined") return SERVER_BOUNDS;
  const insets = measureContentInsets();
  const key = `${window.innerWidth}|${window.innerHeight}|${insets.left}|${insets.right}`;
  if (key === cachedKey) return cachedBounds;
  cachedKey = key;
  cachedBounds = desktopContentBounds({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    insets,
  });
  return cachedBounds;
}

export function subscribeDesktopContentBounds(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onChange = () => {
    cachedKey = "";
    callback();
  };
  window.addEventListener("resize", onChange);
  window.visualViewport?.addEventListener("resize", onChange);
  const media = window.matchMedia("(hover: none) and (pointer: coarse)");
  media.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.visualViewport?.removeEventListener("resize", onChange);
    media.removeEventListener("change", onChange);
  };
}
