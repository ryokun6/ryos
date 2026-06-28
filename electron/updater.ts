import {
  app,
  dialog,
  ipcMain,
  type BrowserWindow,
  type IpcMainInvokeEvent,
} from "electron";
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
// When a check is user-initiated (menu / About box), surface the result in a
// dialog. Background checks stay silent unless an update is actually ready.
let interactiveCheck = false;

function broadcast(status: UpdateStatus): void {
  getWindow()?.webContents.send("ryos-desktop:update-status", status);
}

function showMessage(
  options: Electron.MessageBoxOptions
): Promise<Electron.MessageBoxReturnValue> {
  const win = getWindow();
  return win
    ? dialog.showMessageBox(win, options)
    : dialog.showMessageBox(options);
}

function showRestartPrompt(version: string): void {
  if (restartPromptShownFor === version) {
    return;
  }
  restartPromptShownFor = version;
  void showMessage({
    type: "info",
    buttons: ["Restart Now", "Later"],
    defaultId: 0,
    cancelId: 1,
    title: "Update Ready",
    message: `ryOS ${version} is ready to install.`,
    detail: "Restart ryOS to apply the latest update.",
  }).then(({ response }) => {
    if (response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
}

/**
 * Check the GitHub Releases feed for a newer shell version.
 *
 * @param interactive When true (user clicked "Check for Updates…"), the result
 *   — up to date, downloading, or error — is shown in a native dialog. Silent
 *   background checks pass `false`.
 */
export async function checkForUpdates(interactive = false): Promise<void> {
  if (!app.isPackaged) {
    if (interactive) {
      void showMessage({
        type: "info",
        buttons: ["OK"],
        title: "Software Update",
        message: "Updates are only available in the installed app.",
        detail: `Current version: ${app.getVersion()}`,
      });
    }
    return;
  }

  // An update is already staged — just re-offer the restart.
  if (updateDownloaded) {
    if (interactive) {
      showRestartPrompt(pendingVersion ?? app.getVersion());
    }
    return;
  }

  interactiveCheck = interactive;
  try {
    await autoUpdater.checkForUpdates();
  } catch {
    // Surfaced via the "error" event handler.
  }
}

/**
 * Wire up electron-updater against the GitHub Releases feed configured in
 * electron-builder.yml. No-ops in development / unpackaged builds where there is
 * no signed bundle or `app-update.yml` to update from.
 */
export function setupAutoUpdater(
  getMainWindow: () => BrowserWindow | null,
  isTrustedIpcSender: (event: IpcMainInvokeEvent) => boolean
): void {
  getWindow = getMainWindow;

  // Renderer-initiated check (in-app menu / About box). Always interactive.
  ipcMain.handle("ryos-desktop:check-for-updates", async (event) => {
    if (!isTrustedIpcSender(event)) {
      return null;
    }
    await checkForUpdates(true);
    return pendingVersion;
  });

  ipcMain.handle("ryos-desktop:quit-and-install", (event) => {
    if (isTrustedIpcSender(event) && updateDownloaded) {
      autoUpdater.quitAndInstall();
    }
  });

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
    if (interactiveCheck) {
      interactiveCheck = false;
      void showMessage({
        type: "info",
        buttons: ["OK"],
        title: "Update Available",
        message: `ryOS ${info.version} is available.`,
        detail:
          "It's downloading in the background — you'll be prompted to restart when it's ready.",
      });
    }
  });
  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    broadcast({ state: "not-available", version: info.version });
    if (interactiveCheck) {
      interactiveCheck = false;
      void showMessage({
        type: "info",
        buttons: ["OK"],
        title: "You're Up to Date",
        message: `ryOS ${info.version} is the latest version.`,
      });
    }
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
    const message = err instanceof Error ? err.message : String(err);
    broadcast({ state: "error", message });
    if (interactiveCheck) {
      interactiveCheck = false;
      void showMessage({
        type: "error",
        buttons: ["OK"],
        title: "Update Error",
        message: "Couldn't check for updates.",
        detail: message,
      });
    }
  });

  setTimeout(() => void checkForUpdates(false), INITIAL_CHECK_DELAY_MS);
  setInterval(() => void checkForUpdates(false), CHECK_INTERVAL_MS);
}
