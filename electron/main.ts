import {
  app,
  BrowserWindow,
  ipcMain,
  session,
  shell,
  type WebContents,
} from "electron";
import path from "node:path";
import { setupAutoUpdater } from "./updater";
import { buildApplicationMenu } from "./menu";

const DEFAULT_APP_URL = "https://os.ryo.lu";
const APP_URL = process.env.RYOS_ELECTRON_URL?.trim() || DEFAULT_APP_URL;

let mainWindow: BrowserWindow | null = null;

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
}

app.whenReady().then(() => {
  registerIpcHandlers();

  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(permission === "media");
    }
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
