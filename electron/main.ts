import { app, BrowserWindow, ipcMain, session, shell } from "electron";
import path from "node:path";

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

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isInAppNavigation(url)) {
      void shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (!isInAppNavigation(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

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
