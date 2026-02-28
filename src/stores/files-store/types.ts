import type { OsThemeId } from "@/themes/types";

/** Metadata for a file or folder in the virtual filesystem. Content is stored separately in IndexedDB. */
export interface FileSystemItem {
  path: string; // Full path, unique identifier (e.g., "/Documents/My Folder/My File.txt")
  name: string; // Just the file/folder name (e.g., "My File.txt")
  isDirectory: boolean;
  icon?: string; // Optional: Specific icon override
  type?: string; // File type (e.g., 'text', 'png', 'folder') - derived if not folder
  appId?: string; // For launching applications or associated apps
  uuid?: string; // Unique identifier for content storage (only for files, not directories)
  // File properties
  size?: number; // File size in bytes (only for files, not directories)
  // Timestamp properties
  createdAt?: number; // Timestamp when file was created
  modifiedAt?: number; // Timestamp when file was last modified
  // Trash properties
  status: "active" | "trashed";
  originalPath?: string; // Path before being moved to trash
  deletedAt?: number; // Timestamp when moved to trash
  // Applet sharing properties
  shareId?: string; // Share ID for shared applets (from Redis)
  createdBy?: string; // Username of the creator
  storeCreatedAt?: number; // Timestamp of the store version used for update checks
  // Window dimensions
  windowWidth?: number; // Window width when last opened
  windowHeight?: number; // Window height when last opened
  // Alias/shortcut properties
  aliasTarget?: string; // Path or appId that the alias points to
  aliasType?: "file" | "app"; // Type of alias - file/app/applet or application
  /** For default shortcuts: hide them on these OS themes (user-pinned remain visible). */
  hiddenOnThemes?: OsThemeId[];
  // Content is NOT stored here, only metadata
}

/** File/folder entry from JSON with optional content (for documents) or assetPath (for images). */
export interface FileSystemItemData extends Omit<FileSystemItem, "status"> {
  content?: string; // For documents
  assetPath?: string; // For images
}

/** Structure for content stored in IndexedDB */
export interface StoredContent {
  name: string;
  content: string | Blob;
}

/** JSON structure for default filesystem layout */
export interface FileSystemData {
  directories: FileSystemItemData[];
  files: FileSystemItemData[];
}

export type LibraryState = "uninitialized" | "loaded" | "cleared";

/** Path query cache for fast getItemsInPath/getTrashItems lookups */
export interface PathQueryCache {
  itemsRef: Record<string, FileSystemItem> | null;
  activeChildrenByParent: Map<string, FileSystemItem[]>;
  trashedItems: FileSystemItem[];
}

export interface FilesStoreState {
  items: Record<string, FileSystemItem>;
  libraryState: LibraryState;
  addItem: (item: Omit<FileSystemItem, "status">) => void;
  removeItem: (path: string, permanent?: boolean) => void;
  restoreItem: (path: string) => void;
  emptyTrash: () => string[];
  renameItem: (oldPath: string, newPath: string, newName: string) => void;
  moveItem: (sourcePath: string, destinationPath: string) => boolean;
  getItemsInPath: (path: string) => FileSystemItem[];
  getItem: (path: string) => FileSystemItem | undefined;
  updateItemMetadata: (path: string, updates: Partial<FileSystemItem>) => void;
  getTrashItems: () => FileSystemItem[];
  createAlias: (
    targetPath: string,
    aliasName: string,
    aliasType: "file" | "app",
    targetAppId?: string
  ) => void;
  reset: () => void;
  clearLibrary: () => void;
  resetLibrary: () => Promise<void>;
  initializeLibrary: () => Promise<void>;
  syncRootDirectoriesFromDefaults: () => Promise<void>;
  ensureDefaultDesktopShortcuts: () => Promise<void>;
}
