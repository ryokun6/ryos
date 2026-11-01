import {
  clampWindowToContentBounds,
  type DesktopContentBounds,
  hasHorizontalContentInset,
  resolveMobileWindowFrame,
} from "@/utils/desktopContentBounds";

/** Phone layout starts below this width. Matches the window manager. */
export const MOBILE_VIEWPORT_BREAKPOINT = 768;

export type WindowRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ConstrainWindowInput = WindowRect & {
  viewportWidth: number;
  viewportHeight: number;
  bounds: DesktopContentBounds;
  /** Menubar plus the top safe area. The window top stays at or below this. */
  topInset: number;
  /** Dock, taskbar, and bottom safe area, measured up from the viewport bottom. */
  bottomInset: number;
  minHeight?: number;
  maxHeight?: number;
  /** Desktop-only cap. Ignored on mobile, where the frame is full width. */
  maxWidth?: number;
  defaultSize?: { width: number; height: number };
  mobileDefaultSize?: { width: number; height: number };
  mobileSquare?: boolean;
};

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clampVertical(input: {
  y: number;
  height: number;
  top: number;
  bottomLimit: number;
  minHeight?: number;
  maxHeight?: number;
}): { y: number; height: number } {
  const available = Math.max(0, input.bottomLimit - input.top);
  let height = finite(input.height, 0);
  if (input.maxHeight != null && Number.isFinite(input.maxHeight)) {
    height = Math.min(height, input.maxHeight);
  }
  if (height > available) height = available;
  if (
    input.minHeight != null &&
    Number.isFinite(input.minHeight) &&
    input.minHeight <= available &&
    height < input.minHeight
  ) {
    height = input.minHeight;
  }
  if (height < 0) height = 0;

  let y = finite(input.y, input.top);
  if (y < input.top) y = input.top;
  if (y + height > input.bottomLimit) {
    y = Math.max(input.top, input.bottomLimit - height);
  }
  return { y, height };
}

/**
 * Fit a saved window rect to the viewport it is being restored into.
 *
 * Mobile uses the same frame helpers as a newly opened window (full content
 * width, or the app's mobile size) and keeps the rect below the menubar and
 * above the dock. Desktop reuses the horizontal content clamp and only pulls
 * a window that is fully outside the content rect, or taller than the safe area.
 */
export function constrainWindowToViewport(
  input: ConstrainWindowInput,
): WindowRect {
  const viewportWidth = Math.max(0, input.viewportWidth);
  const viewportHeight = Math.max(0, input.viewportHeight);
  const top = Math.max(0, finite(input.topInset, 0));
  const bottomLimit = Math.max(
    top,
    viewportHeight - Math.max(0, finite(input.bottomInset, 0)),
  );
  const mobile = viewportWidth < MOBILE_VIEWPORT_BREAKPOINT;
  const { bounds } = input;

  let x = finite(input.x, 0);
  let width = Math.max(0, finite(input.width, 0));
  let height = Math.max(0, finite(input.height, 0));

  if (mobile) {
    const frame = resolveMobileWindowFrame({
      viewportWidth,
      bounds,
      defaultSize: input.defaultSize ?? { width, height },
      mobileDefaultSize: input.mobileDefaultSize,
      mobileSquare: input.mobileSquare,
      persistedHeight: height,
    });
    x = frame.x;
    width = frame.width;
    height = frame.height;
    // A mobile default wider than the content rect still has to stay on screen.
    const contentRight = x + Math.max(0, bounds.width || viewportWidth);
    if (width > bounds.width && bounds.width > 0) {
      width = bounds.width;
    }
    if (x + width > contentRight && width > 0) {
      x = Math.max(bounds.x, contentRight - width);
    }
  } else {
    if (
      input.maxWidth != null &&
      Number.isFinite(input.maxWidth) &&
      viewportWidth >= MOBILE_VIEWPORT_BREAKPOINT
    ) {
      width = Math.min(width, input.maxWidth);
    }
    const fitted = clampWindowToContentBounds({
      x,
      width,
      viewportWidth,
      bounds,
      mobile: false,
    });
    x = fitted.x;
    width = fitted.width;

    const inset = hasHorizontalContentInset(bounds, viewportWidth);
    const left = inset ? bounds.x : 0;
    const right = inset ? bounds.right : viewportWidth;
    const availableWidth = Math.max(0, right - left);
    if (width > availableWidth) {
      width = availableWidth;
      x = left;
    } else if (x + width <= left || x >= right) {
      x = left;
    } else if (inset && x < left) {
      x = left;
      if (x + width > right) width = Math.max(0, right - x);
    } else if (x + width > right) {
      x = Math.max(left, right - width);
    }
  }

  const vertical = clampVertical({
    y: input.y,
    height,
    top,
    bottomLimit,
    minHeight: input.minHeight,
    maxHeight: input.maxHeight,
  });

  return { x, y: vertical.y, width, height: vertical.height };
}

export function windowRectChanged(
  before: WindowRect,
  after: WindowRect,
): boolean {
  return (
    before.x !== after.x ||
    before.y !== after.y ||
    before.width !== after.width ||
    before.height !== after.height
  );
}
