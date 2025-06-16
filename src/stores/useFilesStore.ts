import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import { ensureIndexedDBInitialized, STORES } from "@/utils/indexedDB";

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
  clipboard: { items: string[]; operation: "copy" | "cut" } | null;
  setClipboard: (operation: "copy" | "cut", items: string[]) => void;
  clearClipboard: () => void;
  // Actions
  addItem: (item: Omit<FileSystemItem, "status">) => void; // Status defaults to active
  removeItem: (path: string, permanent?: boolean) => void; // Add flag for permanent deletion
  restoreItem: (path: string) => void;
  emptyTrash: () => string[]; // Returns UUIDs of items whose content should be deleted
  renameItem: (oldPath: string, newPath: string, newName: string) => void;
  moveItem: (sourcePath: string, destinationPath: string) => boolean; // Add moveItem method
  getItemsInPath: (path: string) => FileSystemItem[];
  getItem: (path: string) => FileSystemItem | undefined;
  getTrashItems: () => FileSystemItem[]; // Helper to get all trashed items
  reset: () => void;
  clearLibrary: () => void;
  resetLibrary: () => Promise<void>;
  initializeLibrary: () => Promise<void>;
}

// Function to load default files from JSON
async function loadDefaultFiles(): Promise<FileSystemData> {
  try {
    const res = await fetch("/data/filesystem.json");
    const data = await res.json();
    return data as FileSystemData;
  } catch (err) {
    console.error("Failed to load filesystem.json", err);
    return { directories: [], files: [] };
  }
}

// Helper function to get parent path
const getParentPath = (path: string): string => {
  if (path === "/") return "/";
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return "/"; // Parent of /Documents is /
  return "/" + parts.slice(0, -1).join("/");
};

// Save default file contents into IndexedDB using generated UUIDs
async function saveDefaultContents(
  files: FileSystemItemData[],
  items: Record<string, FileSystemItem>
) {
  try {
    const db = await ensureIndexedDBInitialized();
    for (const file of files) {
      const meta = items[file.path];
      const uuid = meta?.uuid;
      if (!uuid) continue;

      const storeName = file.path.startsWith("/Documents/")
        ? STORES.DOCUMENTS
        : file.path.startsWith("/Images/")
        ? STORES.IMAGES
        : null;
      if (!storeName) continue;

      const existing = await new Promise<StoredContent | undefined>((resolve) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req = store.get(uuid);
        req.onsuccess = () => resolve(req.result as StoredContent | undefined);
        req.onerror = () => resolve(undefined);
      });
      if (existing) continue;

      let content: string | Blob | null = null;
      if (file.content) {
        content = file.content;
      } else if (file.assetPath) {
        try {
          const resp = await fetch(file.assetPath);
          if (resp.ok) content = await resp.blob();
        } catch (err) {
          console.error(
            `[FilesStore] Failed fetching asset for ${file.path}:`,
            err
          );
        }
      }

      if (content != null) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(storeName, "readwrite");
          const store = tx.objectStore(storeName);
          const putReq = store.put({ name: file.name, content } as StoredContent, uuid);
          putReq.onsuccess = () => resolve();
          putReq.onerror = () => reject(putReq.error);
        });
      }
    }
    db.close();
  } catch (err) {
    console.error("[FilesStore] Error saving default contents:", err);
  }
}

// Function to generate an empty initial state (just for typing)
const getEmptyFileSystemState = (): Record<string, FileSystemItem> => ({});

const STORE_VERSION = 9; // Bumped due to addition of clipboard state
const STORE_NAME = "ryos:files";

const initialFilesData: FilesStoreState = {
  items: getEmptyFileSystemState(),
  libraryState: "uninitialized",
  clipboard: null,
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
          // Generate UUID for files (not directories)
          uuid: !itemData.isDirectory ? uuidv4() : undefined,
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

      getTrashItems: () => {
        return Object.values(get().items).filter(
          (item) => item.status === "trashed"
        );
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
        }
      },

      reset: () =>
        set({
          items: getEmptyFileSystemState(),
          libraryState: "uninitialized",
        }),

      setClipboard: (operation: "copy" | "cut", items: string[]) => {
        set(() => ({
          clipboard: {
            items,
            operation,
          },
        }));
      },

      clearClipboard: () => {
        set(() => ({ clipboard: null }));
      },
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        items: state.items, // Persist the entire file structure
        libraryState: state.libraryState,
        clipboard: state.clipboard,
      }),
      migrate: (persistedState: unknown, version: number) => {
        if (version < 5) {
          const oldState = persistedState as {
            items: Record<string, FileSystemItem>;
            libraryState?: LibraryState;
            clipboard?: { items: string[]; operation: "copy" | "cut" } | null;
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
            clipboard: oldState.clipboard || null,
          };
        }

        if (version < 6) {
          const oldState = persistedState as {
            items: Record<string, FileSystemItem>;
            libraryState?: LibraryState;
            clipboard?: { items: string[]; operation: "copy" | "cut" } | null;
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
            clipboard: oldState.clipboard || null,
          };
        }

        if (version < 7) {
          const oldState = persistedState as {
            items: Record<string, FileSystemItem>;
            libraryState?: LibraryState;
            clipboard?: { items: string[]; operation: "copy" | "cut" } | null;
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
            clipboard: oldState.clipboard || null,
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
          } else if (state && state.libraryState === "uninitialized") {
            // Only auto-initialize if library state is uninitialized
            Promise.resolve(state.initializeLibrary()).catch((err) =>
              console.error("Files initialization failed on rehydrate", err)
            );
          }
        };
      },
    }
  )
);
