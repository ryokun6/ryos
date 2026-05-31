import type { AppId } from "@/config/appRegistry";
import type { FileSystemItem } from "@/stores/useFilesStore";
import { DEFAULT_SHORTCUT_ORDER } from "./desktopConstants";

export function compareDesktopShortcuts(
  a: FileSystemItem,
  b: FileSystemItem,
  isSystem7Theme: boolean
): number {
  if (a.aliasType === "app" && b.aliasType === "app") {
    const aIndex = DEFAULT_SHORTCUT_ORDER.indexOf(a.aliasTarget as AppId);
    const bIndex = DEFAULT_SHORTCUT_ORDER.indexOf(b.aliasTarget as AppId);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.name.localeCompare(b.name);
  }
  if (a.aliasType === "file" && a.aliasTarget === "/Applications") {
    if (b.aliasType === "file" && b.aliasTarget === "/Applications") {
      return a.name.localeCompare(b.name);
    }
    if (b.aliasType === "app") {
      const bIndex = DEFAULT_SHORTCUT_ORDER.indexOf(b.aliasTarget as AppId);
      if (isSystem7Theme) {
        if (bIndex >= 0 && bIndex <= 3) return 1;
        return -1;
      }
      if (bIndex === 0) return 1;
      if (bIndex !== -1) return -1;
    }
    return a.name.localeCompare(b.name);
  }
  if (b.aliasType === "file" && b.aliasTarget === "/Applications") {
    if (a.aliasType === "app") {
      const aIndex = DEFAULT_SHORTCUT_ORDER.indexOf(a.aliasTarget as AppId);
      if (isSystem7Theme) {
        if (aIndex >= 0 && aIndex <= 3) return -1;
        return 1;
      }
      if (aIndex === 0) return -1;
      if (aIndex !== -1) return 1;
    }
    return a.name.localeCompare(b.name);
  }
  if (a.aliasType === "app" && b.aliasType !== "app") return -1;
  if (a.aliasType !== "app" && b.aliasType === "app") return 1;
  return a.name.localeCompare(b.name);
}
