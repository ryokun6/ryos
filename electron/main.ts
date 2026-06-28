import {
  app,
  BrowserWindow,
  components,
  dialog,
  ipcMain,
  Notification,
  session,
  shell,
  type WebContents,
} from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { setupAutoUpdater } from "./updater";
import { buildApplicationMenu } from "./menu";
import { registerChatNotificationIpcHandlers } from "./chat-notifications";
import {
  sanitizeSystemNotificationPayload,
  type SystemNotificationPayload,
  type SystemNotificationStatus,
} from "../src/utils/systemNotifications";

const DEFAULT_APP_URL = "https://os.ryo.lu";
const APP_URL = process.env.RYOS_ELECTRON_URL?.trim() || DEFAULT_APP_URL;
const APP_DISPLAY_NAME = "ryOS";
const APP_ID = "lu.ryo.os";
const APP_COPYRIGHT = "Copyright (c) 2026 Ryo Lu";
const MAX_NATIVE_OPEN_BYTES = 100 * 1024 * 1024;

let mainWindow: BrowserWindow | null = null;
type ActiveNativeNotification = InstanceType<typeof Notification>;
const activeNativeNotifications = new Set<ActiveNativeNotification>();

app.setName(APP_DISPLAY_NAME);
if (process.platform === "win32") {
  app.setAppUserModelId(APP_ID);
}

type NativeFileFilter = {
  name: string;
  extensions: string[];
};

type NativeOpenFileOptions = {
  title?: string;
  filters?: NativeFileFilter[];
  multiSelections?: boolean;
};

type NativeSaveFileOptions = {
  title?: string;
  defaultPath?: string;
  filters?: NativeFileFilter[];
  data: ArrayBuffer | ArrayBufferView;
};

const ALLOWED_WEB_PERMISSIONS = new Set([
  "clipboard-read",
  "clipboard-sanitized-write",
  "fullscreen",
  "geolocation",
  "keyboardLock",
  "media",
  "pointerLock",
]);

function getAppOrigin(): string {
  try {
    return new URL(APP_URL).origin;
  } catch {
    return new URL(DEFAULT_APP_URL).origin;
  }
}

function isInAppNavigation(url: string): boolean {
  try {
    const parsed = new URL(url);
    const appOrigin = getAppOrigin();
    if (parsed.origin === appOrigin) {
      return true;
    }
    return (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

function isTrustedWebContents(contents: WebContents | null | undefined): boolean {
  if (!contents || contents.isDestroyed()) {
    return false;
  }
  return isInAppNavigation(contents.getURL()) || isBlankUrl(contents.getURL());
}

function sanitizeNotificationOptions(
  options: SystemNotificationPayload
): Electron.NotificationConstructorOptions | null {
  return {
    title: options.title,
    body: options.body,
    tag: options.tag,
    silent: options.silent,
    urgency: options.urgency,
    timeoutType: options.timeoutType,
  };
}

function getNotificationChatRoomId(
  options: SystemNotificationPayload
): string | null | undefined {
  if (!("chatRoomId" in options)) {
    return undefined;
  }
  return typeof options.chatRoomId === "string" || options.chatRoomId === null
    ? options.chatRoomId
    : undefined;
}

function canShowNativeNotifications(): boolean {
  return (
    typeof Notification.isSupported === "function" &&
    Notification.isSupported()
  );
}

function getNativeNotificationStatus(
  trusted: boolean
): SystemNotificationStatus {
  if (!trusted) {
    return {
      supported: false,
      foreground: isMainWindowForeground(),
      platform: process.platform,
      reason: "untrusted",
    };
  }

  const supported = canShowNativeNotifications();
  return {
    supported,
    foreground: isMainWindowForeground(),
    platform: process.platform,
    reason: supported ? undefined : "unsupported",
  };
}

function isMainWindowForeground(): boolean {
  const win = mainWindow;
  if (!win || win.isDestroyed() || win.isMinimized() || !win.isVisible()) {
    return false;
  }

  return win.isFocused();
}

function focusMainWindow(): void {
  const win = mainWindow;
  if (!win || win.isDestroyed()) {
    return;
  }

  if (win.isMinimized()) {
    win.restore();
  }
  if (!win.isVisible()) {
    win.show();
  }

  app.focus();
  win.focus();
}

function showRetainedNativeNotification(
  options: Electron.NotificationConstructorOptions,
  onClick: () => void = focusMainWindow
): boolean {
  const notification = new Notification(options);
  activeNativeNotifications.add(notification);

  const releaseNotification = () => {
    activeNativeNotifications.delete(notification);
  };

  notification.once("click", () => {
    onClick();
    releaseNotification();
  });
  notification.once("close", releaseNotification);
  notification.once("failed", releaseNotification);

  try {
    notification.show();
    return true;
  } catch (error) {
    releaseNotification();
    throw error;
  }
}

function sanitizeDialogFilters(filters: unknown): NativeFileFilter[] | undefined {
  if (!Array.isArray(filters)) {
    return undefined;
  }

  const sanitized = filters
    .map((filter) => {
      if (!filter || typeof filter !== "object") {
        return null;
      }

      const { name, extensions } = filter as Partial<NativeFileFilter>;
      if (typeof name !== "string" || !Array.isArray(extensions)) {
        return null;
      }

      const safeExtensions = extensions
        .filter((extension): extension is string => typeof extension === "string")
        .map((extension) => extension.replace(/^\./, "").trim())
        .filter((extension) => /^[a-z0-9*]+$/i.test(extension));

      if (!name.trim() || safeExtensions.length === 0) {
        return null;
      }

      return {
        name: name.trim(),
        extensions: safeExtensions,
      };
    })
    .filter((filter): filter is NativeFileFilter => filter !== null);

  return sanitized.length > 0 ? sanitized : undefined;
}

function sanitizeDefaultPath(defaultPath: unknown): string | undefined {
  if (typeof defaultPath !== "string") {
    return undefined;
  }

  const filename = path.basename(defaultPath.trim());
  return filename || undefined;
}

function bufferFromIpcData(data: unknown): Buffer {
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  throw new Error("Invalid file payload");
}

/**
 * Apple sign-in domains used by MusicKit JS `authorize()` (Apple Music) and
 * Apple ID. These must open as real in-app popup windows — sending them to the
 * system browser via shell.openExternal severs the popup↔opener handshake and
 * leaves `authorize()` hanging. Covers nested redirects (auth → idmsa →
 * appleid) and 2FA child popups.
 */
function isAppleAuthUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "apple.com" || hostname.endsWith(".apple.com");
  } catch {
    return false;
  }
}

/**
 * Blank popups (`window.open("")` / about:blank) are opened by some auth flows
 * before they set the real location. Allow them in-app — any subsequent
 * navigation is still governed by this same policy via did-create-window.
 */
function isBlankUrl(url: string): boolean {
  return url === "" || url === "about:blank" || url.startsWith("about:blank#");
}

/**
 * Centralized navigation policy applied to the main window and any child
 * windows it spawns (e.g. the Apple Music auth popup, which may itself open
 * further Apple ID / 2FA popups). In-app and Apple-auth URLs open in-app;
 * everything else is handed off to the system browser.
 */
function applyNavigationPolicy(contents: WebContents): void {
  contents.setWindowOpenHandler(({ url }) => {
    if (isInAppNavigation(url) || isAppleAuthUrl(url) || isBlankUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      };
    }
    void shell.openExternal(url);
    return { action: "deny" };
  });

  contents.on("will-navigate", (event, url) => {
    if (!isInAppNavigation(url) && !isAppleAuthUrl(url) && !isBlankUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  // Apply the same policy to auth popups (and their nested popups) so the
  // entire Apple sign-in chain stays in-app and external links still escape.
  contents.on("did-create-window", (childWindow) => {
    applyNavigationPolicy(childWindow.webContents);
  });
}

function sendFullscreenState(win: BrowserWindow): void {
  win.webContents.send("ryos-desktop:fullscreen-changed", win.isFullScreen());
}

function createMainWindow(): BrowserWindow {
  const isMac = process.platform === "darwin";

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "",
    show: false,
    ...(isMac
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 12, y: 10 },
        }
      : { frame: false }),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  void win.loadURL(APP_URL);

  applyNavigationPolicy(win.webContents);

  win.on("enter-full-screen", () => sendFullscreenState(win));
  win.on("leave-full-screen", () => sendFullscreenState(win));
  win.on("resize", () => sendFullscreenState(win));
  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  mainWindow = win;
  return win;
}

function registerIpcHandlers(): void {
  ipcMain.handle("ryos-desktop:get-app-version", () => {
    return app.getVersion();
  });

  ipcMain.handle("ryos-desktop:can-show-notifications", (event) => {
    return isTrustedWebContents(event.sender) && canShowNativeNotifications();
  });

  ipcMain.handle("ryos-desktop:get-notification-status", (event) => {
    return getNativeNotificationStatus(isTrustedWebContents(event.sender));
  });

  ipcMain.handle("ryos-desktop:should-show-native-notification", (event) => {
    return (
      isTrustedWebContents(event.sender) &&
      canShowNativeNotifications() &&
      !isMainWindowForeground()
    );
  });

  ipcMain.handle(
    "ryos-desktop:show-notification",
    (event, options: unknown = {}) => {
      if (!isTrustedWebContents(event.sender)) {
        return { shown: false, reason: "untrusted" };
      }
      if (
        typeof Notification.isSupported !== "function" ||
        !Notification.isSupported()
      ) {
        return { shown: false, reason: "unsupported" };
      }

      const payload = sanitizeSystemNotificationPayload(options);
      if (!payload) {
        return { shown: false, reason: "invalid-payload" };
      }
      const notificationOptions = sanitizeNotificationOptions(payload);
      if (!notificationOptions) {
        return { shown: false, reason: "invalid-payload" };
      }
      if (isMainWindowForeground()) {
        return { shown: false, reason: "foreground" };
      }

      const chatRoomId = getNotificationChatRoomId(payload);
      showRetainedNativeNotification(
        notificationOptions,
        chatRoomId !== undefined
          ? () => {
              focusMainWindow();
              if (!event.sender.isDestroyed()) {
                event.sender.send(
                  "ryos-desktop:open-chat-room-from-notification",
                  chatRoomId
                );
              }
            }
          : undefined
      );

      return { shown: true };
    }
  );

  ipcMain.handle("ryos-desktop:is-fullscreen", () => {
    return mainWindow?.isFullScreen() ?? false;
  });

  ipcMain.handle("ryos-desktop:toggle-maximize", () => {
    const win = mainWindow;
    if (!win) {
      return;
    }
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });

  ipcMain.handle(
    "ryos-desktop:open-file",
    async (event, options: NativeOpenFileOptions = {}) => {
      if (!isTrustedWebContents(event.sender)) {
        return { canceled: true };
      }

      const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
      const openOptions = {
        title: typeof options.title === "string" ? options.title : undefined,
        filters: sanitizeDialogFilters(options.filters),
        properties: options.multiSelections
          ? ["openFile", "multiSelections"]
          : ["openFile"],
      } satisfies Electron.OpenDialogOptions;
      const result = win
        ? await dialog.showOpenDialog(win, openOptions)
        : await dialog.showOpenDialog(openOptions);

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
      }

      const files = await Promise.all(
        result.filePaths.map(async (filePath) => {
          const stat = await fs.stat(filePath);
          if (!stat.isFile()) {
            throw new Error("Selected path is not a file");
          }
          if (stat.size > MAX_NATIVE_OPEN_BYTES) {
            throw new Error("Selected file is too large");
          }
          const data = await fs.readFile(filePath);
          return {
            name: path.basename(filePath),
            size: stat.size,
            lastModified: stat.mtimeMs,
            data: data.buffer.slice(
              data.byteOffset,
              data.byteOffset + data.byteLength
            ),
          };
        })
      );

      return { canceled: false, files };
    }
  );

  ipcMain.handle(
    "ryos-desktop:save-file",
    async (event, options: NativeSaveFileOptions) => {
      if (!isTrustedWebContents(event.sender)) {
        return { canceled: true };
      }

      const data = bufferFromIpcData(options?.data);
      const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
      const saveOptions = {
        title: typeof options.title === "string" ? options.title : undefined,
        defaultPath: sanitizeDefaultPath(options?.defaultPath),
        filters: sanitizeDialogFilters(options?.filters),
      } satisfies Electron.SaveDialogOptions;
      const result = win
        ? await dialog.showSaveDialog(win, saveOptions)
        : await dialog.showSaveDialog(saveOptions);

      if (result.canceled || !result.filePath) {
        return { canceled: true };
      }

      await fs.writeFile(result.filePath, data);
      return { canceled: false, filePath: result.filePath };
    }
  );

  registerChatNotificationIpcHandlers({
    ipcMain,
    session: session.defaultSession,
    getMainWindow: () => mainWindow,
    isTrustedWebContents,
    isAllowedAppUrl: isInAppNavigation,
    isMainWindowForeground,
    focusMainWindow,
    showNotification: (options, onClick) => {
      if (!canShowNativeNotifications()) {
        return false;
      }
      return showRetainedNativeNotification(options, onClick);
    },
  });
}

function configureAppMetadata(): void {
  app.setName(APP_DISPLAY_NAME);
  app.setAboutPanelOptions({
    applicationName: APP_DISPLAY_NAME,
    applicationVersion: app.getVersion(),
    copyright: APP_COPYRIGHT,
    credits: "Ryo Lu",
    authors: ["Ryo Lu"],
    website: DEFAULT_APP_URL,
  });
}

async function ensureWidevineCdmReady(): Promise<void> {
  try {
    await components.whenReady();
    console.log("[electron] Widevine CDM ready:", components.status());
  } catch (err) {
    console.error(
      "[electron] Widevine CDM installation failed — Apple Music DRM playback may not work:",
      err
    );
  }
}

app.whenReady().then(async () => {
  configureAppMetadata();

  await ensureWidevineCdmReady();

  registerIpcHandlers();

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      callback(
        isTrustedWebContents(webContents) &&
          ALLOWED_WEB_PERMISSIONS.has(permission)
      );
    }
  );

  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission) =>
      isTrustedWebContents(webContents) &&
      ALLOWED_WEB_PERMISSIONS.has(permission)
  );

  createMainWindow();

  setupAutoUpdater(() => mainWindow);
  buildApplicationMenu();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
