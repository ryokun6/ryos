import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import { getAppBasicInfoList } from "@/config/appRegistryData";
import type { OsThemeId } from "@/themes/types";
import {
  type FileSystemItem,
  type FilesStoreState,
  type LibraryState,
} from "./types";
import {
  getParentPath,
  ensurePathQueryCache,
  getItem as selectGetItem,
  getItemsInPath as selectGetItemsInPath,
  getTrashItems as selectGetTrashItems,
} from "./selectors";
import {
  loadDefaultFiles,
  loadDefaultApplets,
} from "./repository";
import {
  saveDefaultContents,
  registerFilesForLazyLoad,
} from "./service";

const getEmptyFileSystemState = (): Record<string, FileSystemItem> => ({});
const STORE_VERSION = 10;
const STORE_NAME = "ryos:files";

export const useFilesStore = create<FilesStoreState>()(
  persist(
    (set, get) => ({
      items: getEmptyFileSystemState(),
      libraryState: "uninitialized",

      addItem: (itemData) => {
        const now = Date.now();
        const newItem: FileSystemItem = {
          ...itemData,
          status: "active",
          uuid: itemData.uuid || (!itemData.isDirectory ? uuidv4() : undefined),
          createdAt: itemData.createdAt || now,
          modifiedAt: itemData.modifiedAt || now,
        };
        console.log(`[FilesStore:addItem] Attempting to add:`, newItem);
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

          const existingItem = state.items[newItem.path];
          if (existingItem) {
            console.log(
              `[FilesStore] Updating existing item at path "${newItem.path}"`
            );
            const updatedItem: FileSystemItem = {
              ...existingItem,
              ...newItem,
              uuid: existingItem.uuid || newItem.uuid,
              createdAt: existingItem.createdAt || newItem.createdAt,
              modifiedAt: newItem.modifiedAt || now,
              shareId: newItem.shareId ?? existingItem.shareId,
              createdBy: newItem.createdBy ?? existingItem.createdBy,
              storeCreatedAt: newItem.storeCreatedAt ?? existingItem.storeCreatedAt,
            };

            return {
              items: { ...state.items, [newItem.path]: updatedItem },
              libraryState: "loaded",
            };
          }

          const updatedItems = { ...state.items, [newItem.path]: newItem };

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
          );
          return { items: updatedItems, libraryState: "loaded" };
        });
      },

      removeItem: (path, permanent = false) => {
        set((state) => {
          const itemToRemove = state.items[path];
          if (!itemToRemove) {
            console.warn(
              `[FilesStore] Cannot remove item. Path "${path}" does not exist.`
            );
            return state;
          }

          const newItems = { ...state.items };
          const itemsToDelete = [path];

          if (itemToRemove.isDirectory) {
            Object.keys(newItems).forEach((itemPath) => {
              if (itemPath.startsWith(path + "/")) {
                itemsToDelete.push(itemPath);
              }
            });
          }

          const isPermanentDelete =
            permanent || itemToRemove.status === "trashed";

          itemsToDelete.forEach((p) => {
            const currentItem = newItems[p];
            if (!currentItem) return;

            if (isPermanentDelete) {
              delete newItems[p];
            } else if (currentItem.status === "active") {
              newItems[p] = {
                ...currentItem,
                status: "trashed",
                originalPath: p,
                deletedAt: Date.now(),
              };
            }
          });

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
          get().removeItem(item.path, true);
          if (!item.isDirectory && item.uuid) {
            contentUUIDsToDelete.push(item.uuid);
          }
        });
        return contentUUIDsToDelete;
      },

      renameItem: (oldPath, newPath, newName) => {
        set((state) => {
          const itemToRename = state.items[oldPath];
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
          delete newItems[oldPath];

          const updatedItem = { ...itemToRename, path: newPath, name: newName };
          newItems[newPath] = updatedItem;

          if (itemToRename.isDirectory) {
            Object.keys(state.items).forEach((itemPath) => {
              if (itemPath.startsWith(oldPath + "/")) {
                const relativePath = itemPath.substring(oldPath.length);
                const childNewPath = newPath + relativePath;
                const childItem = state.items[itemPath];
                delete newItems[itemPath];
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

          delete newItems[sourcePath];

          const movedItem = { ...sourceItem, path: destinationPath };
          newItems[destinationPath] = movedItem;

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
        const currentItems = get().items;
        ensurePathQueryCache(currentItems);
        return selectGetItemsInPath(path);
      },

      getItem: (path) => selectGetItem(get().items, path),

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
        const currentItems = get().items;
        ensurePathQueryCache(currentItems);
        return selectGetTrashItems();
      },

      createAlias: (targetPath, aliasName, aliasType, targetAppId) => {
        set((state) => {
          if (!state.items["/Desktop"] || !state.items["/Desktop"].isDirectory) {
            console.warn(
              "[FilesStore] Cannot create alias. /Desktop directory does not exist."
            );
            return state;
          }

          const newItems: Record<string, FileSystemItem> = { ...state.items };

          let originalItem: FileSystemItem | undefined;
          let icon: string | undefined;
          let name: string = aliasName;

          if (aliasType === "app" && targetAppId) {
            icon = undefined;
          } else {
            originalItem = state.items[targetPath];
            if (originalItem) {
              icon = originalItem.icon;
              if (!aliasName || aliasName === originalItem.name) {
                name = originalItem.name;
              }
            } else {
              icon = "/icons/default/file.png";
            }
          }

          const aliasPath = `/Desktop/${name}`;
          let finalAliasPath = aliasPath;
          let counter = 1;

          const isActiveAtPath = (p: string): boolean => {
            const existing = newItems[p];
            return !!existing && existing.status === "active";
          };

          const existingAtAliasPath = newItems[aliasPath];
          if (existingAtAliasPath && existingAtAliasPath.status === "trashed") {
            delete newItems[aliasPath];
          }

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

        data.directories.forEach((dir) => {
          newItems[dir.path] = {
            ...dir,
            status: "active",
            createdAt: now,
            modifiedAt: now,
          };
        });

        data.files.forEach((file) => {
          newItems[file.path] = {
            ...file,
            status: "active",
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
        if (current.libraryState === "uninitialized") {
          const data = await loadDefaultFiles();
          const appletsData = await loadDefaultApplets();
          const newItems: Record<string, FileSystemItem> = {};
          const now = Date.now();

          data.directories.forEach((dir) => {
            newItems[dir.path] = {
              ...dir,
              status: "active",
              createdAt: now,
              modifiedAt: now,
            };
          });

          data.files.forEach((file) => {
            newItems[file.path] = {
              ...file,
              status: "active",
              uuid: uuidv4(),
              createdAt: now,
              modifiedAt: now,
            };
          });

          appletsData.applets.forEach((applet) => {
            newItems[applet.path] = {
              ...applet,
              status: "active",
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
          await saveDefaultContents(appletsData.applets, newItems);

          await get().ensureDefaultDesktopShortcuts();
        }
      },

      syncRootDirectoriesFromDefaults: async () => {
        try {
          const data = await loadDefaultFiles();
          const now = Date.now();
          set((state) => {
            const newItems = { ...state.items };
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

          const apps = getAppBasicInfoList().filter(
            (app) => app.id !== "finder" && app.id !== "control-panels"
          );

          const shortcutsToCreate: Array<{
            appId: string;
            appName: string;
            hiddenOnThemes: string[];
          }> = [];

          for (const app of apps) {
            const appId = app.id;

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
              shortcutsToCreate.push({
                appId,
                appName: app.name,
                hiddenOnThemes: appId !== "ipod" && appId !== "applet-viewer" ? ["macosx"] : [],
              });
            }
          }

          if (shortcutsToCreate.length > 0) {
            set((currentState) => {
              const newItems = { ...currentState.items };
              const now = Date.now();

              for (const shortcut of shortcutsToCreate) {
                const aliasPath = `/Desktop/${shortcut.appName}`;
                let finalAliasPath = aliasPath;
                let counter = 1;

                while (newItems[finalAliasPath] && newItems[finalAliasPath].status === "active") {
                  finalAliasPath = `/Desktop/${shortcut.appName} ${counter}`;
                  counter++;
                }

                const aliasItem: FileSystemItem = {
                  path: finalAliasPath,
                  name: finalAliasPath.split("/").pop() || shortcut.appName,
                  isDirectory: false,
                  icon: undefined,
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
        items: state.items,
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
              status: oldItem.status || "active",
              uuid:
                !oldItem.isDirectory && !oldItem.uuid ? uuidv4() : oldItem.uuid,
            };
          }
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
              size: oldItem.size || undefined,
            };
          }

          return {
            items: newState,
            libraryState: oldState.libraryState || "loaded",
          };
        }

        if (version < 8) {
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
            Promise.resolve(state.initializeLibrary()).catch((err) =>
              console.error("Files initialization failed on rehydrate", err)
            );
          } else {
            Promise.all([
              loadDefaultFiles().then((data) => {
                registerFilesForLazyLoad(data.files, state.items);
              }),
              state.syncRootDirectoriesFromDefaults().then(() => {
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
