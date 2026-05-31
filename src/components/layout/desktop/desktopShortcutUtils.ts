import type { AppId } from "@/config/appRegistry";
import { getAppIconPath } from "@/config/appRegistry";
import { prefetchAppChunk } from "@/config/lazyAppComponent";
import type { FileSystemItem } from "@/stores/useFilesStore";
import { getTranslatedAppName, getTranslatedFolderName } from "@/utils/i18n";

export function prefetchDesktopShortcutIntent(
  shortcut: FileSystemItem,
  getItem: (path: string) => FileSystemItem | undefined
): void {
  if (shortcut.aliasType === "app" && shortcut.aliasTarget) {
    prefetchAppChunk(shortcut.aliasTarget);
    return;
  }
  if (shortcut.aliasType !== "file" || !shortcut.aliasTarget) return;
  const target = shortcut.aliasTarget;
  if (target === "/Applications") {
    prefetchAppChunk("finder");
    return;
  }
  if (target.startsWith("/Applications/")) {
    const targetFile = getItem(target);
    if (targetFile?.appId) prefetchAppChunk(targetFile.appId);
    else prefetchAppChunk("finder");
    return;
  }
  if (target.startsWith("/Documents/")) {
    prefetchAppChunk("textedit");
    return;
  }
  if (target.startsWith("/Images/")) {
    prefetchAppChunk("paint");
    return;
  }
  if (target.startsWith("/Applets/")) {
    prefetchAppChunk("applet-viewer");
  }
}

export function getDesktopShortcutDisplayName(
  shortcut: FileSystemItem,
  getItem: (path: string) => FileSystemItem | undefined
): string {
  if (shortcut.aliasType === "app" && shortcut.aliasTarget) {
    return getTranslatedAppName(shortcut.aliasTarget as AppId);
  }
  if (shortcut.aliasType === "file" && shortcut.aliasTarget) {
    const targetFile = getItem(shortcut.aliasTarget);
    if (targetFile?.isDirectory) {
      return getTranslatedFolderName(shortcut.aliasTarget);
    }
  }
  return shortcut.name.replace(/\.[^/.]+$/, "");
}

export function getDesktopShortcutIcon(
  shortcut: FileSystemItem,
  getItem: (path: string) => FileSystemItem | undefined
): string {
  if (shortcut.aliasType === "app" && shortcut.aliasTarget) {
    const appId = shortcut.aliasTarget as AppId;
    try {
      const iconPath = getAppIconPath(appId);
      if (iconPath) {
        return iconPath;
      }
      console.warn(`[Desktop] getAppIconPath returned empty for app ${appId}`);
    } catch (err) {
      console.warn(`[Desktop] Failed to resolve icon for app ${appId}:`, err);
    }
    return "/icons/default/application.png";
  }

  if (shortcut.icon && shortcut.icon.trim() !== "") {
    return shortcut.icon;
  }

  if (shortcut.aliasType === "file" && shortcut.aliasTarget) {
    const targetFile = getItem(shortcut.aliasTarget);
    return targetFile?.icon || "/icons/default/file.png";
  }

  return "/icons/default/file.png";
}
