import type { ChatMessage, ChatRoom } from "@/shared/contracts/chat";
import type {
  SystemNotificationPayload,
  SystemNotificationStatus,
} from "@/utils/systemNotifications";
import type {
  DesktopChatNotificationConfig,
  DesktopChatNotificationManageResult,
  DesktopChatNotificationState,
} from "@/utils/desktopChatNotificationPolicy";

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

export interface RyosDesktopFileFilter {
  name: string;
  extensions: string[];
}

export interface RyosDesktopOpenFileOptions {
  title?: string;
  filters?: RyosDesktopFileFilter[];
  multiSelections?: boolean;
}

export interface RyosDesktopOpenedFile {
  name: string;
  size: number;
  lastModified: number;
  data: ArrayBuffer;
}

export type RyosDesktopOpenFileResult =
  | { canceled: true }
  | { canceled: false; files: RyosDesktopOpenedFile[] };

export interface RyosDesktopSaveFileOptions {
  title?: string;
  defaultPath?: string;
  filters?: RyosDesktopFileFilter[];
  data: ArrayBuffer;
}

export type RyosDesktopSaveFileResult =
  | { canceled: true }
  | { canceled: false; filePath: string };

export type RyosDesktopNotificationOptions = SystemNotificationPayload;

export type RyosDesktopNotificationResult =
  | { shown: true }
  | {
      shown: false;
      reason: "untrusted" | "unsupported" | "invalid-payload" | "foreground";
    };

export type RyosDesktopChatNotificationManageResult =
  DesktopChatNotificationManageResult;

export type RyosDesktopChatNotificationStatus =
  DesktopChatNotificationManageResult;

export type RyosDesktopChatNotificationEvent =
  | { type: "room-created"; room: ChatRoom }
  | { type: "room-deleted"; roomId: string }
  | { type: "room-updated"; room: ChatRoom }
  | { type: "rooms-updated"; rooms: ChatRoom[] }
  | {
      type: "room-message";
      message: ChatMessage;
      incrementUnread: boolean;
      showInMain: boolean;
      showInRenderer: boolean;
    }
  | { type: "message-deleted"; roomId: string; messageId: string };

/**
 * Desktop shell API exposed by Electron preload (window.ryosDesktop).
 */
export interface RyosDesktopApi {
  platform: NodeJS.Platform;
  isFullscreen: () => Promise<boolean>;
  onFullscreenChange: (callback: (fullscreen: boolean) => void) => () => void;
  toggleMaximize: () => Promise<void>;
  /** Open one or more native files and return their contents to the sandboxed renderer. */
  openFile: (
    options?: RyosDesktopOpenFileOptions
  ) => Promise<RyosDesktopOpenFileResult>;
  /** Save bytes through a native save dialog without exposing Node APIs. */
  saveFile: (
    options: RyosDesktopSaveFileOptions
  ) => Promise<RyosDesktopSaveFileResult>;
  /** Native shell version (app.getVersion()). */
  getVersion: () => Promise<string>;
  /** Whether this trusted desktop renderer can ask the OS to show notifications. */
  canShowNotifications: () => Promise<boolean>;
  /** Current native notification capability and foreground state. */
  getNotificationStatus: () => Promise<SystemNotificationStatus>;
  /** Whether the desktop shell should mirror the next toast to a native OS notification. */
  shouldShowNativeNotification: () => Promise<boolean>;
  /** Show a text-only native OS notification from the sandboxed renderer. */
  showNotification: (
    options: RyosDesktopNotificationOptions
  ) => Promise<RyosDesktopNotificationResult>;
  /**
   * Start/refresh the Electron main-process chat notification service with
   * public realtime config and minimal chat state.
   */
  configureChatNotifications: (
    config: DesktopChatNotificationConfig,
    state: DesktopChatNotificationState
  ) => Promise<RyosDesktopChatNotificationManageResult>;
  /** Update minimal renderer state used by the main chat notification service. */
  updateChatNotificationState: (
    state: DesktopChatNotificationState
  ) => Promise<RyosDesktopChatNotificationManageResult>;
  /** Stop main-process chat notifications, usually on logout or unsupported config. */
  stopChatNotifications: () => Promise<void>;
  /** Subscribe to sanitized chat realtime events forwarded from Electron main. */
  onChatNotificationEvent: (
    callback: (event: RyosDesktopChatNotificationEvent) => void
  ) => () => void;
  /** Subscribe to service health/status changes from Electron main. */
  onChatNotificationStatus: (
    callback: (status: RyosDesktopChatNotificationStatus) => void
  ) => () => void;
  /** Subscribe to native notification click routing from Electron main. */
  onOpenChatRoomFromNotification: (
    callback: (roomId: string | null) => void
  ) => () => void;
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
