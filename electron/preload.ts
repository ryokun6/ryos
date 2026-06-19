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
  openFile: (options?: unknown) =>
    ipcRenderer.invoke("ryos-desktop:open-file", options) as Promise<unknown>,
  saveFile: (options: unknown) =>
    ipcRenderer.invoke("ryos-desktop:save-file", options) as Promise<unknown>,
  getVersion: () =>
    ipcRenderer.invoke("ryos-desktop:get-app-version") as Promise<string>,
  canShowNotifications: () =>
    ipcRenderer.invoke("ryos-desktop:can-show-notifications") as Promise<boolean>,
  shouldShowNativeNotification: () =>
    ipcRenderer.invoke(
      "ryos-desktop:should-show-native-notification"
    ) as Promise<boolean>,
  showNotification: (options: unknown) =>
    ipcRenderer.invoke(
      "ryos-desktop:show-notification",
      options
    ) as Promise<unknown>,
  configureChatNotifications: (config: unknown, state: unknown) =>
    ipcRenderer.invoke(
      "ryos-desktop:chat-notifications-configure",
      config,
      state
    ) as Promise<unknown>,
  updateChatNotificationState: (state: unknown) =>
    ipcRenderer.invoke(
      "ryos-desktop:chat-notifications-update-state",
      state
    ) as Promise<unknown>,
  stopChatNotifications: () =>
    ipcRenderer.invoke("ryos-desktop:chat-notifications-stop") as Promise<void>,
  onChatNotificationEvent: (callback: (eventPayload: unknown) => void) => {
    const listener = (_event: IpcRendererEvent, eventPayload: unknown) => {
      callback(eventPayload);
    };
    ipcRenderer.on("ryos-desktop:chat-notification-event", listener);
    return () => {
      ipcRenderer.removeListener(
        "ryos-desktop:chat-notification-event",
        listener
      );
    };
  },
  onChatNotificationStatus: (callback: (status: unknown) => void) => {
    const listener = (_event: IpcRendererEvent, status: unknown) => {
      callback(status);
    };
    ipcRenderer.on("ryos-desktop:chat-notification-status", listener);
    return () => {
      ipcRenderer.removeListener(
        "ryos-desktop:chat-notification-status",
        listener
      );
    };
  },
  onOpenChatRoomFromNotification: (
    callback: (roomId: string | null) => void
  ) => {
    const listener = (_event: IpcRendererEvent, roomId: unknown) => {
      callback(typeof roomId === "string" ? roomId : null);
    };
    ipcRenderer.on("ryos-desktop:open-chat-room-from-notification", listener);
    return () => {
      ipcRenderer.removeListener(
        "ryos-desktop:open-chat-room-from-notification",
        listener
      );
    };
  },
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
