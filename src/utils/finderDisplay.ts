import {
  AppId,
  getTranslatedAppName,
  getTranslatedFolderNameFromName,
} from "@/utils/i18n";

export interface FinderDisplayItem {
  name: string;
  isDirectory: boolean;
  path: string;
  appId?: string;
  aliasType?: "file" | "app";
  aliasTarget?: string;
}

export function getFinderDisplayName(file: FinderDisplayItem): string {
  if (file.isDirectory) {
    return getTranslatedFolderNameFromName(file.name);
  }

  if (file.path.startsWith("/Applications/") && file.appId) {
    return getTranslatedAppName(file.appId as AppId);
  }

  if (file.path.startsWith("/Desktop/")) {
    if (file.aliasType === "app" && file.aliasTarget) {
      return getTranslatedAppName(file.aliasTarget as AppId);
    }

    if (file.appId) {
      return getTranslatedAppName(file.appId as AppId);
    }

    return file.name.replace(/\.[^/.]+$/, "");
  }

  if (
    file.path.startsWith("/Applets/") &&
    file.name.toLowerCase().endsWith(".app")
  ) {
    return file.name.slice(0, -4);
  }

  return file.name;
}

export function compareFinderItemsByDisplayName(
  a: FinderDisplayItem,
  b: FinderDisplayItem
): number {
  return getFinderDisplayName(a).localeCompare(getFinderDisplayName(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
