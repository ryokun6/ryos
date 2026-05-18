/** Default emulator framebuffer size (content only). */
export const DEFAULT_WINDOW_SIZE = { width: 640, height: 480 };

/** Fallback titlebar height for registry default window (matches TITLEBAR_HEIGHT_BY_THEME macosx/system7). */
const DEFAULT_TITLEBAR_HEIGHT = 24;

/** Initial window size including title bar (for app registry). */
export const DEFAULT_WINDOW_SIZE_WITH_TITLEBAR = {
  width: DEFAULT_WINDOW_SIZE.width,
  height: DEFAULT_WINDOW_SIZE.height + DEFAULT_TITLEBAR_HEIGHT,
};
