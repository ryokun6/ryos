import type { TFunction } from "i18next";
import { getAppIconPath } from "@/config/appRegistry";
import type { AppInstance } from "@/stores/useAppStore";
import type { AppletViewerInitialData } from "@/apps/applet-viewer";
import type { FileSystemItem } from "@/stores/useFilesStore";

/** Resolve dock icon/label for an applet-viewer instance. */
export function getDockAppletInfo(
  instance: AppInstance,
  getFileItem: (path: string) => FileSystemItem | undefined,
  t: TFunction,
): { icon: string; label: string; isEmoji: boolean } {
  const initialData = instance.initialData as AppletViewerInitialData | undefined;
  const path = initialData?.path || "";
  const file = path ? getFileItem(path) : undefined;

  const getFileName = (p: string): string => {
    const parts = p.split("/");
    const fileName = parts[parts.length - 1];
    return fileName.replace(/\.(html|app)$/i, "");
  };

  const label = path ? getFileName(path) : t("common.dock.appletStore");

  const fileIcon = file?.icon;
  const isEmojiIcon =
    fileIcon &&
    !fileIcon.startsWith("/") &&
    !fileIcon.startsWith("http") &&
    fileIcon.length <= 10;

  let icon: string;
  let isEmoji: boolean;
  if (!path) {
    icon = getAppIconPath("applet-viewer");
    isEmoji = false;
  } else {
    icon = isEmojiIcon ? fileIcon : "📦";
    isEmoji = true;
  }

  return { icon, label, isEmoji };
}
