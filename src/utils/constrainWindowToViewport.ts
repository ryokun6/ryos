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

/**
 * Keep the saved vertical position. Move it only when the window top sits
 * above the menubar, or the whole window is below the dock / visible area.
 * A window that still shows its top and hangs over the dock stays put.
 */
function clampKeptY(input: {
  y: number;
  height: number;
  top: number;
  bottomLimit: number;
}): number {
  let y = finite(input.y, input.top);
  if (y < input.top) y = input.top;
  if (y >= input.bottomLimit) {
    y = Math.max(input.top, input.bottomLimit - Math.max(0, input.height));
  }
  return y;
}

/**
 * Fit a saved window rect to the viewport it is being restored or resized into.
 *
 * Mobile takes x and width from the mobile frame helpers and keeps y, unless
 * the top is above the menubar or the window is fully below the dock.
 * Desktop reuses the horizontal content clamp and only pulls a window that
 * is fully outside the content rect.
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
  const height = Math.max(0, finite(input.height, 0));

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
    // Keep the saved height. Mobile frame helpers still choose x and width
    // (full content width, or the app's mobile size).
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

  const y = clampKeptY({
    y: input.y,
    height,
    top,
    bottomLimit,
  });

  return { x, y, width, height };
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

export type StoredWindowRect = {
  position: { x: number; y: number };
  size: { width: number; height: number };
};

export function toWindowRect(stored: StoredWindowRect): WindowRect {
  return {
    x: stored.position.x,
    y: stored.position.y,
    width: stored.size.width,
    height: stored.size.height,
  };
}

export function toStoredRect(rect: WindowRect): StoredWindowRect {
  return {
    position: { x: rect.x, y: rect.y },
    size: { width: rect.width, height: rect.height },
  };
}

/**
 * A phone frame is pinned to the content origin and narrower than the
 * desktop breakpoint. Staggered or wide rects are desktop layouts.
 */
export function persistedRectIsDesktopLayout(rect: WindowRect): boolean {
  return rect.width >= MOBILE_VIEWPORT_BREAKPOINT || rect.x > 0;
}

export function resolveDesktopRect(input: {
  current: WindowRect;
  desktop?: WindowRect | null;
  defaultDesktop: WindowRect;
}): WindowRect {
  if (
    input.desktop &&
    Number.isFinite(input.desktop.x) &&
    Number.isFinite(input.desktop.y) &&
    Number.isFinite(input.desktop.width) &&
    Number.isFinite(input.desktop.height)
  ) {
    return input.desktop;
  }
  if (persistedRectIsDesktopLayout(input.current)) return input.current;
  return input.defaultDesktop;
}

/**
 * Current rect follows the viewport. The desktop rect is chosen once and
 * then left alone, including while the phone frame is applied.
 */
export function layoutForViewport(
  input: ConstrainWindowInput & {
    desktop?: WindowRect | null;
    defaultDesktop: WindowRect;
  },
): { current: WindowRect; desktop: WindowRect } {
  const current = {
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
  };
  const desktop = resolveDesktopRect({
    current,
    desktop: input.desktop,
    defaultDesktop: input.defaultDesktop,
  });
  const mobile = input.viewportWidth < MOBILE_VIEWPORT_BREAKPOINT;
  const source = mobile ? current : desktop;
  return {
    desktop,
    current: constrainWindowToViewport({
      ...input,
      ...source,
    }),
  };
}

/** Desktop drags replace the desktop rect. Phone drags only move the current rect. */
export function applyUserWindowMove(input: {
  mobile: boolean;
  desktop: WindowRect;
  next: WindowRect;
}): { current: WindowRect; desktop: WindowRect } {
  if (input.mobile) {
    return { current: input.next, desktop: input.desktop };
  }
  return { current: input.next, desktop: input.next };
}
