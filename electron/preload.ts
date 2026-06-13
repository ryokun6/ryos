import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

contextBridge.exposeInMainWorld("ryosDesktop", {
  platform: process.platform,
  isFullscreen: () =>
    ipcRenderer.invoke("ryos-desktop:is-fullscreen") as Promise<boolean>,
  onFullscreenChange: (callback: (fullscreen: boolean) => void) => {
    const listener = (_event: IpcRendererEvent, fullscreen: boolean) => {
      callback(fullscreen);
    };
    ipcRenderer.on("ryos-desktop:fullscreen-changed", listener);
    return () => {
      ipcRenderer.removeListener("ryos-desktop:fullscreen-changed", listener);
    };
  },
  toggleMaximize: () =>
    ipcRenderer.invoke("ryos-desktop:toggle-maximize") as Promise<void>,
  getVersion: () =>
    ipcRenderer.invoke("ryos-desktop:get-app-version") as Promise<string>,
  checkForUpdates: () =>
    ipcRenderer.invoke("ryos-desktop:check-for-updates") as Promise<
      string | null
    >,
  quitAndInstall: () =>
    ipcRenderer.invoke("ryos-desktop:quit-and-install") as Promise<void>,
  onUpdateStatus: (callback: (status: unknown) => void) => {
    const listener = (_event: IpcRendererEvent, status: unknown) => {
      callback(status);
    };
    ipcRenderer.on("ryos-desktop:update-status", listener);
    return () => {
      ipcRenderer.removeListener("ryos-desktop:update-status", listener);
    };
  },
});
