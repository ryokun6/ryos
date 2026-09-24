/**
 * iOS / mobile WebKit Motion 13 WAAPI workarounds.
 *
 * Motion 13 (bumped from 12.x on this branch) drives layout (`popLayout`,
 * `layout="position"`) and visual properties (`filter`, `textShadow`) through
 * the Web Animations API. iOS WebKit can throw on those features — in lyrics,
 * dock icon presence, window chrome, and wallpaper layers.
 *
 * Callers pass a boolean so tests can exercise both branches without stubbing
 * navigator. Prefer `isIosWebKit()` (all iPhone/iPad browsers) over the
 * narrower `isMobileSafari()`.
 */

export type AnimatePresenceMode = "sync" | "wait" | "popLayout";
export type LayoutProp = boolean | "position" | "size";

const UNSAFE_MOTION_VISUAL_KEYS = ["filter", "textShadow"] as const;

export function isUnsafeMotionVisualKey(key: string): boolean {
  return (
    key === "filter" ||
    key === "textShadow"
  );
}

/**
 * popLayout uses FLIP + WAAPI and is the most common iOS Safari throw site.
 * Fall back to sync presence so enter/exit still run without layout projection.
 */
export function getSafeAnimatePresenceMode(
  preferred: AnimatePresenceMode,
  isIosSafari: boolean,
): AnimatePresenceMode {
  if (isIosSafari && preferred === "popLayout") {
    return "sync";
  }
  return preferred;
}

/**
 * layout="position" / layout={true} also go through WAAPI projection.
 * Disable layout animations on iOS Safari; opacity/transform still animate.
 */
export function getSafeLayoutProp(
  preferred: LayoutProp,
  isIosSafari: boolean,
): LayoutProp | undefined {
  if (isIosSafari) {
    return undefined;
  }
  return preferred;
}

/**
 * Strip filter / textShadow from a Motion variant or transition so WAAPI
 * never tries to interpolate those properties on iOS Safari.
 */
export function sanitizeMotionVisuals<T extends Record<string, unknown>>(
  value: T,
  isIosSafari: boolean,
): T {
  if (!isIosSafari) {
    return value;
  }

  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (UNSAFE_MOTION_VISUAL_KEYS.includes(key as (typeof UNSAFE_MOTION_VISUAL_KEYS)[number])) {
      changed = true;
      continue;
    }
    next[key] = entry;
  }
  return (changed ? next : value) as T;
}

export function sanitizeMotionVariantMap<
  T extends Record<string, Record<string, unknown>>,
>(variants: T, isIosSafari: boolean): T {
  if (!isIosSafari) {
    return variants;
  }

  const next = {} as T;
  for (const key of Object.keys(variants) as Array<keyof T>) {
    next[key] = sanitizeMotionVisuals(variants[key], true);
  }
  return next;
}

/**
 * Motion 13 can still throw on iOS even after stripping filter/textShadow
 * (opacity/scale/y still go through WAAPI). Lyrics should render as static
 * DOM on iOS WebKit.
 */
export function shouldUseStaticLyricsRenderer(isIosWebKitDevice: boolean): boolean {
  return isIosWebKitDevice;
}
