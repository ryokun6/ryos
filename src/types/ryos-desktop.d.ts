/**
 * Auto-update lifecycle status pushed from the Electron main process.
 * Mirrors `UpdateStatus` in electron/updater.ts — keep the two in sync.
 */
export type RyosDesktopUpdateStatus =
  | { state: "checking" }
  | { state: "available"; version: string }
  | { state: "not-available"; version: string }
  | { state: "downloading"; percent: number; version: string }
  | { state: "downloaded"; version: string }
  | { state: "error"; message: string };

/**
 * Desktop shell API exposed by Electron preload (window.ryosDesktop).
 */
export interface RyosDesktopApi {
  platform: NodeJS.Platform;
  isFullscreen: () => Promise<boolean>;
  onFullscreenChange: (callback: (fullscreen: boolean) => void) => () => void;
  toggleMaximize: () => Promise<void>;
  /** Native shell version (app.getVersion()). */
  getVersion: () => Promise<string>;
  /** Manually trigger an update check; resolves with the available version, if any. */
  checkForUpdates: () => Promise<string | null>;
  /** Quit and install a downloaded update (no-op if none is ready). */
  quitAndInstall: () => Promise<void>;
  /** Subscribe to update lifecycle events. Returns an unsubscribe fn. */
  onUpdateStatus: (
    callback: (status: RyosDesktopUpdateStatus) => void
  ) => () => void;
}

declare global {
  interface Window {
    ryosDesktop?: RyosDesktopApi;
  }
}

export {};
