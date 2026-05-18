/** Default v86 framebuffer size (content only). */
export const DEFAULT_WINDOW_SIZE = { width: 640, height: 480 };

const DEFAULT_TITLEBAR_HEIGHT = 24;

export const DEFAULT_WINDOW_SIZE_WITH_TITLEBAR = {
  width: DEFAULT_WINDOW_SIZE.width,
  height: DEFAULT_WINDOW_SIZE.height + DEFAULT_TITLEBAR_HEIGHT,
};
