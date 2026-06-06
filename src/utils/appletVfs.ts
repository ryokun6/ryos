import { abortableFetch } from "@/utils/abortableFetch";
import { emitCloudSyncDomainChange } from "@/utils/cloudSyncEvents";
import { STORES } from "@/utils/indexedDB";
import {
  loadFileContent,
  saveFileContent,
} from "@/utils/indexedDBOperations";
import {
  ensureFileContentLoaded,
  type FileSystemItem,
  useFilesStore,
} from "@/stores/useFilesStore";

export class AppletVfsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppletVfsError";
  }
}

export function normalizeVfsPath(path: string): string {
  if (!path) return path;

  let normalized = path
    .trim()
    .split("/")
    .map((segment) => {
      if (!segment) return segment;
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");

  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  normalized = normalized.replace(/^\/applets\//i, "/Applets/");
  return normalized.replace(/\/{2,}/g, "/");
}

export function resolveVfsFileItem(path: string): FileSystemItem | undefined {
  const normalizedPath = normalizeVfsPath(path);
  const items = useFilesStore.getState().items;
  const direct = items[normalizedPath];

  if (direct?.status === "active") {
    return direct;
  }

  if (!normalizedPath.startsWith("/Applets/")) {
    return undefined;
  }

  const targetName = normalizedPath.slice("/Applets/".length).toLowerCase();
  for (const item of Object.values(items)) {
    if (
      item.status === "active" &&
      item.path.startsWith("/Applets/") &&
      item.path.slice("/Applets/".length).toLowerCase() === targetName
    ) {
      return item;
    }
  }

  return undefined;
}

async function readStoredAppletContent(uuid: string): Promise<string | null> {
  const stored = await loadFileContent(uuid, STORES.APPLETS);
  if (stored?.content == null) return null;
  if (typeof stored.content === "string") return stored.content;
  if (stored.content instanceof Blob) return stored.content.text();
  return null;
}

export async function fetchAndCacheAppletContentFromShare(
  filePath: string,
  metadata: Pick<FileSystemItem, "shareId" | "uuid" | "name" | "icon" | "createdBy">
): Promise<{
  content: string;
  windowWidth?: number;
  windowHeight?: number;
} | null> {
  const { shareId, uuid, name } = metadata;
  if (!shareId || !uuid) return null;

  if (
    typeof navigator !== "undefined" &&
    "onLine" in navigator &&
    !navigator.onLine
  ) {
    return null;
  }

  try {
    const response = await abortableFetch(
      `/api/share-applet?id=${encodeURIComponent(shareId)}`,
      { timeout: 15000, retry: { maxAttempts: 2, initialDelayMs: 500 } }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const content = typeof data.content === "string" ? data.content : "";

    await saveFileContent(
      uuid,
      name || filePath.split("/").pop() || shareId,
      content,
      STORES.APPLETS
    );
    emitCloudSyncDomainChange("files-applets");

    const metadataUpdates: Partial<FileSystemItem> = {};
    if (typeof data.icon === "string" && data.icon !== metadata.icon) {
      metadataUpdates.icon = data.icon;
    }
    if (
      typeof data.createdBy === "string" &&
      data.createdBy !== metadata.createdBy
    ) {
      metadataUpdates.createdBy = data.createdBy;
    }
    if (
      typeof data.windowWidth === "number" &&
      typeof data.windowHeight === "number"
    ) {
      metadataUpdates.windowWidth = data.windowWidth;
      metadataUpdates.windowHeight = data.windowHeight;
    }
    if (typeof data.createdAt === "number") {
      metadataUpdates.storeCreatedAt = data.createdAt;
    }

    if (Object.keys(metadataUpdates).length > 0) {
      useFilesStore.getState().updateItemMetadata(filePath, metadataUpdates);
    }

    return {
      content,
      windowWidth:
        typeof data.windowWidth === "number" ? data.windowWidth : undefined,
      windowHeight:
        typeof data.windowHeight === "number" ? data.windowHeight : undefined,
    };
  } catch {
    return null;
  }
}

export async function readAppletContent(
  path: string,
  options: { fetchIfMissing?: boolean } = {}
): Promise<{
  content: string;
  fileItem: FileSystemItem;
  windowWidth?: number;
  windowHeight?: number;
}> {
  const fetchIfMissing = options.fetchIfMissing ?? true;
  const fileItem = resolveVfsFileItem(path);

  if (!fileItem) {
    throw new AppletVfsError(`Applet not found: ${normalizeVfsPath(path)}`);
  }

  if (!fileItem.uuid) {
    throw new AppletVfsError(`Applet missing content record: ${fileItem.path}`);
  }

  let content = await readStoredAppletContent(fileItem.uuid);
  if (content) {
    return { content, fileItem };
  }

  if (await ensureFileContentLoaded(fileItem.path, fileItem.uuid)) {
    content = await readStoredAppletContent(fileItem.uuid);
    if (content) {
      return { content, fileItem };
    }
  }

  if (fetchIfMissing && fileItem.shareId) {
    const fetched = await fetchAndCacheAppletContentFromShare(
      fileItem.path,
      fileItem
    );

    if (fetched?.content) {
      return {
        content: fetched.content,
        fileItem,
        windowWidth: fetched.windowWidth,
        windowHeight: fetched.windowHeight,
      };
    }

    throw new AppletVfsError(
      `Could not fetch applet content for ${fileItem.path}. The share may be missing or the network is unavailable.`
    );
  }

  throw new AppletVfsError(
    fileItem.shareId
      ? `Applet content unavailable for ${fileItem.path}. Try again when online.`
      : `Applet content unavailable for ${fileItem.path}. No cached content or share link.`
  );
}
