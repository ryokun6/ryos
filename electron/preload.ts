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
});
