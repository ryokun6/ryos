import type { AppId } from "@/config/appRegistry";
import { dbOperations } from "@/apps/finder/hooks/useFileSystem";
import type { LaunchOriginRect } from "@/stores/useAppStore";
import type { FileSystemItem } from "@/stores/useFilesStore";
import { STORES } from "@/utils/indexedDB";
import { readAppletContent } from "@/utils/appletVfs";

export async function openDesktopAlias(
  shortcut: FileSystemItem,
  options: {
    toggleApp: (
      appId: AppId,
      initialData?: unknown,
      launchOrigin?: LaunchOriginRect
    ) => void;
    launchApp: (
      appId: AppId,
      options?: {
        initialData?: unknown;
        initialPath?: string;
        launchOrigin?: LaunchOriginRect;
      }
    ) => void;
    getItem: (path: string) => FileSystemItem | undefined;
    launchOrigin?: LaunchOriginRect;
  }
): Promise<void> {
  const { toggleApp, launchApp, getItem, launchOrigin } = options;
  if (!shortcut.aliasTarget || !shortcut.aliasType) return;

  if (shortcut.aliasType === "app") {
    const appId = shortcut.aliasTarget as AppId;
    toggleApp(appId, undefined, launchOrigin);
    return;
  }

  const targetPath = shortcut.aliasTarget;
  const targetFile = getItem(targetPath);

  if (!targetFile) {
    console.warn(`[Desktop] Target file not found: ${targetPath}`);
    return;
  }

  if (targetFile.isDirectory && targetPath === "/Applications") {
    launchApp("finder", { initialPath: "/Applications", launchOrigin });
    return;
  }

  try {
    let contentToUse: string | Blob | undefined = undefined;
    let contentAsString: string | undefined = undefined;

    if (
      targetFile.path.startsWith("/Documents/") ||
      targetFile.path.startsWith("/Images/")
    ) {
      if (targetFile.uuid) {
        const storeName = targetFile.path.startsWith("/Documents/")
          ? STORES.DOCUMENTS
          : STORES.IMAGES;

        const contentData = await dbOperations.get<{
          name: string;
          content: string | Blob;
        }>(storeName, targetFile.uuid);

        if (contentData) {
          contentToUse = contentData.content;
          if (contentToUse instanceof Blob) {
            if (targetFile.path.startsWith("/Documents/")) {
              contentAsString = await contentToUse.text();
            }
          } else if (typeof contentToUse === "string") {
            contentAsString = contentToUse;
          }
        }
      }
    }

    if (targetFile.path.startsWith("/Applications/") && targetFile.appId) {
      launchApp(targetFile.appId as AppId, { launchOrigin });
    } else if (targetFile.path.startsWith("/Documents/")) {
      launchApp("textedit", {
        initialData: { path: targetFile.path, content: contentAsString ?? "" },
        launchOrigin,
      });
    } else if (targetFile.path.startsWith("/Images/")) {
      launchApp("paint", {
        initialData: { path: targetFile.path, content: contentToUse },
        launchOrigin,
      });
    } else if (
      targetFile.path.startsWith("/Applets/") &&
      (targetFile.path.endsWith(".app") || targetFile.path.endsWith(".html"))
    ) {
      const { content, fileItem } = await readAppletContent(targetFile.path);
      launchApp("applet-viewer", {
        initialData: {
          path: fileItem.path,
          content,
        },
        launchOrigin,
      });
    }
  } catch (err) {
    console.error(`[Desktop] Error opening alias target:`, err);
  }
}
