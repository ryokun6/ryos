import { app, dialog, ipcMain, type BrowserWindow } from "electron";
import electronUpdater, { type UpdateInfo } from "electron-updater";

const { autoUpdater } = electronUpdater;

/**
 * Auto-update status broadcast to the renderer over
 * `ryos-desktop:update-status`. Mirrors {@link RyosDesktopUpdateStatus} in
 * src/types/ryos-desktop.d.ts — keep the two in sync.
 */
export type UpdateStatus =
  | { state: "checking" }
  | { state: "available"; version: string }
  | { state: "not-available"; version: string }
  | { state: "downloading"; percent: number; version: string }
  | { state: "downloaded"; version: string }
  | { state: "error"; message: string };

// Check on launch, then on a fixed interval while the app stays open.
const INITIAL_CHECK_DELAY_MS = 10_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let getWindow: () => BrowserWindow | null = () => null;
let pendingVersion: string | null = null;
let updateDownloaded = false;
let restartPromptShownFor: string | null = null;

function broadcast(status: UpdateStatus): void {
  getWindow()?.webContents.send("ryos-desktop:update-status", status);
}

function showRestartPrompt(version: string): void {
  const win = getWindow();
  if (!win || restartPromptShownFor === version) {
    return;
  }
  restartPromptShownFor = version;
  void dialog
    .showMessageBox(win, {
      type: "info",
      buttons: ["Restart Now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update Ready",
      message: `ryOS ${version} is ready to install.`,
      detail: "Restart ryOS to apply the latest update.",
    })
    .then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
}

function check(): void {
  autoUpdater.checkForUpdates().catch((err) => {
    // Surface via the "error" event handler below; swallow the rejection.
    broadcast({
      state: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  });
}

/**
 * Wire up electron-updater against the GitHub Releases feed configured in
 * electron-builder.yml. No-ops in development / unpackaged builds where there is
 * no signed bundle or `app-update.yml` to update from.
 */
export function setupAutoUpdater(
  getMainWindow: () => BrowserWindow | null
): void {
  getWindow = getMainWindow;

  if (!app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    broadcast({ state: "checking" });
  });
  autoUpdater.on("update-available", (info: UpdateInfo) => {
    pendingVersion = info.version;
    broadcast({ state: "available", version: info.version });
  });
  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    broadcast({ state: "not-available", version: info.version });
  });
  autoUpdater.on("download-progress", (progress) => {
    broadcast({
      state: "downloading",
      percent: Math.round(progress.percent),
      version: pendingVersion ?? "",
    });
  });
  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    updateDownloaded = true;
    broadcast({ state: "downloaded", version: info.version });
    showRestartPrompt(info.version);
  });
  autoUpdater.on("error", (err) => {
    broadcast({
      state: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  });

  // Renderer-initiated actions (menu item, About box, etc.).
  ipcMain.handle("ryos-desktop:check-for-updates", async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return result?.updateInfo?.version ?? null;
    } catch (err) {
      broadcast({
        state: "error",
        message: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  });

  ipcMain.handle("ryos-desktop:quit-and-install", () => {
    if (updateDownloaded) {
      autoUpdater.quitAndInstall();
    }
  });

  setTimeout(check, INITIAL_CHECK_DELAY_MS);
  setInterval(check, CHECK_INTERVAL_MS);
}
