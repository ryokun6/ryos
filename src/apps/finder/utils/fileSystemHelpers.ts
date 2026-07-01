import { FileItem as DisplayFileItem } from "../components/FileList";
import { STORES } from "@/utils/indexedDB";
import { type CloudSyncDeletionBucket } from "@/stores/useCloudSyncStore";
import { type SyncNamespace } from "@/shared/sync2/namespaces";

// Type for items displayed in the UI (might include contentUrl)
export interface ExtendedDisplayFileItem
  extends Omit<DisplayFileItem, "content"> {
  content?: string | Blob; // Keep content for passing to apps
  contentUrl?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any; // Add optional data field for virtual files
  originalPath?: string; // For trash items
  deletedAt?: number; // For trash items
  status?: "active" | "trashed"; // Include status for potential UI differences
}

export const getParentPath = (path: string): string => {
  if (path === "/") return "/";
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return "/";
  return `/${parts.slice(0, -1).join("/")}`;
};

export const getFinderAnalyticsPathInfo = (path: string, type?: string) => {
  const parts = path.split("/").filter(Boolean);
  const fileName = parts[parts.length - 1] || "";
  const extMatch = fileName.match(/\.([a-z0-9]+)$/i);
  return {
    topLevel: parts[0] || "root",
    fileType: type || extMatch?.[1]?.toLowerCase() || "unknown",
    isRoot: parts.length === 0,
  };
};

export const getFinderSizeBucket = (sizeBytes: number): string => {
  if (sizeBytes <= 0) return "empty";
  if (sizeBytes < 10 * 1024) return "<10kb";
  if (sizeBytes < 100 * 1024) return "10-100kb";
  if (sizeBytes < 1024 * 1024) return "100kb-1mb";
  return "1mb+";
};

export const arePathArraysEqual = (
  first: readonly string[],
  second: readonly string[]
) =>
  first.length === second.length &&
  first.every((path, index) => path === second[index]);

export interface FinderSelectionSnapshot {
  selectedFile: string | null;
  selectedFiles: string[];
  selectionAnchorPath: string | null;
}

export const resolveFinderSelectionSnapshot = (
  instanceSelection: FinderSelectionSnapshot | null | undefined,
  localSelection: FinderSelectionSnapshot
): FinderSelectionSnapshot => instanceSelection ?? localSelection;

export const DEFAULT_FILE_PATHS = new Set([
  "/Documents/README.md",
  "/Documents/Quick Tips.md",
  "/Books/Meditations - Marcus Aurelius.epub",
  "/Images/steve-jobs.png",
  "/Images/susan-kare.png",
]);

export const BOOK_FILE_ICON_PATH = "/icons/default/books.png";

export function isEpubFile(fileName: string, type?: string): boolean {
  return (
    fileName.toLowerCase().endsWith(".epub") ||
    type === "epub" ||
    type === "application/epub+zip"
  );
}

export const getCloudSyncDomainForContentStore = (
  storeName: string
): SyncNamespace | null => {
  switch (storeName) {
    case STORES.DOCUMENTS:
      return "files";
    case STORES.IMAGES:
      return "images";
    case STORES.BOOKS:
      return "books";
    case STORES.TRASH:
      return "trash";
    case STORES.APPLETS:
      return "applets";
    default:
      return null;
  }
};

export const getCloudSyncDeletionBucketForContentStore = (
  storeName: string
): CloudSyncDeletionBucket | null => {
  switch (storeName) {
    case STORES.IMAGES:
      return "fileImageKeys";
    case STORES.BOOKS:
      return "fileBookKeys";
    case STORES.TRASH:
      return "fileTrashKeys";
    case STORES.APPLETS:
      return "fileAppletKeys";
    default:
      return null;
  }
};

// --- Helper Functions --- //

// Get specific type from extension
export function getFileTypeFromExtension(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "unknown";
  switch (ext) {
    case "app":
      return "application";
    case "md":
      return "markdown";
    case "txt":
      return "text";
    case "png":
      return ext;
    case "jpg":
    case "jpeg":
      return "jpg"; // Standardize to jpg for jpeg/jpg files
    case "gif":
      return ext;
    case "webp":
      return ext;
    case "bmp":
      return ext;
    case "svg":
      return ext;
    case "pdf":
      return ext;
    case "html":
    case "htm":
      return "html";
    case "epub":
      return "epub";
    default:
      return "unknown";
  }
}

