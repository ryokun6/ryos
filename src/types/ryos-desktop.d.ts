/**
 * Desktop shell API exposed by Electron preload (window.ryosDesktop).
 */
export interface RyosDesktopApi {
  platform: NodeJS.Platform;
  isFullscreen: () => Promise<boolean>;
  onFullscreenChange: (callback: (fullscreen: boolean) => void) => () => void;
  toggleMaximize: () => Promise<void>;
}

declare global {
  interface Window {
    ryosDesktop?: RyosDesktopApi;
  }
}

export {};
