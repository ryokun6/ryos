import { transitionVfsFiles } from "@/services/vfs/FileLifecycleTransaction";
import { saveVfsFile } from "@/services/vfs/FileSaveTransaction";
import { useState, useEffect, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { ensureIndexedDBInitialized, STORES, dbOperations } from "@/utils/indexedDB";
import { getNonFinderApps, AppId, getAppIconPath } from "@/config/appRegistry";
import { useIsRyoAdmin } from "@/hooks/useIsRyoAdmin";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import {
  useInternetExplorerStore,
  type Favorite,
} from "@/stores/useInternetExplorerStore";
import { useFilesStore, FileSystemItem, ensureFileContentLoaded } from "@/stores/useFilesStore";
import { useTextEditStore } from "@/stores/useTextEditStore";
import { useAppStore, type LaunchOriginRect } from "@/stores/useAppStore";
import { useFinderStore } from "@/stores/useFinderStore";
import { useFilesStoreShallow } from "@/stores/useFilesStore";
import { useIpodStoreShallow } from "@/stores/useIpodStore";
import { useVideoStoreShallow } from "@/stores/useVideoStore";
import { listVirtualMusicOrVideosPath } from "@/services/vfs/virtualTrees";
import { abortableFetch } from "@/utils/abortableFetch";
import { getStoreForFile, type StoredContent } from "@/utils/indexedDBOperations";
import { isWritablePath } from "@/services/vfs/pathPolicy";
import {
  emitCloudSyncDomainChange,
  emitCloudSyncDomainChanges,
  getCloudSyncContentKey,
} from "@/utils/cloudSyncEvents";
import type { SyncNamespace } from "@/shared/sync2/namespaces";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { FINDER_ANALYTICS, track } from "@/utils/analytics";
import { createClientLogger } from "@/utils/logger";
import { getDefaultFileApp } from "@/utils/fileAssociations";
import {
  ExtendedDisplayFileItem,
  getParentPath,
  getFinderAnalyticsPathInfo,
  getFinderSizeBucket,
  arePathArraysEqual,
  getCloudSyncDomainForContentStore,
  getCloudSyncDeletionBucketForContentStore,
  getFileTypeFromExtension,
  BOOK_FILE_ICON_PATH,
  isEpubFile,
  resolveFinderSelectionSnapshot,
} from "../utils/fileSystemHelpers";

const log = createClientLogger("FileSystem");

// Interface for content stored in IndexedDB. The persisted shape is the shared
// StoredContent ({ name, content }); contentUrl is a runtime-only Blob URL.
export interface DocumentContent extends StoredContent {
  contentUrl?: string; // URL for Blob content (managed temporarily)
}

const emitCloudSyncContentChange = (
  namespace: SyncNamespace,
  localKey: string
) => {
  const syncKey = getCloudSyncContentKey(namespace, localKey);
  emitCloudSyncDomainChange(namespace, syncKey ? [syncKey] : undefined);
};

const trackFinderFileOperation = (
  eventName: string,
  path: string,
  type?: string,
  extra?: Record<string, string | number | boolean | null | undefined>
) => {
  track(eventName, {
    appId: "finder",
    ...getFinderAnalyticsPathInfo(path, type),
    ...extra,
  });
};

const getIndexedDbStoreKeys = async (storeName: string): Promise<string[]> => {
  const db = await ensureIndexedDBInitialized();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const request = store.getAllKeys();
      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
};

// --- Helper Functions --- //

// Get icon based on FileSystemItem metadata
function getFileIcon(item: FileSystemItem): string {
  // Handle aliases/shortcuts first
  if (item.aliasType && item.aliasTarget) {
    if (item.aliasType === "app") {
      // For app aliases, resolve icon from app registry
      try {
        const iconPath = getAppIconPath(item.aliasTarget as AppId);
        if (iconPath) {
          return iconPath;
        }
      } catch (err) {
        console.warn(`[getFileIcon] Failed to resolve icon for app alias ${item.aliasTarget}:`, err);
      }
      return "/icons/default/application.png";
    } else if (item.aliasType === "file") {
      // For file aliases, resolve icon from target file
      const fileStore = useFilesStore.getState();
      const targetFile = fileStore.getItem(item.aliasTarget);
      if (targetFile) {
        // Recursively get icon for target (in case target is also an alias)
        return getFileIcon(targetFile);
      }
      return "/icons/default/file.png";
    }
  }

  if (isEpubFile(item.name, item.type)) {
    return BOOK_FILE_ICON_PATH;
  }

  // Use stored icon if available (but only if not an alias, since aliases should resolve)
  if (item.icon && item.icon.trim() !== "") {
    return item.icon;
  }

  if (item.isDirectory) {
    // Special handling for Trash icon based on content
    if (item.path === "/Trash") {
      // We need a way to know if trash is empty. We'll use local state for now.
      // This will be updated when trashItems state changes.
      return "/icons/trash-empty.png"; // Placeholder, will be updated by effect
    }
    return "/icons/directory.png";
  }

  switch (item.type) {
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "bmp":
    case "svg":
      return "/icons/image.png";
    case "pdf":
      return "/icons/default/file-pdf.png";
    case "markdown":
    case "text":
      return "/icons/file-text.png";
    case "application": // Should ideally use item.icon from registry
      return item.icon || "/icons/file.png"; // Use item.icon if available
    case "Music":
      return "/icons/sound.png";
    case "Video":
      return "/icons/video-tape.png";
    case "site-link":
      return "/icons/site.png";
    default:
      return "/icons/file.png";
  }
}

const loggedInitializationPaths = new Set<string>();

// --- useFileSystem Hook --- //
export interface UseFileSystemOptions {
  /**
   * If true, the hook will skip the expensive loadFiles effect on mount.
   * Useful for components that only need helpers like `saveFile` without
   * reading the file system (e.g. Chats transcript saving).
   */
  skipLoad?: boolean;
  /**
   * Instance ID for multi-window support
   */
  instanceId?: string;
}

export function useFileSystem(
  initialPath: string = "/",
  options: UseFileSystemOptions = {}
) {
  const { instanceId } = options;

  // --------------------------------------------
  // Development-time logging (deduplicated)
  // --------------------------------------------
  if (
    import.meta.env?.MODE === "development" &&
    !loggedInitializationPaths.has(initialPath)
  ) {
    log.debug("Hook initialized", { path: initialPath });
    loggedInitializationPaths.add(initialPath);
  }

  // Finder store selectors
  const finderInstances = useFinderStore((state) => state.instances);
  const updateFinderInstance = useFinderStore((state) => state.updateInstance);
  const getViewTypeForPath = useFinderStore(
    (state) => state.getViewTypeForPath
  );
  
  const isAdmin = useIsRyoAdmin();
  const { currentTheme, isWindowsTheme } = useThemeFlags();
  const finderInstance = instanceId ? finderInstances[instanceId] : null;

  // Use instance-based state if available, otherwise use local state
  // When using instances, initialize local state from instance data if available
  const [localCurrentPath, setLocalCurrentPath] = useState(
    finderInstance?.currentPath || initialPath
  );
  const [localHistory, setLocalHistory] = useState<string[]>(
    finderInstance?.navigationHistory || [initialPath]
  );
  const [localHistoryIndex, setLocalHistoryIndex] = useState(
    finderInstance?.navigationIndex || 0
  );
  const [localSelectedFiles, setLocalSelectedFiles] = useState<string[]>(
    finderInstance?.selectedFiles ||
      (finderInstance?.selectedFile ? [finderInstance.selectedFile] : [])
  );
  const [localSelectionAnchorPath, setLocalSelectionAnchorPath] = useState<
    string | null
  >(finderInstance?.selectionAnchorPath || finderInstance?.selectedFile || null);
  const [localSelectedFilePath, setLocalSelectedFilePath] = useState<
    string | null
  >(finderInstance?.selectedFile || null);
  const [selectedFile, setSelectedFile] = useState<ExtendedDisplayFileItem>();

  // Determine which state to use
  const currentPath = finderInstance?.currentPath || localCurrentPath;
  const history = finderInstance?.navigationHistory || localHistory;
  const historyIndex = finderInstance?.navigationIndex || localHistoryIndex;
  const {
    selectedFile: selectedFilePath,
    selectedFiles,
    selectionAnchorPath,
  } = resolveFinderSelectionSnapshot(finderInstance, {
    selectedFile: localSelectedFilePath,
    selectedFiles: localSelectedFiles,
    selectionAnchorPath: localSelectionAnchorPath,
  });

  // State setters that work with both instance and local mode
  const setCurrentPath = useCallback(
    (path: string) => {
      if (instanceId && finderInstance) {
        const nextViewType = getViewTypeForPath(path);
        updateFinderInstance(instanceId, {
          currentPath: path,
          viewType: nextViewType,
        });
      } else {
        setLocalCurrentPath(path);
      }
    },
    [instanceId, finderInstance, updateFinderInstance, getViewTypeForPath]
  );

  const setHistory = useCallback(
    (updater: string[] | ((prev: string[]) => string[])) => {
      if (instanceId && finderInstance) {
        const newHistory =
          typeof updater === "function"
            ? updater(finderInstance.navigationHistory)
            : updater;
        updateFinderInstance(instanceId, { navigationHistory: newHistory });
      } else {
        setLocalHistory(updater);
      }
    },
    [instanceId, finderInstance, updateFinderInstance]
  );

  const setHistoryIndex = useCallback(
    (updater: number | ((prev: number) => number)) => {
      if (instanceId && finderInstance) {
        const newIndex =
          typeof updater === "function"
            ? updater(finderInstance.navigationIndex)
            : updater;
        updateFinderInstance(instanceId, { navigationIndex: newIndex });
      } else {
        setLocalHistoryIndex(updater);
      }
    },
    [instanceId, finderInstance, updateFinderInstance]
  );

  const syncSelectionState = useCallback(
    (
      primaryPath: string | null,
      paths: string[],
      anchorPath: string | null
    ) => {
      if (instanceId && finderInstance) {
        updateFinderInstance(instanceId, {
          selectedFile: primaryPath,
          selectedFiles: paths,
          selectionAnchorPath: anchorPath,
        });
      } else {
        setLocalSelectedFilePath(primaryPath);
        setLocalSelectedFiles(paths);
        setLocalSelectionAnchorPath(anchorPath);
      }
    },
    [instanceId, finderInstance, updateFinderInstance]
  );

  // Local UI state (not persisted to store)
  const [files, setFiles] = useState<ExtendedDisplayFileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const objectUrlsRef = useRef<Set<string>>(new Set());

  // Files store selectors (avoid broad store subscriptions)
  const {
    getItem: getFileItem,
    getItemsInPath,
    updateItemMetadata,
    addItem: addFileItem,
    reset: resetFilesStore,
  } = useFilesStoreShallow((state) => ({
    getItem: state.getItem,
    getItemsInPath: state.getItemsInPath,
    updateItemMetadata: state.updateItemMetadata,
    addItem: state.addItem,
    reset: state.reset,
  }));
  const launchApp = useLaunchApp();
  const {
    tracks: ipodTracks,
    setLibrarySource: setIpodLibrarySource,
    setCurrentSongId: setIpodSongId,
    setIsPlaying: setIpodPlaying,
  } = useIpodStoreShallow((state) => ({
    tracks: state.tracks,
    setLibrarySource: state.setLibrarySource,
    setCurrentSongId: state.setCurrentSongId,
    setIsPlaying: state.setIsPlaying,
  }));
  const {
    videos: videoTracks,
    setCurrentVideoId: setVideoIndex,
    setIsPlaying: setVideoPlaying,
  } = useVideoStoreShallow((state) => ({
    videos: state.videos,
    setCurrentVideoId: state.setCurrentVideoId,
    setIsPlaying: state.setIsPlaying,
  }));
  const internetExplorerFavorites = useInternetExplorerStore(
    (state) => state.favorites
  );

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
    };
  }, []);

  // --- Lazy Default Content Loader (uses cached filesystem data) --- //
  const ensureDefaultContent = useCallback(
    async (filePath: string, uuid: string): Promise<boolean> => {
      // Use the centralized lazy loader which has cached JSON data
      return ensureFileContentLoaded(filePath, uuid);
    },
    []
  );

  const fetchAppletContentFromShare = useCallback(
    async (
      filePath: string,
      fileMetadata: FileSystemItem
    ): Promise<string | null> => {
      const { shareId, uuid, name } = fileMetadata;
      if (!shareId || !uuid) {
        console.warn(
          `[useFileSystem] Cannot fetch applet content for ${filePath}: missing shareId or uuid`
        );
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

        const data = await response.json();
        const content =
          typeof data.content === "string" ? data.content : "";

        await dbOperations.put<DocumentContent>(
          STORES.APPLETS,
          {
            name: name || filePath.split("/").pop() || shareId,
            content,
          },
          uuid
        );
        emitCloudSyncContentChange("applets", uuid);

        const metadataUpdates: Partial<FileSystemItem> = {};

        if (typeof data.icon === "string" && data.icon !== fileMetadata.icon) {
          metadataUpdates.icon = data.icon;
        }
        if (
          typeof data.createdBy === "string" &&
          data.createdBy !== fileMetadata.createdBy
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
          updateItemMetadata(filePath, metadataUpdates);
        }

        return content;
      } catch (error) {
        console.error(
          `[useFileSystem] Error fetching shared applet content for ${shareId}:`,
          error
        );
        return null;
      }
    },
    [updateItemMetadata]
  );

  // --- REORDERED useCallback DEFINITIONS --- //

  // Define navigateToPath first
  const navigateToPath = useCallback(
    (path: string) => {
      const normalizedPath = path.startsWith("/") ? path : `/${path}`;
      setSelectedFile(undefined);
      syncSelectionState(null, [], null);
      if (normalizedPath !== currentPath) {
        setHistory((prev) => {
          const newHistory = prev.slice(0, historyIndex + 1);
          newHistory.push(normalizedPath);
          return newHistory;
        });
        setHistoryIndex((prev) => prev + 1);
        setCurrentPath(normalizedPath);
      }
    },
    [
      currentPath,
      historyIndex,
      syncSelectionState,
      setHistory,
      setHistoryIndex,
      setCurrentPath,
    ]
  );

  // Define loadFiles next
  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);

    try {
      let displayFiles: ExtendedDisplayFileItem[] = [];
      const nextObjectUrls = new Set<string>();

      // 1. Handle Virtual Directories
      if (currentPath === "/Applications") {
        displayFiles = getNonFinderApps(isAdmin).map((app) => ({
          name: app.name,
          isDirectory: false,
          path: `/Applications/${app.name}`,
          icon: app.icon,
          appId: app.id,
          type: "application",
        }));
      } else {
        const virtualMedia = listVirtualMusicOrVideosPath(
          currentPath,
          ipodTracks,
          videoTracks
        );
        if (virtualMedia) {
          displayFiles = virtualMedia.items;
        } else if (currentPath.startsWith("/Sites")) {
        log.debug("Loading Sites path", { currentPath });
        const pathParts = currentPath.split("/").filter(Boolean);
        log.debug("Sites path parts", { depth: pathParts.length, pathParts });
        let currentLevelFavorites = internetExplorerFavorites;
        let currentVirtualPath = "/Sites";

        // Traverse down the favorites structure based on the path
        for (let i = 1; i < pathParts.length; i++) {
          const folderName = decodeURIComponent(pathParts[i]);
          log.debug("Traversing Sites folder", { folderName });
          const parentFolder = currentLevelFavorites.find(
            (fav) => fav.isDirectory && fav.title === folderName
          );
          if (parentFolder && parentFolder.children) {
            currentLevelFavorites = parentFolder.children;
            currentVirtualPath += `/${folderName}`;
            log.debug("Found Sites sub-folder", {
              childCount: currentLevelFavorites.length,
            });
          } else {
            log.debug("Sites sub-folder not found", { folderName });
            currentLevelFavorites = [];
            break;
          }
        }
        log.debug("Final Sites favorites to map", {
          favoriteCount: currentLevelFavorites.length,
        });

        // Map the current level favorites to FileItems
        displayFiles = currentLevelFavorites.map((fav: Favorite) => {
          const isDirectory = fav.isDirectory ?? false;
          const name = fav.title || (isDirectory ? "Folder" : "Link");
          const path = `${currentVirtualPath}/${encodeURIComponent(name)}`;
          return {
            name: name,
            isDirectory: isDirectory,
            path: path,
            icon: isDirectory
              ? "/icons/directory.png"
              : fav.favicon || "/icons/site.png",
            appId: isDirectory ? undefined : "internet-explorer",
            type: isDirectory ? "directory-virtual" : "site-link",
            data: isDirectory
              ? undefined
              : { url: fav.url, year: fav.year || "current" },
          };
        });
        log.debug("Mapped Sites display files", {
          displayFileCount: displayFiles.length,
        });
        } else if (currentPath === "/Trash") {
      // 2. Handle Trash Directory (Uses fileStore)
        // Get metadata from the store
        const itemsMetadata = getItemsInPath(currentPath);
        displayFiles = itemsMetadata.map((item) => ({
          ...item,
          icon: getFileIcon(item), // Get icon based on metadata
          modifiedAt: item.modifiedAt ? new Date(item.modifiedAt) : undefined,
        }));
        }
      // 3. Handle Real Directories (Uses useFilesStore)
      else {
        const itemsMetadata = getItemsInPath(currentPath).filter(
          (item) =>
            currentPath !== "/Desktop" ||
            !item.hiddenOnThemes?.includes(currentTheme)
        );
        const visibleItemsMetadata =
          currentPath === "/Desktop"
            ? [
                {
                  path: "/",
                  name: "Macintosh HD",
                  isDirectory: true,
                  icon:
                    isWindowsTheme
                      ? "/icons/default/pc.png"
                      : "/icons/default/disk.png",
                  type: "directory",
                  status: "active" as const,
                },
                ...itemsMetadata,
              ]
            : itemsMetadata;
        // Map metadata to display items. Content fetching happens on open.
        displayFiles = visibleItemsMetadata.map((item) => ({
          ...item,
          icon: getFileIcon(item),
          appId: item.appId,
          modifiedAt: item.modifiedAt ? new Date(item.modifiedAt) : undefined,
        }));

        // --- START EDIT: Fetch content URLs for image files (any writable path) ---
        const resolvesToImagesStore = (item: FileSystemItem) =>
          !item.isDirectory &&
          getStoreForFile(item.path, item) === STORES.IMAGES;
        if (itemsMetadata.some(resolvesToImagesStore)) {
          displayFiles = await Promise.all(
            itemsMetadata.map(async (item) => {
              let contentUrl: string | undefined;
              if (!item.isDirectory && item.uuid && resolvesToImagesStore(item)) {
                try {
                  log.debug("Fetching image content for display", {
                    name: item.name,
                    uuid: item.uuid,
                    type: item.type,
                  });
                  const contentData = await dbOperations.get<DocumentContent>(
                    STORES.IMAGES,
                    item.uuid // Use UUID instead of name
                  );

                  if (contentData?.content instanceof Blob) {
                    log.debug("Found Blob content for display", {
                      name: item.name,
                    });
                    contentUrl = URL.createObjectURL(contentData.content);
                    nextObjectUrls.add(contentUrl);
                    log.debug("Created runtime content URL", {
                      name: item.name,
                      hasContentUrl: Boolean(contentUrl),
                    });
                  } else {
                    log.debug("No Blob content found for display", {
                      name: item.name,
                      uuid: item.uuid,
                    });
                  }
                } catch (err) {
                  console.error(
                    `Error fetching image content for ${item.name} (UUID: ${item.uuid}):`,
                    err
                  );
                }
              }

              // Ensure the item type is properly set for image files
              const fileExt = item.name.split(".").pop()?.toLowerCase();
              const isImageFile = [
                "png",
                "jpg",
                "jpeg",
                "gif",
                "webp",
                "bmp",
              ].includes(fileExt || "");
              const type = isImageFile ? fileExt || item.type : item.type;

              return {
                ...item,
                icon: getFileIcon(item),
                appId: item.appId,
                contentUrl: contentUrl,
                type: type, // Ensure type is correctly set
                modifiedAt: item.modifiedAt
                  ? new Date(item.modifiedAt)
                  : undefined,
              };
            })
          );
        }
        // --- END EDIT ---
      }
      }

      // Favorites (Virtual). The legacy flat "/Music Library" and
      // "/Video Library" paths were removed in favor of the artist-tree
      // "/Music" and "/Videos" virtual folders (listVirtualMusicOrVideosPath).
      if (currentPath === "/Favorites") {
        displayFiles = internetExplorerFavorites.map((favorite) => ({
          name: `${favorite.title}.webloc`,
          isDirectory: false,
          path: `/Favorites/${favorite.title}.webloc`,
          type: "site-link",
          data: favorite,
          icon: "/icons/file-internet.png",
          modifiedAt: undefined, // Virtual files don't have timestamps
        }));
      }

      // Revoke stale object URLs from previous runs before replacing file list.
      objectUrlsRef.current.forEach((previousUrl) => {
        if (!nextObjectUrls.has(previousUrl)) {
          URL.revokeObjectURL(previousUrl);
        }
      });
      objectUrlsRef.current = nextObjectUrls;

      setFiles(displayFiles);
    } catch (err) {
      console.error("[useFileSystem] Error loading files:", err);
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setIsLoading(false);
    }
    // Add fileStore dependency to re-run if items change
  }, [
    currentPath,
    currentTheme,
    getItemsInPath,
    ipodTracks,
    videoTracks,
    internetExplorerFavorites,
    isAdmin,
  ]);

  // Define handleFileOpen
  const handleFileOpen = useCallback(
    async (
      file: ExtendedDisplayFileItem,
      launchOrigin?: LaunchOriginRect,
      requestedAppId?: AppId,
    ) => {
      // 0. Handle Aliases/Shortcuts first - resolve to target before processing
      // Handle nested aliases by resolving until we get to the actual target
      let currentFile = file;
      let resolved = false;
      const visitedPaths = new Set<string>();
      const maxDepth = 10; // Prevent infinite loops from circular aliases
      let depth = 0;
      
      while (!resolved && depth < maxDepth) {
        depth++;
          const fileMetadata = getFileItem(currentFile.path);
        if (fileMetadata?.aliasType && fileMetadata?.aliasTarget) {
          // Check for circular references
          if (visitedPaths.has(currentFile.path)) {
            console.warn(`[useFileSystem] Circular alias detected at ${currentFile.path}`);
            return;
          }
          visitedPaths.add(currentFile.path);
          
          if (fileMetadata.aliasType === "app") {
            // Launch app directly
            const appId = fileMetadata.aliasTarget as AppId;
            track(FINDER_ANALYTICS.FILE_OPEN, {
              appId: "finder",
              targetAppId: appId,
              sourceType: "alias",
              ...getFinderAnalyticsPathInfo(currentFile.path, currentFile.type),
            });
            launchApp(appId, { launchOrigin });
            return;
          } else {
            // Open file/applet - need to resolve the original file
            const targetPath = fileMetadata.aliasTarget;
            const targetFile = getFileItem(targetPath);
            
            if (!targetFile) {
              console.warn(`[useFileSystem] Target file not found: ${targetPath}`);
              return;
            }

            // Replace currentFile with target file and check if it's also an alias
            currentFile = {
              ...targetFile,
              icon: getFileIcon(targetFile),
              modifiedAt: targetFile.modifiedAt ? new Date(targetFile.modifiedAt) : undefined,
            } as ExtendedDisplayFileItem;
            // Continue loop to check if target is also an alias
          }
        } else {
          // Not an alias, use this file
          resolved = true;
        }
      }
      
      if (depth >= maxDepth) {
        console.warn(`[useFileSystem] Maximum alias resolution depth reached for ${file.path}`);
        return;
      }
      
      // Use the resolved file for the rest of the function
      file = currentFile;

      // 1. Handle Directories (Virtual and Real)
      if (file.isDirectory) {
        if (file.type === "directory" || file.type === "directory-virtual") {
          track(FINDER_ANALYTICS.FILE_OPEN, {
            appId: "finder",
            isDirectory: true,
            ...getFinderAnalyticsPathInfo(file.path, file.type),
          });
          navigateToPath(file.path);
        }
        return;
      }

      // 2. Handle Files (Fetch content if needed)
      let contentToUse: string | Blob | ArrayBuffer | undefined = undefined;
      const contentUrlToUse: string | undefined = undefined;
      let contentAsString: string | undefined = undefined;

      try {
        // Fetch content from IndexedDB (Documents, Images, or Applets)
        const storeName = getStoreForFile(file.path, getFileItem(file.path) ?? file);
        track(FINDER_ANALYTICS.FILE_OPEN, {
          appId: "finder",
          isDirectory: false,
          targetAppId: file.appId || undefined,
          ...getFinderAnalyticsPathInfo(file.path, file.type),
        });
        if (storeName) {
          // Get the file metadata to get the UUID
          const fileMetadata = getFileItem(file.path);
          if (fileMetadata?.uuid) {
            const contentData = await dbOperations.get<DocumentContent>(
              storeName,
              fileMetadata.uuid // Use UUID instead of name
            );
            log.debug("Fetched file content metadata", {
              path: file.path,
              hasContent: contentData?.content != null,
              contentType:
                contentData?.content instanceof Blob
                  ? "blob"
                  : typeof contentData?.content,
            });
            if (contentData) {
              contentToUse = contentData.content;
            } else {
              console.warn(
                `[useFileSystem] Content not found in IndexedDB for ${file.path} (UUID: ${fileMetadata.uuid})`
              );
              // For applets, fetch content from the share service on first load
              if (storeName === STORES.APPLETS) {
                const fetchedContent = await fetchAppletContentFromShare(
                  file.path,
                  fileMetadata
                );
                contentToUse = fetchedContent ?? "";
              } else {
                // Try to load default content lazily for Documents/Images
                const hasDefaultContent = await ensureDefaultContent(
                  file.path,
                  fileMetadata.uuid
                );
                if (hasDefaultContent) {
                  // Try fetching again after loading default content
                  const retryData = await dbOperations.get<DocumentContent>(
                    storeName,
                    fileMetadata.uuid
                  );
                  if (retryData) {
                    contentToUse = retryData.content;
                    log.debug("Loaded default content fallback", {
                      path: file.path,
                    });
                  }
                }
              }
            }
          } else {
            console.warn(
              `[useFileSystem] No UUID found for file ${file.path}, cannot fetch content`
            );
          }
        }

        // Process content: Read blob to string for TextEdit and Applets, create URL for Paint
        if (contentToUse instanceof ArrayBuffer) {
          contentToUse = new Blob([contentToUse], {
            type: storeName === STORES.BOOKS ? "application/epub+zip" : undefined,
          });
        }

        if (contentToUse instanceof Blob) {
          if (
            storeName === STORES.DOCUMENTS ||
            storeName === STORES.APPLETS
          ) {
            contentAsString = await contentToUse.text();
            log.debug("Read Blob as text", {
              name: file.name,
              contentLength: contentAsString?.length ?? 0,
            });
          } else if (storeName === STORES.IMAGES) {
            // Don't create URL here, pass the Blob itself
            // contentUrlToUse = URL.createObjectURL(contentToUse);
            // Avoid logging Blob URLs; they are runtime-only and user-content-derived.
          }
        } else if (typeof contentToUse === "string") {
          contentAsString = contentToUse;
          log.debug("Using string content directly", {
            name: file.name,
            contentLength: contentAsString?.length ?? 0,
          });
        }

        // 3. Launch Appropriate App
        log.debug("Preparing app launch data", {
          path: file.path,
          hasTextContent: Boolean(contentAsString),
          contentLength: contentAsString?.length ?? 0,
          hasContentUrl: Boolean(contentUrlToUse),
        });
        const associatedAppId =
          requestedAppId ??
          getDefaultFileApp({
            path: file.path,
            name: file.name,
            type: file.type,
            isDirectory: file.isDirectory,
          });

        if (file.path.startsWith("/Applications/") && file.appId) {
          launchApp(file.appId as AppId, { launchOrigin });
        } else if (associatedAppId === "preview") {
          launchApp("preview", {
            initialData: {
              path: file.path,
              content: contentToUse,
            },
            launchOrigin,
          });
        } else if (associatedAppId === "textedit") {
          // Check if this file is already open in a TextEdit instance
          const textEditStore = useTextEditStore.getState();
          const existingInstanceId = textEditStore.getInstanceIdByPath(
            file.path
          );

          if (existingInstanceId) {
            // Verify the instance actually exists in AppStore
            const appStore = useAppStore.getState();
            const instanceExists = !!appStore.instances[existingInstanceId];

            if (instanceExists) {
              // File is already open - bring that window to foreground
              log.debug("TextEdit file already open; bringing to foreground", {
                path: file.path,
                instanceId: existingInstanceId,
              });
              appStore.bringInstanceToForeground(existingInstanceId);
            } else {
              // Stale instance reference - clean it up and open new instance
              log.debug("Removing stale TextEdit instance", {
                path: file.path,
                instanceId: existingInstanceId,
              });
              textEditStore.removeInstance(existingInstanceId);
              launchApp("textedit", {
                initialData: { path: file.path, content: contentAsString ?? "" },
                launchOrigin,
              });
            }
          } else {
            // File not open - launch new TextEdit instance
            launchApp("textedit", {
              initialData: { path: file.path, content: contentAsString ?? "" },
              launchOrigin,
            });
          }
        } else if (associatedAppId === "paint") {
          // Pass the Blob object itself to Paint via initialData
          launchApp("paint", {
            initialData: {
              path: file.path,
              content: contentToUse instanceof Blob ? contentToUse : undefined,
            },
            launchOrigin,
          }); // Pass contentToUse (Blob)
        } else if (associatedAppId === "books") {
          // Books app loads the EPUB blob itself from the VFS path
          launchApp("books", {
            initialData: { path: file.path },
            launchOrigin,
          });
        } else if (associatedAppId === "applet-viewer") {
          // Open HTML applets with applet-viewer
          log.debug("Opening applet", {
            path: file.path,
            contentLength: contentAsString?.length || 0,
            hasContent: !!contentAsString,
          });

          // Launch applet viewer - duplicate detection is handled by useLaunchApp
          try {
            launchApp("applet-viewer", {
              initialData: {
                path: file.path,
                content: contentAsString ?? "",
              },
              launchOrigin,
            });
          } catch (e) {
            console.warn(
              "[useFileSystem] Failed opening applet:",
              e
            );
          }
        } else if (file.appId === "ipod" && file.data?.songId) {
          // Finder's /Music tree contains the YouTube-backed music library,
          // so switch away from Apple Music before selecting the VFS item.
          setIpodLibrarySource("youtube");
          setIpodSongId(file.data.songId);
          setIpodPlaying(true);
          launchApp("ipod", { launchOrigin });
        } else if (file.appId === "videos" && file.data?.videoId) {
          // Videos uses video ID directly
          setVideoIndex(file.data.videoId);
          setVideoPlaying(true);
          launchApp("videos", { launchOrigin });
        } else if (file.type === "site-link" && file.data?.url) {
          // Pass url and year via initialData instead of using IE store directly
          launchApp("internet-explorer", {
            initialData: {
              url: file.data.url,
              year: file.data.year || "current",
            },
            launchOrigin,
          });
          // internetExplorerStore.setPendingNavigation(file.data.url, file.data.year || "current");
        } else {
          console.warn(
            `[useFileSystem] No handler defined for opening file type: ${file.type} at path: ${file.path}`
          );
        }
      } catch (err) {
        console.error(`[useFileSystem] Error opening file ${file.path}:`, err);
        setError(`Failed to open ${file.name}`);
      }
    },
    [
      launchApp,
      navigateToPath,
      setIpodLibrarySource,
      setIpodSongId,
      setIpodPlaying,
      setVideoIndex,
      setVideoPlaying,
      ensureDefaultContent,
      fetchAppletContentFromShare,
      getFileItem,
    ]
  );

  // Load files whenever dependencies change
  useEffect(() => {
    if (!options.skipLoad) {
      loadFiles();
    }
  }, [loadFiles, options.skipLoad]); // Depend only on the memoized loadFiles

  // Re-run loadFiles when the file store's items change (e.g., move-to-trash, restore, empty-trash).
  // The loadFiles callback depends on stable function references from the store, so it won't
  // re-create when items mutate—this subscription bridges that gap.
  useEffect(() => {
    if (options.skipLoad) return;

    const unsubscribe = useFilesStore.subscribe((state, prevState) => {
      if (state.items !== prevState.items) {
        loadFiles();
      }
    });

    return unsubscribe;
  }, [loadFiles, options.skipLoad]);

  useEffect(() => {
    if (options.skipLoad) return;

    const unsubscribe = useCloudSyncStore.subscribe((state, prevState) => {
      const nextApplied = state.categoryStatus.files.lastAppliedRemoteAt;
      const prevApplied = prevState.categoryStatus.files.lastAppliedRemoteAt;

      // Refresh writable directories so image thumbnails pick up remotely
      // synced content (blob URLs are only created during loadFiles).
      if (
        nextApplied &&
        nextApplied !== prevApplied &&
        isWritablePath(currentPath)
      ) {
        loadFiles();
      }
    });

    return unsubscribe;
  }, [currentPath, loadFiles, options.skipLoad]);

  useEffect(() => {
    const filesByPath = new Map(files.map((file) => [file.path, file]));
    const nextSelectedFiles = selectedFiles.filter((path) => filesByPath.has(path));
    const nextPrimaryPath =
      selectedFilePath && filesByPath.has(selectedFilePath)
        ? selectedFilePath
        : nextSelectedFiles[0] ?? null;
    const nextAnchorPath =
      selectionAnchorPath && filesByPath.has(selectionAnchorPath)
        ? selectionAnchorPath
        : nextPrimaryPath;
    const nextSelectedFile = nextPrimaryPath
      ? filesByPath.get(nextPrimaryPath)
      : undefined;

    if (selectedFile?.path !== nextSelectedFile?.path) {
      setSelectedFile(nextSelectedFile);
    } else if (selectedFile !== nextSelectedFile) {
      setSelectedFile(nextSelectedFile);
    }

    if (
      !arePathArraysEqual(nextSelectedFiles, selectedFiles) ||
      nextPrimaryPath !== selectedFilePath ||
      nextAnchorPath !== selectionAnchorPath
    ) {
      syncSelectionState(nextPrimaryPath, nextSelectedFiles, nextAnchorPath);
    }
  }, [
    files,
    selectedFile,
    selectedFilePath,
    selectedFiles,
    selectionAnchorPath,
    syncSelectionState,
  ]);

  // --- handleFileSelect, Navigation Functions --- //
  const handleFileSelect = useCallback(
    (
      file: ExtendedDisplayFileItem | undefined,
      options?: {
        selectedPaths?: string[];
        anchorPath?: string | null;
      }
    ) => {
      const primaryPath = file?.path || null;
      const nextSelectedFiles =
        options?.selectedPaths || (primaryPath ? [primaryPath] : []);
      const nextAnchorPath =
        options?.anchorPath !== undefined
          ? options.anchorPath
          : primaryPath;

      setSelectedFile(file);
      syncSelectionState(primaryPath, nextSelectedFiles, nextAnchorPath);
    },
    [syncSelectionState]
  );
  const navigateUp = useCallback(() => {
    if (currentPath === "/") return;
    const parentPath = getParentPath(currentPath);
    navigateToPath(parentPath); // navigateToPath is defined above
  }, [currentPath, navigateToPath]);
  const navigateBack = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setCurrentPath(history[historyIndex - 1]);
    }
  }, [history, historyIndex, setCurrentPath, setHistoryIndex]);
  const navigateForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setCurrentPath(history[historyIndex + 1]);
    }
  }, [history, historyIndex, setCurrentPath, setHistoryIndex]);
  const canNavigateBack = useCallback(() => historyIndex > 0, [historyIndex]);
  const canNavigateForward = useCallback(
    () => historyIndex < history.length - 1,
    [historyIndex, history]
  );

  // --- File Operations (Refactored) --- //

  const saveFile = useCallback(
    async (fileData: {
      path: string;
      name: string;
      content: string | Blob;
      type?: string;
      icon?: string;
      shareId?: string;
      createdBy?: string;
    }) => {
      const { path, name, content } = fileData;
      log.debug("Attempting to save file", { path });
      setError(undefined);

      const isDirectory = false;
      const fileType = fileData.type || getFileTypeFromExtension(name);

      // Check if file already exists to preserve UUID — unless the existing
      // UUID is an orphan (metadata present, IndexedDB bytes gone). Replacing
      // over an orphan UUID can never revive a cloud-tombstoned blob; mint a
      // fresh content id so the new bytes sync as a new key.
      const existingItem = getFileItem(path);
      let uuid = existingItem?.uuid;
      const storeName = getStoreForFile(path, { ...existingItem, name, type: fileType });
      let replacedOrphanUuid: string | null = null;
      if (uuid && storeName) {
        try {
          const existingContent = await dbOperations.get<DocumentContent>(
            storeName,
            uuid
          );
          if (!existingContent) {
            replacedOrphanUuid = uuid;
            uuid = uuidv4();
            log.warn("Replacing file with orphan content UUID; minting new id", {
              path,
              orphanUuid: replacedOrphanUuid,
              newUuid: uuid,
              storeName,
            });
          }
        } catch (err) {
          log.warn("Could not probe existing content before save", {
            path,
            uuid,
            error: err,
          });
        }
      }

      // 1. Create the full metadata object first
      const now = Date.now();

      // Calculate file size
      let fileSize: number;
      if (content instanceof Blob) {
        fileSize = content.size;
      } else if (typeof content === "string") {
        // Convert string to blob to get accurate byte size
        fileSize = new Blob([content]).size;
      } else {
        fileSize = 0;
      }

      const metadata: FileSystemItem = {
        path: path,
        name: name,
        isDirectory: isDirectory,
        type: fileType,
        status: "active", // Explicitly set status
        uuid: uuid || uuidv4(), // Allocate before the atomic save
        // Set timestamps
        createdAt: existingItem?.createdAt || now,
        modifiedAt: now,
        // Include file size
        size: fileSize,
        // Applet sharing metadata
        shareId: fileData.shareId || existingItem?.shareId,
        createdBy: fileData.createdBy || existingItem?.createdBy,
        // Now call getFileIcon with the complete metadata object
        icon:
          fileData.icon ||
          getFileIcon({
            path,
            name,
            isDirectory,
            type: fileType,
            status: "active",
          } as FileSystemItem),
      };

      try {
        await saveVfsFile(metadata, content);
        useCloudSyncStore.getState().clearDeletedKeys("fileMetadataPaths", [path]);
        if (storeName) {
          const deletionBucket = getCloudSyncDeletionBucketForContentStore(storeName);
          if (deletionBucket) useCloudSyncStore.getState().clearDeletedKeys(deletionBucket, [metadata.uuid!]);
          const syncDomain = getCloudSyncDomainForContentStore(storeName);
          if (syncDomain) emitCloudSyncContentChange(syncDomain, metadata.uuid!);
        }
        emitCloudSyncDomainChange("files", [`files/item:${path}`]);
        trackFinderFileOperation(FINDER_ANALYTICS.FILE_SAVE, path, fileType, {
          isUpdate: Boolean(existingItem),
          sizeBucket: getFinderSizeBucket(fileSize),
        });
      } catch (error) {
        setError(`Failed to save file ${name}`);
        // Callers must retain their unsaved state when the transaction fails.
        throw error;
      }
    },
    [getFileItem]
  );

  const moveFile = useCallback(
    async (sourceFile: FileSystemItem, targetFolderPath: string) => {
      const newPath = `${targetFolderPath === "/" ? "" : targetFolderPath}/${sourceFile.name}`;
      try {
        await transitionVfsFiles({ kind: "move", path: sourceFile.path, destination: newPath });
        trackFinderFileOperation(FINDER_ANALYTICS.FILE_MOVE, sourceFile.path, sourceFile.type, {
          targetTopLevel: targetFolderPath.split("/").filter(Boolean)[0] || "root",
        });
        setError(undefined);
        return true;
      } catch (error) {
        setError(error instanceof Error ? error.message : "Failed to move file");
        return false;
      }
    }, []
  );

  const renameFile = useCallback(
    async (oldPath: string, newName: string) => {
      const parent = getParentPath(oldPath);
      const newPath = `${parent === "/" ? "" : parent}/${newName}`;
      try {
        if (!newName || newName.includes("/")) throw new Error("Invalid file name");
        await transitionVfsFiles({ kind: "move", path: oldPath, destination: newPath });
        track(FINDER_ANALYTICS.FILE_RENAME, { appId: "finder", ...getFinderAnalyticsPathInfo(newPath) });
        setError(undefined);
        return true;
      } catch (error) {
        setError(error instanceof Error ? error.message : "Failed to rename file");
        return false;
      }
    }, []
  );

  // --- Create Folder --- //
  const createFolder = useCallback(
    (folderData: { path: string; name: string }) => {
      const { path, name } = folderData;
      if (getFileItem(path)) {
        console.error("Folder already exists:", path);
        setError("Folder already exists.");
        return;
      }
      const newFolderItem: Omit<FileSystemItem, "status"> = {
        path: path,
        name: name,
        isDirectory: true,
        type: "directory",
        icon: "/icons/directory.png",
      };
      addFileItem(newFolderItem);
      track(FINDER_ANALYTICS.FOLDER_CREATE, {
        appId: "finder",
        ...getFinderAnalyticsPathInfo(path, "directory"),
      });
      trackFinderFileOperation(FINDER_ANALYTICS.FOLDER_CREATE, path, "directory");
      setError(undefined); // Clear previous error
    },
    [getFileItem, addFileItem]
  );

  const moveToTrash = useCallback(async (file: FileSystemItem) => {
    try {
      await transitionVfsFiles({ kind: "trash", path: file.path });
      trackFinderFileOperation(FINDER_ANALYTICS.MOVE_TO_TRASH, file.path, file.type, { isDirectory: file.isDirectory });
      setError(undefined);
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to move item to trash");
      return false;
    }
  }, []);

  const restoreFromTrash = useCallback(async (file: ExtendedDisplayFileItem) => {
    try {
      await transitionVfsFiles({ kind: "restore", path: file.path });
      trackFinderFileOperation(FINDER_ANALYTICS.RESTORE_FROM_TRASH, file.path, file.type);
      setError(undefined);
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to restore item");
      return false;
    }
  }, []);

  const emptyTrash = useCallback(async () => {
    try {
      const itemCount = useFilesStore.getState().getTrashItems().length;
      await transitionVfsFiles({ kind: "emptyTrash" });
      track(FINDER_ANALYTICS.EMPTY_TRASH, { appId: "finder", itemCount });
      setError(undefined);
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to empty trash");
      return false;
    }
  }, []);

  // --- Format File System (Refactored) --- //
  const formatFileSystem = useCallback(async () => {
    try {
      const [imageKeys, trashKeys, customWallpaperKeys] = await Promise.all([
        getIndexedDbStoreKeys(STORES.IMAGES),
        getIndexedDbStoreKeys(STORES.TRASH),
        getIndexedDbStoreKeys(STORES.CUSTOM_WALLPAPERS),
      ]);
      const syncStore = useCloudSyncStore.getState();
      syncStore.markDeletedKeys("fileImageKeys", imageKeys);
      syncStore.markDeletedKeys("fileTrashKeys", trashKeys);
      syncStore.markDeletedKeys("customWallpaperKeys", customWallpaperKeys);
      await Promise.all([
        dbOperations.clear(STORES.IMAGES),
        dbOperations.clear(STORES.TRASH),
        dbOperations.clear(STORES.CUSTOM_WALLPAPERS),
      ]);
      await dbOperations.clear(STORES.DOCUMENTS);
      emitCloudSyncDomainChanges([
        "files",
        "images",
        "trash",
        "wallpapers",
      ]);

      // Reset metadata store (this will trigger re-initialization with new UUIDs)
      resetFilesStore();

      // Re-initialization will happen automatically via the store's onRehydrateStorage
      // The default files will be loaded with new UUIDs by initializeLibrary

      setCurrentPath("/");
      setHistory(["/"]);
      setHistoryIndex(0);
      setSelectedFile(undefined);
      syncSelectionState(null, [], null);
      setError(undefined);
    } catch (err) {
      console.error("Error formatting file system:", err);
      setError("Failed to format file system");
    }
  }, [
    resetFilesStore,
    setCurrentPath,
    setHistory,
    setHistoryIndex,
    syncSelectionState,
  ]);

  // Calculate trash count based on store data
  const trashItemsCount = getItemsInPath("/Trash").length;

  return {
    currentPath,
    files,
    selectedFile,
    selectedFiles,
    selectionAnchorPath,
    isLoading,
    error,
    handleFileOpen,
    handleFileSelect,
    navigateUp,
    navigateToPath,
    moveToTrash: (file: ExtendedDisplayFileItem) => {
      const itemMeta = getFileItem(file.path);
      if (itemMeta) {
        return moveToTrash(itemMeta);
      } else {
        /* ... error ... */
      }
    },
    restoreFromTrash,
    emptyTrash,
    trashItemsCount, // Provide count derived from store
    navigateBack,
    navigateForward,
    canNavigateBack,
    canNavigateForward,
    saveFile,
    setSelectedFile: handleFileSelect,
    renameFile,
    createFolder,
    formatFileSystem,
    moveFile,
  };
}
