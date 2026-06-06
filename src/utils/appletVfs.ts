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

export type AppletContentSource = "indexeddb" | "share" | "lazy";

export type AppletVfsErrorCode =
  | "not_found"
  | "missing_uuid"
  | "content_unavailable"
  | "fetch_failed";

export class AppletVfsError extends Error {
  readonly code: AppletVfsErrorCode;

  constructor(message: string, code: AppletVfsErrorCode) {
    super(message);
    this.name = "AppletVfsError";
    this.code = code;
  }
}

export type FetchedAppletContent = {
  content: string;
  windowWidth?: number;
  windowHeight?: number;
};

export type ReadAppletContentResult = {
  content: string;
  fileItem: FileSystemItem;
  source: AppletContentSource;
  windowWidth?: number;
  windowHeight?: number;
};

type ReadAppletContentOptions = {
  fetchIfMissing?: boolean;
  allowEmpty?: boolean;
};

/**
 * Normalize a VFS path for lookup (leading slash, decoded segments, collapsed slashes).
 */
export function normalizeVfsPath(path: string): string {
  if (!path) return path;

  let normalized = path.trim();

  try {
    normalized = normalized
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
  } catch {
    // Keep the trimmed path when decoding fails.
  }

  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  normalized = normalized.replace(/^\/applets\//i, "/Applets/");

  return normalized.replace(/\/{2,}/g, "/");
}

/**
 * Resolve an active file-system item by path, with normalization and applet name fallback.
 */
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

async function contentRecordToString(
  content: string | Blob | null | undefined
): Promise<string | null> {
  if (content == null) return null;
  if (typeof content === "string") return content;
  if (content instanceof Blob) return content.text();
  return null;
}

async function readAppletContentFromIndexedDb(
  uuid: string
): Promise<string | null> {
  const stored = await loadFileContent(uuid, STORES.APPLETS);
  return contentRecordToString(stored?.content);
}

/**
 * Fetch applet HTML from the share service and cache it in IndexedDB.
 */
export async function fetchAndCacheAppletContentFromShare(
  filePath: string,
  metadata: Pick<FileSystemItem, "shareId" | "uuid" | "name" | "icon" | "createdBy">
): Promise<FetchedAppletContent | null> {
  const { shareId, uuid, name } = metadata;
  if (!shareId || !uuid) {
    console.warn(
      `[appletVfs] Cannot fetch applet content for ${filePath}: missing shareId or uuid`
    );
    return null;
  }

  if (
    typeof navigator !== "undefined" &&
    "onLine" in navigator &&
    !navigator.onLine
  ) {
    console.warn("[appletVfs] Cannot fetch applet content: offline");
    return null;
  }

  try {
    const response = await abortableFetch(
      `/api/share-applet?id=${encodeURIComponent(shareId)}`,
      {
        timeout: 15000,
        retry: { maxAttempts: 2, initialDelayMs: 500 },
      }
    );

    if (!response.ok) {
      console.warn(
        `[appletVfs] Share fetch failed for ${shareId}: HTTP ${response.status}`
      );
      return null;
    }

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
  } catch (error) {
    console.error(
      `[appletVfs] Error fetching shared applet content for ${shareId}:`,
      error
    );
    return null;
  }
}

/**
 * Read applet HTML content with IndexedDB, lazy default assets, and share fallbacks.
 */
export async function readAppletContent(
  path: string,
  options: ReadAppletContentOptions = {}
): Promise<ReadAppletContentResult> {
  const fetchIfMissing = options.fetchIfMissing ?? true;
  const allowEmpty = options.allowEmpty ?? false;
  const normalizedPath = normalizeVfsPath(path);
  const fileItem = resolveVfsFileItem(normalizedPath);

  if (!fileItem) {
    throw new AppletVfsError(`Applet not found: ${normalizedPath}`, "not_found");
  }

  if (!fileItem.uuid) {
    throw new AppletVfsError(
      `Applet missing content record: ${normalizedPath}`,
      "missing_uuid"
    );
  }

  const canonicalPath = fileItem.path;
  let content = await readAppletContentFromIndexedDb(fileItem.uuid);

  if (content != null && (allowEmpty || content.length > 0)) {
    return { content, fileItem, source: "indexeddb" };
  }

  const lazyLoaded = await ensureFileContentLoaded(canonicalPath, fileItem.uuid);
  if (lazyLoaded) {
    content = await readAppletContentFromIndexedDb(fileItem.uuid);
    if (content != null && (allowEmpty || content.length > 0)) {
      return { content, fileItem, source: "lazy" };
    }
  }

  if (fetchIfMissing && fileItem.shareId) {
    const fetched = await fetchAndCacheAppletContentFromShare(
      canonicalPath,
      fileItem
    );

    if (fetched && (allowEmpty || fetched.content.length > 0)) {
      return {
        content: fetched.content,
        fileItem,
        source: "share",
        windowWidth: fetched.windowWidth,
        windowHeight: fetched.windowHeight,
      };
    }

    throw new AppletVfsError(
      `Could not fetch applet content for ${canonicalPath}. The share may be missing or the network is unavailable.`,
      "fetch_failed"
    );
  }

  throw new AppletVfsError(
    fileItem.shareId
      ? `Applet content unavailable for ${canonicalPath}. Try again when online.`
      : `Applet content unavailable for ${canonicalPath}. No cached content or share link.`,
    "content_unavailable"
  );
}
