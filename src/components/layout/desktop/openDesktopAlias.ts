import type { AppId } from "@/config/appRegistry";
import type { LaunchOriginRect } from "@/stores/useAppStore";
import type { FileSystemItem } from "@/stores/useFilesStore";
import { STORES, dbOperations } from "@/utils/indexedDB";
import { getDefaultFileApp } from "@/utils/fileAssociations";
import { getStoreForFile } from "@/utils/indexedDBOperations";

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
    if (targetFile.path.startsWith("/Applications/") && targetFile.appId) {
      launchApp(targetFile.appId as AppId, { launchOrigin });
      return;
    }

    const associatedAppId = getDefaultFileApp(targetFile);
    if (associatedAppId === "preview" || associatedAppId === "books") {
      launchApp(associatedAppId, {
        initialData: { path: targetFile.path },
        launchOrigin,
      });
      return;
    }

    let contentToUse: string | Blob | undefined = undefined;
    let contentAsString: string | undefined = undefined;

    const storeName = getStoreForFile(targetFile.path, {
      name: targetFile.name,
      type: targetFile.type,
    });
    if (storeName) {
      if (targetFile.uuid) {
        const contentData = await dbOperations.get<{
          name: string;
          content: string | Blob;
        }>(storeName, targetFile.uuid);

        if (contentData) {
          contentToUse = contentData.content;
          if (contentToUse instanceof Blob) {
            if (storeName === STORES.DOCUMENTS || storeName === STORES.APPLETS) {
              contentAsString = await contentToUse.text();
            }
          } else if (typeof contentToUse === "string") {
            contentAsString = contentToUse;
          }
        }
      }
    }

    if (associatedAppId === "textedit") {
      launchApp("textedit", {
        initialData: { path: targetFile.path, content: contentAsString ?? "" },
        launchOrigin,
      });
    } else if (associatedAppId === "paint") {
      launchApp("paint", {
        initialData: { path: targetFile.path, content: contentToUse },
        launchOrigin,
      });
    } else if (associatedAppId === "applet-viewer") {
      launchApp("applet-viewer", {
        initialData: {
          path: targetFile.path,
          content: contentAsString ?? "",
        },
        launchOrigin,
      });
    }
  } catch (err) {
    console.error(`[Desktop] Error opening alias target:`, err);
  }
}
