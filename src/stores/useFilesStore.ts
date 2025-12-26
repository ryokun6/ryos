import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import { ensureIndexedDBInitialized, STORES } from "@/utils/indexedDB";
import type { OsThemeId } from "@/themes/types";
import { appRegistry } from "@/config/appRegistry";

// Define the structure for a file system item (metadata)
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

// Define a type for JSON file entries
interface FileSystemItemData extends Omit<FileSystemItem, "status"> {
  content?: string; // For documents
  assetPath?: string; // For images
}

// Structure for content stored in IndexedDB
interface StoredContent {
  name: string;
  content: string | Blob;
}

// Define the JSON structure
interface FileSystemData {
  directories: FileSystemItemData[];
  files: FileSystemItemData[];
}

type LibraryState = "uninitialized" | "loaded" | "cleared";

// Define the state structure
interface FilesStoreState {
  items: Record<string, FileSystemItem>; // path -> item map
  libraryState: LibraryState;
  // Actions
  addItem: (item: Omit<FileSystemItem, "status">) => void; // Status defaults to active
  removeItem: (path: string, permanent?: boolean) => void; // Add flag for permanent deletion
  restoreItem: (path: string) => void;
  emptyTrash: () => string[]; // Returns UUIDs of items whose content should be deleted
  renameItem: (oldPath: string, newPath: string, newName: string) => void;
  moveItem: (sourcePath: string, destinationPath: string) => boolean; // Add moveItem method
  getItemsInPath: (path: string) => FileSystemItem[];
  getItem: (path: string) => FileSystemItem | undefined;
  updateItemMetadata: (path: string, updates: Partial<FileSystemItem>) => void;
  getTrashItems: () => FileSystemItem[]; // Helper to get all trashed items
  createAlias: (
    targetPath: string,
    aliasName: string,
    aliasType: "file" | "app",
    targetAppId?: string
  ) => void; // Create an alias/shortcut in /Desktop
  reset: () => void;
  clearLibrary: () => void;
  resetLibrary: () => Promise<void>;
  initializeLibrary: () => Promise<void>;
  /** Ensure all root directories from filesystem.json exist in the store */
  syncRootDirectoriesFromDefaults: () => Promise<void>;
  /** Ensure default desktop shortcuts exist for all apps */
  ensureDefaultDesktopShortcuts: () => Promise<void>;
}

// ============================================================================
// CACHING & PRELOADING SYSTEM
// ============================================================================

// In-memory cache for JSON data to avoid repeated fetches
let cachedFileSystemData: FileSystemData | null = null;
let cachedAppletsData: { applets: FileSystemItemData[] } | null = null;
let fileSystemDataPromise: Promise<FileSystemData> | null = null;
let appletsDataPromise: Promise<{ applets: FileSystemItemData[] }> | null = null;

// Preload status tracking
let preloadStarted = false;

/**
 * Preload filesystem data early (can be called before React mounts).
 * This starts fetching JSON files in parallel without blocking.
 * Call this as early as possible in your app's entry point.
 */
export function preloadFileSystemData(): void {
  if (preloadStarted) return;
  preloadStarted = true;
  
  // Start fetching both JSON files in parallel (non-blocking)
  loadDefaultFiles();
  loadDefaultApplets();
}

// Function to load default files from JSON (with caching)
async function loadDefaultFiles(): Promise<FileSystemData> {
  // Return cached data immediately if available
  if (cachedFileSystemData) {
    return cachedFileSystemData;
  }
  
  // Return existing promise if fetch is in progress (deduplication)
  if (fileSystemDataPromise) {
    return fileSystemDataPromise;
  }
  
  // Start new fetch
  fileSystemDataPromise = (async () => {
    try {
      const res = await fetch("/data/filesystem.json");
      const data = await res.json();
      cachedFileSystemData = data as FileSystemData;
      return cachedFileSystemData;
    } catch (err) {
      console.error("Failed to load filesystem.json", err);
      return { directories: [], files: [] };
    } finally {
      fileSystemDataPromise = null;
    }
  })();
  
  return fileSystemDataPromise;
}

// Function to load default applets from JSON (with caching)
async function loadDefaultApplets(): Promise<{
  applets: FileSystemItemData[];
}> {
  // Return cached data immediately if available
  if (cachedAppletsData) {
    return cachedAppletsData;
  }
  
  // Return existing promise if fetch is in progress (deduplication)
  if (appletsDataPromise) {
    return appletsDataPromise;
  }
  
  // Start new fetch
  appletsDataPromise = (async () => {
    try {
      const res = await fetch("/data/applets.json");
      const data = await res.json();
      cachedAppletsData = { applets: data.applets || [] };
      return cachedAppletsData;
    } catch (err) {
      console.error("Failed to load applets.json", err);
      return { applets: [] };
    } finally {
      appletsDataPromise = null;
    }
  })();
  
  return appletsDataPromise;
}

// Helper function to get parent path
const getParentPath = (path: string): string => {
  if (path === "/") return "/";
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return "/"; // Parent of /Documents is /
  return "/" + parts.slice(0, -1).join("/");
};

// Track files pending lazy load (path -> FileSystemItemData)
const pendingLazyLoadFiles = new Map<string, FileSystemItemData>();

// Track which UUIDs are currently being loaded (to prevent duplicate fetches)
const loadingAssets = new Set<string>();

/**
 * Register files for lazy loading - content will be fetched on-demand
 * when the file is actually opened, not during initialization.
 */
function registerFilesForLazyLoad(
  files: FileSystemItemData[],
  items: Record<string, FileSystemItem>
) {
  for (const file of files) {
    const meta = items[file.path];
    if (!meta?.uuid) continue;
    // Only register files that have assetPath (binary assets that need fetching)
    if (file.assetPath) {
      pendingLazyLoadFiles.set(file.path, file);
    }
  }
}

/**
 * Load content for a specific file on-demand (lazy loading).
 * Call this when a file is opened to ensure its content is in IndexedDB.
 * Returns true if content was loaded (or already exists), false on error.
 */
export async function ensureFileContentLoaded(
  filePath: string,
  uuid: string
): Promise<boolean> {
  const storeName = filePath.startsWith("/Documents/")
    ? STORES.DOCUMENTS
    : filePath.startsWith("/Images/")
    ? STORES.IMAGES
    : filePath.startsWith("/Applets/")
    ? STORES.APPLETS
    : null;
  if (!storeName) return false;

  // Prevent duplicate concurrent loads
  if (loadingAssets.has(uuid)) {
    // Wait for existing load to complete
    await new Promise((resolve) => {
      const checkComplete = () => {
        if (!loadingAssets.has(uuid)) {
          resolve(true);
        } else {
          setTimeout(checkComplete, 50);
        }
      };
      checkComplete();
    });
    
    // Bug fix: After waiting, verify content was actually loaded by checking IndexedDB
    // The first request might have failed, so we need to verify
    try {
      const db = await ensureIndexedDBInitialized();
      try {
        const exists = await new Promise<boolean>((resolve) => {
          const tx = db.transaction(storeName, "readonly");
          const store = tx.objectStore(storeName);
          const req = store.get(uuid);
          req.onsuccess = () => resolve(!!req.result);
          req.onerror = () => resolve(false);
        });
        return exists;
      } finally {
        db.close();
      }
    } catch {
      return false;
    }
  }

  let db: IDBDatabase | null = null;
  
  try {
    db = await ensureIndexedDBInitialized();
    
    // Check if content already exists in IndexedDB
    const existing = await new Promise<StoredContent | undefined>((resolve) => {
      const tx = db!.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.get(uuid);
      req.onsuccess = () => resolve(req.result as StoredContent | undefined);
      req.onerror = () => resolve(undefined);
    });
    
    if (existing) {
      return true;
    }

    // Check if this file has pending lazy load data
    const pendingFile = pendingLazyLoadFiles.get(filePath);
    if (!pendingFile?.assetPath) {
      return false;
    }

    // Mark as loading
    loadingAssets.add(uuid);

    try {
      // Fetch the asset
      const resp = await fetch(pendingFile.assetPath);
      if (!resp.ok) {
        console.error(`[FilesStore] Failed to fetch asset: ${pendingFile.assetPath}`);
        return false;
      }
      
      const content = await resp.blob();
      
      // Save to IndexedDB
      await new Promise<void>((resolve, reject) => {
        const tx = db!.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const putReq = store.put(
          { name: pendingFile.name, content } as StoredContent,
          uuid
        );
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      });

      // Remove from pending once successfully loaded
      pendingLazyLoadFiles.delete(filePath);
      
      return true;
    } finally {
      loadingAssets.delete(uuid);
    }
  } catch (err) {
    console.error(`[FilesStore] Error loading content for ${filePath}:`, err);
    loadingAssets.delete(uuid);
    return false;
  } finally {
    // Bug fix: Ensure db is always closed, even on errors
    if (db) {
      db.close();
    }
  }
}

// Save default file contents into IndexedDB using generated UUIDs
// Optimized: Only saves text content immediately, defers binary assets for lazy loading
async function saveDefaultContents(
  files: FileSystemItemData[],
  items: Record<string, FileSystemItem>,
  options: { lazyLoadAssets?: boolean } = { lazyLoadAssets: true }
) {
  const textFiles: FileSystemItemData[] = [];
  const assetFiles: FileSystemItemData[] = [];
  
  // Separate text files (immediate) from asset files (lazy)
  for (const file of files) {
    if (file.content) {
      textFiles.push(file);
    } else if (file.assetPath) {
      assetFiles.push(file);
    }
  }
  
  // Register asset files for lazy loading
  if (options.lazyLoadAssets && assetFiles.length > 0) {
    registerFilesForLazyLoad(assetFiles, items);
  }
  
  // Only process text files immediately (they're small and already in JSON)
  if (textFiles.length === 0) return;
  
  let db: IDBDatabase | null = null;
  
  try {
    db = await ensureIndexedDBInitialized();
    
    // Group files by store for batch operations
    const filesByStore = new Map<string, { file: FileSystemItemData; uuid: string }[]>();
    
    for (const file of textFiles) {
      const meta = items[file.path];
      const uuid = meta?.uuid;
      if (!uuid) continue;

      const storeName = file.path.startsWith("/Documents/")
        ? STORES.DOCUMENTS
        : file.path.startsWith("/Images/")
        ? STORES.IMAGES
        : file.path.startsWith("/Applets/")
        ? STORES.APPLETS
        : null;
      if (!storeName) continue;

      if (!filesByStore.has(storeName)) {
        filesByStore.set(storeName, []);
      }
      filesByStore.get(storeName)!.push({ file, uuid });
    }
    
    // Process each store with batched operations
    for (const [storeName, storeFiles] of filesByStore) {
      // First, check which UUIDs already exist (batch read)
      const existingUUIDs = new Set<string>();
      await new Promise<void>((resolve) => {
        const tx = db!.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        let completed = 0;
        
        for (const { uuid } of storeFiles) {
          const req = store.get(uuid);
          req.onsuccess = () => {
            if (req.result) existingUUIDs.add(uuid);
            completed++;
            if (completed === storeFiles.length) resolve();
          };
          req.onerror = () => {
            completed++;
            if (completed === storeFiles.length) resolve();
          };
        }
        
        if (storeFiles.length === 0) resolve();
      });
      
      // Filter out existing files and batch write new ones
      const newFiles = storeFiles.filter(({ uuid }) => !existingUUIDs.has(uuid));
      if (newFiles.length === 0) continue;
      
      // Batch write in a single transaction
      await new Promise<void>((resolve, reject) => {
        const tx = db!.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        
        for (const { file, uuid } of newFiles) {
          if (file.content) {
            store.put({ name: file.name, content: file.content } as StoredContent, uuid);
          }
        }
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  } catch (err) {
    console.error("[FilesStore] Error saving default contents:", err);
  } finally {
    // Bug fix: Ensure db is always closed, even on errors
    if (db) {
      db.close();
    }
  }
}

// Function to generate an empty initial state (just for typing)
const getEmptyFileSystemState = (): Record<string, FileSystemItem> => ({});

const STORE_VERSION = 10; // Update Applets folder icon
const STORE_NAME = "ryos:files";

const initialFilesData: FilesStoreState = {
  items: getEmptyFileSystemState(),
  libraryState: "uninitialized",
  // ... actions will be defined below
} as FilesStoreState;

export const useFilesStore = create<FilesStoreState>()(
  persist(
    (set, get) => ({
      ...initialFilesData,

      addItem: (itemData) => {
        // Add item with default 'active' status and UUID for files
        const now = Date.now();
        const newItem: FileSystemItem = {
          ...itemData,
          status: "active",
          // Preserve existing UUID if passed, otherwise generate new one for files (not directories)
          uuid: itemData.uuid || (!itemData.isDirectory ? uuidv4() : undefined),
          // Set timestamps
          createdAt: itemData.createdAt || now,
          modifiedAt: itemData.modifiedAt || now,
        };
        console.log(`[FilesStore:addItem] Attempting to add:`, newItem); // Log item being added
        set((state) => {
          const parentPath = getParentPath(newItem.path);
          if (
            parentPath !== "/" &&
            (!state.items[parentPath] ||
              !state.items[parentPath].isDirectory ||
              state.items[parentPath].status === "trashed")
          ) {
            console.warn(
              `[FilesStore] Cannot add item. Parent directory "${parentPath}" does not exist or is trashed.`
            );
            return state;
          }

          // Check if item already exists
          const existingItem = state.items[newItem.path];
          if (existingItem) {
            // Update existing item, preserving UUID and createdAt
            console.log(
              `[FilesStore] Updating existing item at path "${newItem.path}"`
            );
            const updatedItem: FileSystemItem = {
              ...existingItem,
              ...newItem,
              uuid: existingItem.uuid || newItem.uuid, // Preserve existing UUID
              createdAt: existingItem.createdAt || newItem.createdAt, // Preserve original creation time
              modifiedAt: newItem.modifiedAt || now, // Always update modification time
              // Preserve shareId and createdBy - use nullish coalescing to only fall back if undefined/null
              shareId: newItem.shareId ?? existingItem.shareId,
              createdBy: newItem.createdBy ?? existingItem.createdBy,
              storeCreatedAt: newItem.storeCreatedAt ?? existingItem.storeCreatedAt,
            };

            return {
              items: { ...state.items, [newItem.path]: updatedItem },
              libraryState: "loaded",
            };
          }

          // Add new item
          const updatedItems = { ...state.items, [newItem.path]: newItem };

          // Update trash icon if adding to trash (shouldn't happen via addItem, but safety check)
          if (
            parentPath === "/Trash" &&
            state.items["/Trash"]?.icon !== "/icons/trash-full.png"
          ) {
            updatedItems["/Trash"] = {
              ...state.items["/Trash"],
              icon: "/icons/trash-full.png",
            };
          }
          console.log(
            `[FilesStore:addItem] Successfully added: ${newItem.path}`
          ); // Log success
          return { items: updatedItems, libraryState: "loaded" };
        });
      },

      // Modified removeItem: Marks as trashed by default, permanently deletes if flag set or already trashed
      removeItem: (path, permanent = false) => {
        set((state) => {
          const itemToRemove = state.items[path];
          if (!itemToRemove) {
            console.warn(
              `[FilesStore] Cannot remove item. Path "${path}" does not exist.`
            );
            return state; // Item doesn't exist
          }

          const newItems = { ...state.items };
          const itemsToDelete = [path];
          const deletedContentPaths: string[] = []; // Track paths of deleted file content

          // If it's a directory, find all children
          if (itemToRemove.isDirectory) {
            Object.keys(newItems).forEach((itemPath) => {
              if (itemPath.startsWith(path + "/")) {
                itemsToDelete.push(itemPath);
              }
            });
          }

          // Determine if this is a permanent deletion or move to trash
          const isPermanentDelete =
            permanent || itemToRemove.status === "trashed";

          itemsToDelete.forEach((p) => {
            const currentItem = newItems[p];
            if (!currentItem) return;

            if (isPermanentDelete) {
              // Actually delete metadata
              if (!currentItem.isDirectory) {
                deletedContentPaths.push(p); // Mark content for deletion by hook
              }
              delete newItems[p];
            } else if (currentItem.status === "active") {
              // Mark as trashed
              newItems[p] = {
                ...currentItem,
                status: "trashed",
                originalPath: p,
                deletedAt: Date.now(),
              };
            }
          });

          // Update trash icon state
          const trashIsEmpty = Object.values(newItems).every(
            (item) => item.status !== "trashed"
          );
          if (newItems["/Trash"]) {
            newItems["/Trash"] = {
              ...newItems["/Trash"],
              icon: trashIsEmpty
                ? "/icons/trash-empty.png"
                : "/icons/trash-full.png",
            };
          }

          return { items: newItems };
        });
        // Note: We don't return deletedContentPaths here, hook needs to manage content separately
      },

      restoreItem: (path) => {
        set((state) => {
          const itemToRestore = state.items[path];
          if (!itemToRestore || itemToRestore.status !== "trashed") {
            console.warn(
              `[FilesStore] Cannot restore item. Path "${path}" not found or not in trash.`
            );
            return state;
          }

          const newItems = { ...state.items };
          const itemsToRestore = [path];

          // If it's a directory, find all children marked as trashed *within this original path*
          if (itemToRestore.isDirectory) {
            Object.keys(newItems).forEach((itemPath) => {
              if (
                itemPath.startsWith(path + "/") &&
                newItems[itemPath]?.status === "trashed"
              ) {
                itemsToRestore.push(itemPath);
              }
            });
          }

          itemsToRestore.forEach((p) => {
            const currentItem = newItems[p];
            if (currentItem && currentItem.status === "trashed") {
              newItems[p] = {
                ...currentItem,
                status: "active",
                originalPath: undefined,
                deletedAt: undefined,
              };
            }
          });

          // Update trash icon state
          const trashIsEmpty = Object.values(newItems).every(
            (item) => item.status !== "trashed"
          );
          if (newItems["/Trash"]) {
            newItems["/Trash"] = {
              ...newItems["/Trash"],
              icon: trashIsEmpty
                ? "/icons/trash-empty.png"
                : "/icons/trash-full.png",
            };
          }

          return { items: newItems };
        });
      },

      emptyTrash: () => {
        const trashedItems = get().getTrashItems();
        const contentUUIDsToDelete: string[] = [];
        trashedItems.forEach((item) => {
          get().removeItem(item.path, true); // Call internal remove with permanent flag
          if (!item.isDirectory && item.uuid) {
            contentUUIDsToDelete.push(item.uuid); // Collect UUIDs for content deletion
          }
        });
        return contentUUIDsToDelete; // Return UUIDs of files whose content should be deleted
      },

      renameItem: (oldPath, newPath, newName) => {
        set((state) => {
          const itemToRename = state.items[oldPath];
          // Only allow renaming active items
          if (!itemToRename || itemToRename.status !== "active") {
            console.warn(
              `[FilesStore] Cannot rename item. Path "${oldPath}" not found or not active.`
            );
            return state;
          }
          if (state.items[newPath]) {
            console.warn(
              `[FilesStore] Cannot rename item. New path "${newPath}" already exists.`
            );
            return state;
          }

          const newItems = { ...state.items };
          delete newItems[oldPath]; // Remove old entry

          const updatedItem = { ...itemToRename, path: newPath, name: newName };
          newItems[newPath] = updatedItem;

          // If it's a directory, rename all children paths (including trashed ones within)
          if (itemToRename.isDirectory) {
            Object.keys(state.items).forEach((itemPath) => {
              if (itemPath.startsWith(oldPath + "/")) {
                const relativePath = itemPath.substring(oldPath.length);
                const childNewPath = newPath + relativePath;
                const childItem = state.items[itemPath];
                delete newItems[itemPath];
                // Update originalPath if the child is trashed
                const updatedOriginalPath =
                  childItem.status === "trashed" ? childNewPath : undefined;
                newItems[childNewPath] = {
                  ...childItem,
                  path: childNewPath,
                  originalPath: updatedOriginalPath,
                };
              }
            });
          }

          return { items: newItems };
        });
      },

      moveItem: (sourcePath, destinationPath) => {
        let success = false;
        set((state) => {
          const sourceItem = state.items[sourcePath];
          if (!sourceItem || sourceItem.status !== "active") {
            console.warn(
              `[FilesStore] Cannot move item. Source path "${sourcePath}" not found or not active.`
            );
            return state;
          }

          const destinationParent = getParentPath(destinationPath);
          if (
            !state.items[destinationParent] ||
            !state.items[destinationParent].isDirectory
          ) {
            console.warn(
              `[FilesStore] Cannot move item. Destination parent "${destinationParent}" not found or not a directory.`
            );
            return state;
          }

          if (state.items[destinationPath]) {
            console.warn(
              `[FilesStore] Cannot move item. Destination path "${destinationPath}" already exists.`
            );
            return state;
          }

          // Check if we're trying to move a directory to its own subdirectory
          if (
            sourceItem.isDirectory &&
            destinationPath.startsWith(sourcePath + "/")
          ) {
            console.warn(
              `[FilesStore] Cannot move directory into its own subdirectory.`
            );
            return state;
          }

          const newItems = { ...state.items };

          // Remove source entry
          delete newItems[sourcePath];

          // Add destination entry
          const movedItem = { ...sourceItem, path: destinationPath };
          newItems[destinationPath] = movedItem;

          // If it's a directory, move all its children
          if (sourceItem.isDirectory) {
            Object.keys(state.items).forEach((itemPath) => {
              if (itemPath.startsWith(sourcePath + "/")) {
                const relativePath = itemPath.substring(sourcePath.length);
                const childNewPath = destinationPath + relativePath;
                const childItem = state.items[itemPath];

                delete newItems[itemPath];

                newItems[childNewPath] = {
                  ...childItem,
                  path: childNewPath,
                };
              }
            });
          }

          success = true;
          return { items: newItems };
        });

        return success;
      },

      getItemsInPath: (path) => {
        const allItems = Object.values(get().items);

        if (path === "/") {
          // Special case for root: Return top-level active directories/virtual directories
          return allItems.filter(
            (item) =>
              item.status === "active" &&
              item.path !== "/" && // Exclude the root item itself
              getParentPath(item.path) === "/" // Ensure it's a direct child of root
          );
        }

        if (path === "/Trash") {
          // Show only top-level *trashed* items (items originally from root or elsewhere)
          // Let's refine this: show items whose *originalPath* parent was root, or items directly trashed?
          // For now, let's show all items *marked* as trashed, regardless of original location depth.
          // The UI might need adjustment if we only want top-level trash display.
          return allItems.filter((item) => item.status === "trashed");
        }

        // For regular paths, show only direct children that are active
        return allItems.filter(
          (item) =>
            item.status === "active" && getParentPath(item.path) === path
        );
      },

      getItem: (path) => get().items[path],

      updateItemMetadata: (path, updates) => {
        set((state) => {
          const existingItem = state.items[path];
          if (!existingItem) {
            console.warn(
              `[FilesStore] Cannot update metadata. Path "${path}" does not exist.`
            );
            return state;
          }
          return {
            items: {
              ...state.items,
              [path]: {
                ...existingItem,
                ...updates,
                modifiedAt: Date.now(),
              },
            },
          };
        });
      },

      getTrashItems: () => {
        return Object.values(get().items).filter(
          (item) => item.status === "trashed"
        );
      },

      createAlias: (targetPath, aliasName, aliasType, targetAppId) => {
        set((state) => {
          // Ensure /Desktop directory exists
          if (!state.items["/Desktop"] || !state.items["/Desktop"].isDirectory) {
            console.warn(
              "[FilesStore] Cannot create alias. /Desktop directory does not exist."
            );
            return state;
          }

          const newItems: Record<string, FileSystemItem> = { ...state.items };

          // Get the original item to copy icon/name from
          let originalItem: FileSystemItem | undefined;
          let icon: string | undefined;
          let name: string = aliasName;

          if (aliasType === "app" && targetAppId) {
            // For apps, don't set icon here - let Desktop component resolve it via getAppIconPath
            icon = undefined;
          } else {
            // For files/applets, get from the file system
            originalItem = state.items[targetPath];
            if (originalItem) {
              icon = originalItem.icon;
              // Use original name if aliasName not provided
              if (!aliasName || aliasName === originalItem.name) {
                name = originalItem.name;
              }
            } else {
              icon = "/icons/default/file.png";
            }
          }

          // Create unique alias path
          const aliasPath = `/Desktop/${name}`;
          let finalAliasPath = aliasPath;
          let counter = 1;

          const isActiveAtPath = (path: string): boolean => {
            const existing = newItems[path];
            return !!existing && existing.status === "active";
          };

          // If there is a trashed item at the base alias path, permanently
          // free that path so a new alias can reuse the original name.
          const existingAtAliasPath = newItems[aliasPath];
          if (existingAtAliasPath && existingAtAliasPath.status === "trashed") {
            delete newItems[aliasPath];
          }

          // Ensure unique name, only considering active items
          while (isActiveAtPath(finalAliasPath)) {
            const ext = name.includes(".")
              ? `.${name.split(".").pop()}`
              : "";
            const baseName = ext ? name.slice(0, -ext.length) : name;
            finalAliasPath = `/Desktop/${baseName} ${counter}${ext}`;
            counter++;
          }

          const now = Date.now();
          const aliasItem: FileSystemItem = {
            path: finalAliasPath,
            name: finalAliasPath.split("/").pop() || name,
            isDirectory: false,
            icon: icon,
            type: aliasType === "app" ? "application" : originalItem?.type || "alias",
            aliasTarget: aliasType === "app" && targetAppId ? targetAppId : targetPath,
            aliasType: aliasType,
            appId: aliasType === "app" ? targetAppId : undefined,
            status: "active",
            createdAt: now,
            modifiedAt: now,
          };

          return {
            items: {
              ...newItems,
              [finalAliasPath]: aliasItem,
            },
          };
        });
      },

      clearLibrary: () =>
        set({
          items: getEmptyFileSystemState(),
          libraryState: "cleared",
        }),

      resetLibrary: async () => {
        const data = await loadDefaultFiles();
        const newItems: Record<string, FileSystemItem> = {};
        const now = Date.now();

        // Add directories
        data.directories.forEach((dir) => {
          newItems[dir.path] = {
            ...dir,
            status: "active",
            createdAt: now,
            modifiedAt: now,
          };
        });

        // Add files
        data.files.forEach((file) => {
          newItems[file.path] = {
            ...file,
            status: "active",
            // Generate UUID for files (not directories)
            uuid: uuidv4(),
            createdAt: now,
            modifiedAt: now,
          };
        });

        set({
          items: newItems,
          libraryState: "loaded",
        });

        await saveDefaultContents(data.files, newItems);
      },

      initializeLibrary: async () => {
        const current = get();
        // Only initialize if the library is in uninitialized state
        if (current.libraryState === "uninitialized") {
          const data = await loadDefaultFiles();
          const appletsData = await loadDefaultApplets();
          const newItems: Record<string, FileSystemItem> = {};
          const now = Date.now();

          // Add directories
          data.directories.forEach((dir) => {
            newItems[dir.path] = {
              ...dir,
              status: "active",
              createdAt: now,
              modifiedAt: now,
            };
          });

          // Add files
          data.files.forEach((file) => {
            newItems[file.path] = {
              ...file,
              status: "active",
              // Generate UUID for files (not directories)
              uuid: uuidv4(),
              createdAt: now,
              modifiedAt: now,
            };
          });

          // Add applets
          appletsData.applets.forEach((applet) => {
            newItems[applet.path] = {
              ...applet,
              status: "active",
              // Generate UUID for applets
              uuid: uuidv4(),
              createdAt: now,
              modifiedAt: now,
            };
          });

          set({
            items: newItems,
            libraryState: "loaded",
          });

          // Save default contents for both files and applets
          await saveDefaultContents(data.files, newItems);
          await saveDefaultContents(appletsData.applets, newItems);

          // Create default desktop shortcuts after directories are set up
          await get().ensureDefaultDesktopShortcuts();
        }
      },

      syncRootDirectoriesFromDefaults: async () => {
        try {
          const data = await loadDefaultFiles();
          const now = Date.now();
          set((state) => {
            const newItems = { ...state.items };
            // Ensure all root-level directories (including "/") exist
            data.directories
              .filter(
                (dir) => dir.path === "/" || getParentPath(dir.path) === "/"
              )
              .forEach((dir) => {
                const existing = newItems[dir.path];
                if (!existing) {
                  newItems[dir.path] = {
                    ...dir,
                    status: "active",
                    createdAt: now,
                    modifiedAt: now,
                  };
                } else {
                  // If it exists but is trashed or missing essential fields, bring it back and align minimal metadata
                  const needsUpdate =
                    existing.status !== "active" ||
                    existing.isDirectory !== true ||
                    !existing.name ||
                    !existing.type ||
                    existing.icon !== (dir.icon || existing.icon);
                  if (needsUpdate) {
                    newItems[dir.path] = {
                      ...existing,
                      name: dir.name || existing.name,
                      isDirectory: true,
                      type: dir.type || existing.type || "directory",
                      icon: dir.icon || existing.icon,
                      status: "active",
                      modifiedAt: now,
                    };
                  }
                }
              });
            return { items: newItems };
          });
        } catch (err) {
          console.error(
            "[FilesStore] Failed to sync root directories from defaults:",
            err
          );
        }
      },

      ensureDefaultDesktopShortcuts: async () => {
        try {
          const state = get();
          // Ensure Desktop folder exists
          if (!state.items["/Desktop"] || !state.items["/Desktop"].isDirectory) {
            return;
          }

          const desktopItems = Object.values(state.items).filter(
            (item) =>
              item.status === "active" && getParentPath(item.path) === "/Desktop"
          );
          const trashedItems = Object.values(state.items).filter(
            (item) => item.status === "trashed"
          );

          // Process all apps in registry except Finder and Control Panels
          const apps = Object.values(appRegistry).filter(
            (app: { id: string }) => app.id !== "finder" && app.id !== "control-panels"
          );

          // Collect all shortcuts to create in a single batch update
          const shortcutsToCreate: Array<{
            appId: string;
            appName: string;
            hiddenOnThemes: string[];
          }> = [];

          for (const app of apps) {
            const appId = app.id;

            // Check existence
            const hasActiveShortcut = desktopItems.some(
              (item) => item.aliasType === "app" && item.aliasTarget === appId
            );
            const hasTrashedShortcut = trashedItems.some(
              (item) =>
                item.aliasType === "app" &&
                item.aliasTarget === appId &&
                item.originalPath?.startsWith("/Desktop/")
            );

            if (!hasActiveShortcut && !hasTrashedShortcut) {
              // Queue shortcut for batch creation
              shortcutsToCreate.push({
                appId,
                appName: app.name,
                // Apply hiddenOnThemes for non-iPod/AppletViewer
                // This ensures they are hidden on macOS X theme but visible on others
                hiddenOnThemes: appId !== "ipod" && appId !== "applet-viewer" ? ["macosx"] : [],
              });
            }
          }

          // Batch create all shortcuts in a single state update
          if (shortcutsToCreate.length > 0) {
            set((currentState) => {
              const newItems = { ...currentState.items };
              const now = Date.now();

              for (const shortcut of shortcutsToCreate) {
                const aliasPath = `/Desktop/${shortcut.appName}`;
                let finalAliasPath = aliasPath;
                let counter = 1;

                // Ensure unique path
                while (newItems[finalAliasPath] && newItems[finalAliasPath].status === "active") {
                  finalAliasPath = `/Desktop/${shortcut.appName} ${counter}`;
                  counter++;
                }

                const aliasItem: FileSystemItem = {
                  path: finalAliasPath,
                  name: finalAliasPath.split("/").pop() || shortcut.appName,
                  isDirectory: false,
                  icon: undefined, // Let Desktop component resolve via getAppIconPath
                  type: "application",
                  aliasTarget: shortcut.appId,
                  aliasType: "app",
                  appId: shortcut.appId,
                  status: "active",
                  createdAt: now,
                  modifiedAt: now,
                  hiddenOnThemes: shortcut.hiddenOnThemes.length > 0 ? shortcut.hiddenOnThemes as OsThemeId[] : undefined,
                };

                newItems[finalAliasPath] = aliasItem;
              }

              return { items: newItems };
            });
          }
        } catch (err) {
          console.error("[FilesStore] Failed to ensure default desktop shortcuts:", err);
        }
      },

      reset: () =>
        set({
          items: getEmptyFileSystemState(),
          libraryState: "uninitialized",
        }),
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        items: state.items, // Persist the entire file structure
        libraryState: state.libraryState,
      }),
      migrate: (persistedState: unknown, version: number) => {
        if (version < 5) {
          const oldState = persistedState as {
            items: Record<string, FileSystemItem>;
            libraryState?: LibraryState;
          };
          const newState: Record<string, FileSystemItem> = {};

          for (const path in oldState.items) {
            const oldItem = oldState.items[path];
            newState[path] = {
              ...oldItem,
              status: oldItem.status || "active", // Add default status
              // Add UUID for files that don't have one
              uuid:
                !oldItem.isDirectory && !oldItem.uuid ? uuidv4() : oldItem.uuid,
            };
          }
          // Ensure /Trash exists with active status
          if (!newState["/Trash"]) {
            newState["/Trash"] = {
              path: "/Trash",
              name: "Trash",
              isDirectory: true,
              type: "directory",
              icon: "/icons/trash-empty.png",
              status: "active",
            };
          }

          // IMPORTANT: For migrations from older versions without libraryState,
          // we should assume the library is already loaded if there are ANY items
          // (including just the Trash directory). This prevents accidental re-initialization
          // that would override user data with defaults.
          const hasAnyItems = Object.keys(newState).length > 0;

          return {
            items: newState,
            libraryState: (oldState.libraryState ||
              (hasAnyItems ? "loaded" : "uninitialized")) as LibraryState,
          };
        }

        if (version < 6) {
          const oldState = persistedState as {
            items: Record<string, FileSystemItem>;
            libraryState?: LibraryState;
          };
          const newState: Record<string, FileSystemItem> = {};
          const now = Date.now();

          for (const path in oldState.items) {
            const oldItem = oldState.items[path];
            newState[path] = {
              ...oldItem,
              // Add timestamps to existing items
              createdAt: oldItem.createdAt || oldItem.deletedAt || now,
              modifiedAt: oldItem.modifiedAt || oldItem.deletedAt || now,
            };
          }

          return {
            items: newState,
            libraryState: oldState.libraryState || "loaded",
          };
        }

        if (version < 7) {
          const oldState = persistedState as {
            items: Record<string, FileSystemItem>;
            libraryState?: LibraryState;
          };
          const newState: Record<string, FileSystemItem> = {};

          for (const path in oldState.items) {
            const oldItem = oldState.items[path];
            newState[path] = {
              ...oldItem,
              // Size will be updated on next save for existing files
              size: oldItem.size || undefined,
            };
          }

          return {
            items: newState,
            libraryState: oldState.libraryState || "loaded",
          };
        }

        if (version < 8) {
          // Version 8 doesn't change the data structure,
          // but we bump it to trigger the one-time sync in useFileSystem
          // which will calculate actual file sizes and set proper timestamps
          return persistedState;
        }

        return persistedState;
      },
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            console.error("Error rehydrating files store:", error);
            return;
          }
          
          if (!state) return;

          if (state.libraryState === "uninitialized") {
            // For new users: initializeLibrary handles everything including
            // creating directories and desktop shortcuts in proper order
            Promise.resolve(state.initializeLibrary()).catch((err) =>
              console.error("Files initialization failed on rehydrate", err)
            );
          } else {
            // For existing users: sync root directories and ensure desktop shortcuts
            // This handles cases where new apps are added in updates
            // Also register default files for lazy loading (uses cached JSON)
            Promise.all([
              loadDefaultFiles().then((data) => {
                // Register default files for lazy loading so existing users
                // can benefit from cached content loading
                registerFilesForLazyLoad(data.files, state.items);
              }),
              state.syncRootDirectoriesFromDefaults().then(() => {
                // After syncing roots, ensure desktop shortcuts
                if (state.ensureDefaultDesktopShortcuts) {
                  return state.ensureDefaultDesktopShortcuts();
                }
              }),
            ]).catch(
              (err) =>
                console.error(
                  "Files root directory sync failed on rehydrate",
                  err
                )
            );
          }
        };
      },
    }
  )
);
