import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type {
  ChangeEvent,
  DragEvent,
  KeyboardEvent,
  MouseEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { ViewType, SortType } from "../components/FinderMenuBar";
import { useFileSystem, dbOperations, DocumentContent } from "./useFileSystem";
import { STORES } from "@/utils/indexedDB";
import { calculateStorageSpace } from "@/stores/useFinderStore";
import { FileItem } from "../components/FileList";
import { useFinderStore } from "@/stores/useFinderStore";
import { useAppStore, type LaunchOriginRect } from "@/stores/useAppStore";
import { MenuItem } from "@/components/ui/right-click-menu";
import { useLongPress } from "@/hooks/useLongPress";
import { useThemeStore } from "@/stores/useThemeStore";
import { toast } from "sonner";
import { importAppletFile } from "@/utils/appletImportExport";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { getTranslatedFolderNameFromName } from "@/utils/i18n";
import { helpItems } from "../metadata";
import { useFilesStoreShallow } from "@/stores/helpers";

// Type for Finder initial data
export interface FinderInitialData {
  path?: string;
  viewType?: ViewType;
}

// Helper function to determine file type from FileItem
const getFileType = (file: FileItem, t: (key: string) => string): string => {
  // Check for directory first
  if (file.isDirectory) {
    return t("apps.finder.fileTypes.folder");
  }

  // Check for specific known virtual types *before* appId
  if (file.type === "Music") return t("apps.finder.fileTypes.mp3Audio");
  if (file.type === "Video") return t("apps.finder.fileTypes.quicktimeMovie");
  if (file.type === "site-link") {
    return t("apps.finder.fileTypes.internetShortcut");
  }

  // Check for application
  if (file.appId) {
    return t("apps.finder.fileTypes.application");
  }

  // Now check extension from file.name
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "app":
      return t("apps.finder.fileTypes.application");
    case "png":
      return t("apps.finder.fileTypes.pngImage");
    case "jpg":
    case "jpeg":
      return t("apps.finder.fileTypes.jpegImage");
    case "gif":
      return t("apps.finder.fileTypes.gifImage");
    case "webp":
      return t("apps.finder.fileTypes.webpImage");
    case "bmp":
      return t("apps.finder.fileTypes.bmpImage");
    case "md":
      return t("apps.finder.fileTypes.document");
    case "txt":
      return t("apps.finder.fileTypes.document");
    case "mp3":
      return t("apps.finder.fileTypes.mp3Audio");
    case "mov":
      return t("apps.finder.fileTypes.quicktimeMovie");
    case "html":
      return t("apps.finder.fileTypes.htmlApplet");
    default:
      return t("apps.finder.fileTypes.unknown");
  }
};

// Function to decode URL-encoded path for display
const getDisplayPath = (path: string): string => {
  // Split path by segments and decode each segment
  return path
    .split("/")
    .map((segment) => {
      try {
        return segment ? decodeURIComponent(segment) : segment;
      } catch {
        return segment; // If decoding fails, return as-is
      }
    })
    .join("/");
};

// Helper to get parent path
const getParentPath = (path: string): string => {
  if (path === "/") return "/";
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return "/";
  return "/" + parts.slice(0, -1).join("/");
};

export interface UseFinderLogicProps {
  isWindowOpen: boolean;
  isForeground?: boolean;
  initialData?: FinderInitialData;
  instanceId?: string;
}

export function useFinderLogic({
  isWindowOpen,
  isForeground = true,
  initialData,
  instanceId,
}: UseFinderLogicProps) {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("finder", helpItems);

  // Dialog state
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isEmptyTrashDialogOpen, setIsEmptyTrashDialogOpen] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState(
    t("apps.finder.defaultNames.untitledFolder")
  );

  // UI state
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [storageSpace, setStorageSpace] = useState(calculateStorageSpace());
  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [contextMenuFile, setContextMenuFile] = useState<FileItem | null>(null);

  // Refs
  const pathInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stores
  const {
    getItem: getFileItem,
    getItemsInPath,
    updateItemMetadata,
    createAlias,
  } = useFilesStoreShallow((state) => ({
    getItem: state.getItem,
    getItemsInPath: state.getItemsInPath,
    updateItemMetadata: state.updateItemMetadata,
    createAlias: state.createAlias,
  }));
  const createFinderInstance = useFinderStore((state) => state.createInstance);
  const removeFinderInstance = useFinderStore((state) => state.removeInstance);
  const updateFinderInstance = useFinderStore((state) => state.updateInstance);
  const finderInstances = useFinderStore((state) => state.instances);
  const setViewTypeForPath = useFinderStore(
    (state) => state.setViewTypeForPath
  );

  // Create instance when component mounts
  useEffect(() => {
    if (!instanceId) return;

    // Check if instance already exists (from persisted state)
    const existingInstance = finderInstances[instanceId];
    if (existingInstance) {
      // Instance already exists from persisted state, don't recreate
      return;
    }

    // Get initial path from initialData or localStorage
    const typedInitialData = initialData as FinderInitialData | undefined;
    // Try new key first, fall back to legacy
    const storedPath =
      localStorage.getItem("ryos:app:finder:initial-path") ||
      localStorage.getItem("app_finder_initialPath");
    const initialPath = typedInitialData?.path || storedPath || "/";
    createFinderInstance(instanceId, initialPath);

    // Apply initial view preference if provided
    if (typedInitialData?.viewType) {
      setViewTypeForPath(initialPath, typedInitialData.viewType);
      updateFinderInstance(instanceId, {
        viewType: typedInitialData.viewType,
      });
    }

    // Clear the localStorage if we used it
    if (storedPath) {
      localStorage.removeItem("ryos:app:finder:initial-path");
      localStorage.removeItem("app_finder_initialPath");
    }
  }, [
    instanceId,
    createFinderInstance,
    initialData,
    finderInstances,
    setViewTypeForPath,
    updateFinderInstance,
  ]);

  // Sync Finder instance cleanup with App store instance lifecycle
  useEffect(() => {
    if (!instanceId) return;

    // Listen for instance close events from the App store
    const handleInstanceClose = (event: CustomEvent) => {
      if (event.detail.instanceId === instanceId && !event.detail.isOpen) {
        // Only remove Finder instance when App store actually closes it
        removeFinderInstance(instanceId);
      }
    };

    window.addEventListener(
      "instanceStateChange",
      handleInstanceClose as EventListener
    );
    return () => {
      window.removeEventListener(
        "instanceStateChange",
        handleInstanceClose as EventListener
      );
    };
  }, [instanceId, removeFinderInstance]);

  // Get current instance data
  const currentInstance = instanceId ? finderInstances[instanceId] : null;

  // Instance state
  const viewType = currentInstance?.viewType || "list";
  const sortType = currentInstance?.sortType || "name";

  const setSortType = useCallback(
    (type: SortType) => {
      if (instanceId) {
        updateFinderInstance(instanceId, { sortType: type });
      }
    },
    [instanceId, updateFinderInstance]
  );

  // Get all functionality from useFileSystem hook
  // Use the persisted path from the instance, or initialData path, or root
  // Important: Check if instance exists from persisted state first
  const initialFileSystemPath =
    instanceId && finderInstances[instanceId]
      ? finderInstances[instanceId].currentPath
      : (initialData as FinderInitialData | undefined)?.path || "/";

  const {
    currentPath,
    files,
    selectedFile,
    isLoading,
    error,
    handleFileOpen: originalHandleFileOpen,
    handleFileSelect,
    navigateUp,
    navigateToPath,
    moveToTrash,
    restoreFromTrash,
    emptyTrash,
    trashItemsCount,
    navigateBack,
    navigateForward,
    canNavigateBack,
    canNavigateForward,
    saveFile: originalSaveFile,
    renameFile: originalRenameFile,
    createFolder,
    moveFile,
  } = useFileSystem(initialFileSystemPath, { instanceId });

  const setViewType = useCallback(
    (type: ViewType) => {
      // Persist per-path preference
      setViewTypeForPath(currentPath, type);
      // Keep instance state in sync for compatibility
      if (instanceId) {
        updateFinderInstance(instanceId, { viewType: type });
      }
    },
    [currentPath, instanceId, setViewTypeForPath, updateFinderInstance]
  );

  // Wrap the original handleFileOpen - now only calls the original without TextEditStore updates
  const handleFileOpen = async (file: FileItem, launchOrigin?: LaunchOriginRect) => {
    // Call original file open handler from useFileSystem
    originalHandleFileOpen(file, launchOrigin);
    // TextEditStore updates removed - TextEdit instances now manage their own state
  };

  // Use the original saveFile directly without TextEditStore updates
  const saveFile = originalSaveFile;

  // Update storage space periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setStorageSpace(calculateStorageSpace());
    }, 15000); // Update every 15 seconds

    return () => clearInterval(interval);
  }, []);

  // Sort files
  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      switch (sortType) {
        case "name":
          return a.name.localeCompare(b.name);
        case "kind": {
          // Sort by directory first, then by file extension
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          const extA = a.name.split(".").pop() || "";
          const extB = b.name.split(".").pop() || "";
          return extA.localeCompare(extB) || a.name.localeCompare(b.name);
        }
        case "size":
          // For now, directories are considered smaller than files
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return 0;
        case "date":
          // Sort by modified date, directories first
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;

          // If both have dates, sort by date (newest first)
          if (a.modifiedAt && b.modifiedAt) {
            return (
              new Date(b.modifiedAt).getTime() -
              new Date(a.modifiedAt).getTime()
            );
          }
          // If only one has a date, put it first
          if (a.modifiedAt && !b.modifiedAt) return -1;
          if (!a.modifiedAt && b.modifiedAt) return 1;
          // If neither has a date, sort by name
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
  }, [files, sortType]);

  const handleEmptyTrash = () => {
    setIsEmptyTrashDialogOpen(true);
  };

  const confirmEmptyTrash = () => {
    emptyTrash();
    setIsEmptyTrashDialogOpen(false);
  };

  const handleNewWindow = () => {
    // Launch a new Finder instance with multi-window support
    // Always start at the root path
    const initialPath = "/";
    // Use the launchApp method which handles multi-window properly
    const appStore = useAppStore.getState();
    appStore.launchApp("finder", { path: initialPath }, undefined, true);
  };

  // External file drop handler (from outside the app)
  const handleFileDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    // Only handle external files (from the user's disk)
    // If no files in dataTransfer, this might be an internal move which is handled by FileList
    if (e.dataTransfer.files.length === 0) {
      return;
    }

    // Only allow drops in the Documents directory
    if (currentPath !== "/Documents") {
      return;
    }

    const file = e.dataTransfer.files[0];
    if (file) {
      // Only accept text and markdown files
      if (!file.type.startsWith("text/") && !file.name.endsWith(".md")) {
        return;
      }

      try {
        const text = await file.text();
        const filePath = `/Documents/${file.name}`;

        await saveFile({
          name: file.name,
          path: filePath,
          content: text,
        });

        // Notify file was added
        const event = new CustomEvent("fileUpdated", {
          detail: {
            name: file.name,
            path: filePath,
          },
        });
        window.dispatchEvent(event);
      } catch (err) {
        console.error("Error saving dropped file:", err);
      }
    }
  };

  // Internal file move handler (between folders in the app)
  const handleFileMoved = (sourceFile: FileItem, targetFolder: FileItem) => {
    if (!canCreateFolder) {
      console.warn("File movement is not allowed in this directory");
      return;
    }

    if (!sourceFile || !targetFolder || !targetFolder.isDirectory) {
      console.warn("Invalid source or target for file move");
      return;
    }

    // Get the file from the filesystem using the path
    const sourceItem = getFileItem(sourceFile.path);
    if (!sourceItem) {
      console.error(`Source file not found at path: ${sourceFile.path}`);
      return;
    }

    // Execute the move
    moveFile(sourceItem, targetFolder.path);
  };

  // Handler for dropping files directly into the current directory
  const handleDropToCurrentDirectory = (sourceFile: FileItem) => {
    if (!canCreateFolder) {
      console.warn("File movement is not allowed in this directory");
      return;
    }

    if (!sourceFile) {
      console.warn("Invalid source file for move");
      return;
    }

    // Get source file from store
    const sourceItem = getFileItem(sourceFile.path);
    if (!sourceItem) {
      console.error(`Source file not found at path: ${sourceFile.path}`);
      return;
    }

    // Don't move a file to the directory it's already in
    if (getParentPath(sourceFile.path) === currentPath) {
      console.warn(`File ${sourceFile.name} is already in ${currentPath}`);
      return;
    }

    moveFile(sourceItem, currentPath);
  };

  const handleImportFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (
    e: ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const fileExtension = file.name.toLowerCase();
      const isAppletFile =
        fileExtension.endsWith(".app") || fileExtension.endsWith(".gz");
      const isAppletsDir = currentPath === "/Applets";

      // .app and .gz files always go to /Applets, regardless of current directory
      if (isAppletFile) {
        try {
          // Use shared import function
          const importedData = await importAppletFile(file);

          const filePath = `/Applets/${importedData.name}`;

          await saveFile({
            name: importedData.name,
            path: filePath,
            content: importedData.content,
            type: "html",
            icon: importedData.icon,
            shareId: importedData.shareId,
            createdBy: importedData.createdBy,
          });

          // Update additional metadata if present
          if (
            importedData.windowWidth ||
            importedData.windowHeight ||
            importedData.createdAt ||
            importedData.modifiedAt
          ) {
            updateItemMetadata(filePath, {
              ...(importedData.windowWidth !== undefined && {
                windowWidth: importedData.windowWidth,
              }),
              ...(importedData.windowHeight !== undefined && {
                windowHeight: importedData.windowHeight,
              }),
              ...(importedData.createdAt !== undefined && {
                createdAt: importedData.createdAt,
              }),
              ...(importedData.modifiedAt !== undefined && {
                modifiedAt: importedData.modifiedAt,
              }),
            });
          }

          // Notify file was added
          const event = new CustomEvent("saveFile", {
            detail: {
              name: importedData.name,
              path: filePath,
              content: importedData.content,
              icon: importedData.icon,
            },
          });
          window.dispatchEvent(event);

          toast.success(t("apps.finder.messages.appletImported"), {
            description: t("apps.finder.messages.appletImportedDesc", {
              name: importedData.name,
              iconText: importedData.icon
                ? t("apps.finder.messages.appletImportedIconText", {
                    icon: importedData.icon,
                  })
                : "",
            }),
          });

          // Navigate to /Applets if not already there
          if (!isAppletsDir) {
            navigateToPath("/Applets");
          }
        } catch (error) {
          console.error("Import failed:", error);
          toast.error(t("apps.finder.messages.importFailed"), {
            description: t("apps.finder.messages.importFailedAppletDesc"),
          });
        } finally {
          e.target.value = "";
        }
        return;
      }

      // Check if we're in Applets directory for HTML files
      if (isAppletsDir) {
        // In Applets: accept .html and .htm files
        if (!fileExtension.endsWith(".html") && !fileExtension.endsWith(".htm")) {
          toast.error(t("apps.finder.messages.invalidFileType"), {
            description: t("apps.finder.messages.invalidFileTypeDesc"),
          });
          e.target.value = "";
          return;
        }
      } else {
        // In other directories: accept text and markdown files
        if (!file.type.startsWith("text/") && !file.name.endsWith(".md")) {
          e.target.value = "";
          return;
        }
      }

      try {
        // Handle applet HTML files (when in /Applets directory)
        if (isAppletsDir) {
          // Use shared import function
          const importedData = await importAppletFile(file);

          const filePath = `/Applets/${importedData.name}`;

          await saveFile({
            name: importedData.name,
            path: filePath,
            content: importedData.content,
            type: "html",
            icon: importedData.icon,
            shareId: importedData.shareId,
            createdBy: importedData.createdBy,
          });

          // Update additional metadata if present
          if (
            importedData.windowWidth ||
            importedData.windowHeight ||
            importedData.createdAt ||
            importedData.modifiedAt
          ) {
            updateItemMetadata(filePath, {
              ...(importedData.windowWidth !== undefined && {
                windowWidth: importedData.windowWidth,
              }),
              ...(importedData.windowHeight !== undefined && {
                windowHeight: importedData.windowHeight,
              }),
              ...(importedData.createdAt !== undefined && {
                createdAt: importedData.createdAt,
              }),
              ...(importedData.modifiedAt !== undefined && {
                modifiedAt: importedData.modifiedAt,
              }),
            });
          }

          // Notify file was added
          const event = new CustomEvent("saveFile", {
            detail: {
              name: importedData.name,
              path: filePath,
              content: importedData.content,
              icon: importedData.icon,
            },
          });
          window.dispatchEvent(event);

          toast.success(t("apps.finder.messages.appletImported"), {
            description: t("apps.finder.messages.appletImportedDesc", {
              name: importedData.name,
              iconText: importedData.icon
                ? t("apps.finder.messages.appletImportedIconText", {
                    icon: importedData.icon,
                  })
                : "",
            }),
          });
        } else {
          // Handle regular text files
          const text = await file.text();
          const fileName = file.name;
          const basePath = currentPath === "/" ? "" : currentPath;
          const filePath = `${basePath}/${fileName}`;

          await saveFile({
            name: fileName,
            path: filePath,
            content: text,
          });

          // Notify file was added
          const event = new CustomEvent("fileUpdated", {
            detail: {
              name: fileName,
              path: filePath,
            },
          });
          window.dispatchEvent(event);
        }

        // Clear the input
        e.target.value = "";
      } catch (err) {
        console.error("Error importing file:", err);
        toast.error(t("apps.finder.messages.importFailed"), {
          description: t("apps.finder.messages.importFailedDesc"),
        });
        e.target.value = "";
      }
    }
  };

  const handleRename = () => {
    if (!selectedFile) return;
    setRenameValue(selectedFile.name);
    setIsRenameDialogOpen(true);
  };

  const handleRenameSubmit = async (newName: string) => {
    if (!selectedFile || !newName || !newName.trim()) return;
    const trimmedNewName = newName.trim();
    if (selectedFile.name === trimmedNewName) {
      setIsRenameDialogOpen(false);
      return;
    }

    const basePath = currentPath === "/" ? "" : currentPath;
    const oldPathForRename = `${basePath}/${selectedFile.name}`;
    await originalRenameFile(oldPathForRename, trimmedNewName);

    // Dispatch rename event
    const event = new CustomEvent("fileRenamed", {
      detail: {
        oldPath: oldPathForRename,
        newPath: `${basePath}/${trimmedNewName}`,
        oldName: selectedFile.name,
        newName: trimmedNewName,
      },
    });
    window.dispatchEvent(event);

    setIsRenameDialogOpen(false);
  };

  const handleDuplicate = async () => {
    if (!selectedFile || selectedFile.isDirectory) return; // Can only duplicate files
    try {
      // Create a copy name
      const ext = selectedFile.name.includes(".")
        ? `.${selectedFile.name.split(".").pop()}`
        : "";
      const baseName = selectedFile.name.replace(ext, "");
      let copyIndex = 1;
      let copyName = `${baseName} ${t("apps.finder.defaultNames.copy")}${ext}`;
      // Fix path construction here
      const basePath = currentPath === "/" ? "" : currentPath;
      let copyPath = `${basePath}/${copyName}`;

      // Ensure unique name
      while (getFileItem(copyPath)) {
        copyIndex++;
        copyName = `${baseName} ${t("apps.finder.defaultNames.copy")} ${copyIndex}${ext}`;
        copyPath = `${basePath}/${copyName}`;
      }

      // Get the file metadata to find UUID
      const fileMetadata = getFileItem(selectedFile.path);

      if (!fileMetadata || !fileMetadata.uuid) {
        console.error(
          "Could not find file metadata or UUID for:",
          selectedFile.path
        );
        return;
      }

      // Fetch content for the selected file using UUID
      let contentToCopy: string | Blob | undefined;
      // Determine store based on selectedFile.path, not currentPath
      const storeName = selectedFile.path.startsWith("/Documents/")
        ? STORES.DOCUMENTS
        : selectedFile.path.startsWith("/Images/")
        ? STORES.IMAGES
        : null;
      if (storeName) {
        const contentData = await dbOperations.get<DocumentContent>(
          storeName,
          fileMetadata.uuid
        );
        if (contentData) {
          contentToCopy = contentData.content;
        }
      }

      if (contentToCopy === undefined) {
        console.error(
          "Could not retrieve content for duplication:",
          selectedFile.path
        );
        return; // Or show an error
      }

      // Use saveFile to create the duplicate
      await saveFile({
        name: copyName,
        path: copyPath,
        content: contentToCopy,
        type: selectedFile.type,
      });
    } catch (err) {
      console.error("Error duplicating file:", err);
    }
  };

  const handleRestore = () => {
    if (!selectedFile) return;
    // restoreFromTrash now expects the DisplayFileItem from the UI
    restoreFromTrash(selectedFile);
  };

  const handleNewFolder = useCallback(() => {
    // Find a unique default name
    let folderIndex = 0;
    let defaultName = t("apps.finder.defaultNames.untitledFolder");
    const basePath = currentPath === "/" ? "" : currentPath;
    let folderPath = `${basePath}/${defaultName}`;
    while (getFileItem(folderPath)) {
      folderIndex++;
      defaultName = `${t("apps.finder.defaultNames.untitledFolder")} ${folderIndex}`;
      folderPath = `${basePath}/${defaultName}`;
    }
    setNewFolderName(defaultName);
    setIsNewFolderDialogOpen(true);
  }, [currentPath, getFileItem, t]);

  const handleNewFolderSubmit = (name: string) => {
    if (!name || !name.trim()) return;
    const trimmedName = name.trim();
    const basePath = currentPath === "/" ? "" : currentPath;
    const newPath = `${basePath}/${trimmedName}`;

    // Use the createFolder function from the hook
    createFolder({ path: newPath, name: trimmedName });

    setIsNewFolderDialogOpen(false);
  };

  // Determine if folder creation (and thus file movement) is allowed in the current path
  const canCreateFolder =
    currentPath === "/Documents" ||
    currentPath === "/Images" ||
    currentPath.startsWith("/Documents/") ||
    currentPath.startsWith("/Images/");

  // Get all root folders for the Go menu using fileStore
  // This will always show root folders regardless of current path
  const rootFolders = useMemo(() => {
    return getItemsInPath("/")
      .filter(
        (item) => item.isDirectory && item.path !== "/Trash" // We'll add Trash separately in the menu
      )
      .map((item) => ({
        name: item.name,
        isDirectory: true,
        path: item.path,
        icon: item.icon || "/icons/default/directory.png",
      }));
  }, [getItemsInPath]);

  // Add a new handler for rename requests
  const handleRenameRequest = (file: FileItem) => {
    // Only allow rename in paths where file creation is allowed
    if (!canCreateFolder) return;

    // Prevent renaming virtual files and special folders
    if (
      file.type?.includes("virtual") ||
      file.path === "/Documents" ||
      file.path === "/Images" ||
      file.path === "/Applications" ||
      file.path === "/Trash" ||
      file.path === "/Music" ||
      file.path === "/Videos" ||
      file.path === "/Sites"
    ) {
      return;
    }

    // Set rename value and open the dialog
    setRenameValue(file.name);
    setIsRenameDialogOpen(true);
  };

  const handleItemContextMenu = (file: FileItem, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setContextMenuFile(file);
    handleFileSelect(file); // ensure selected
  };

  const handleBlankContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setContextMenuFile(null);
  };

  // ------------------ Mobile long-press support (blank area) ------------------
  const blankLongPressHandlers = useLongPress((e) => {
    // Check if the target is within a file item - if so, don't show blank context menu
    const target = e.target as HTMLElement;
    const fileItem = target.closest("[data-file-item]");
    if (fileItem) {
      return; // Let the file item handle its own context menu
    }

    const touch = e.touches[0];
    setContextMenuPos({ x: touch.clientX, y: touch.clientY });
    setContextMenuFile(null);
  });

  // Inside component before return create two arrays
  const blankMenuItems: MenuItem[] = useMemo(
    () => [
      {
        type: "submenu",
        label: t("apps.finder.contextMenu.sortBy"),
        items: [
          {
            type: "radioGroup",
            value: sortType,
            onChange: (val) => setSortType(val as SortType),
            items: [
              { label: t("apps.finder.contextMenu.name"), value: "name" },
              { label: t("apps.finder.contextMenu.date"), value: "date" },
              { label: t("apps.finder.contextMenu.size"), value: "size" },
              { label: t("apps.finder.contextMenu.kind"), value: "kind" },
            ],
          },
        ],
      },
      { type: "separator" },
      ...(currentPath === "/Trash"
        ? [
            {
              type: "item" as const,
              label: t("apps.finder.contextMenu.emptyTrash"),
              onSelect: handleEmptyTrash,
              disabled: trashItemsCount === 0,
            },
          ]
        : [
            {
              type: "item" as const,
              label: t("apps.finder.contextMenu.newFolder"),
              onSelect: handleNewFolder,
            },
          ]),
    ],
    [sortType, setSortType, currentPath, trashItemsCount, t, handleNewFolder]
  );

  const handleAddToDesktop = (file: FileItem) => {
    // Check if item is already an alias or is Desktop itself
    if (file.path.startsWith("/Desktop") || file.path === "/Desktop") {
      return;
    }

    // Check if an alias already exists for this target
    const desktopItems = getItemsInPath("/Desktop");
    let aliasExists = false;

    // Determine if this is an app or a file/applet
    if (file.path.startsWith("/Applications/") && file.appId) {
      // Check if alias already exists for this app
      const existingShortcut = desktopItems.find(
        (item) =>
          item.aliasType === "app" &&
          item.aliasTarget === file.appId &&
          item.status === "active"
      );
      aliasExists = !!existingShortcut;

      if (aliasExists && existingShortcut) {
        // If this was a theme-conditional default (hiddenOnThemes), "fix" it by
        // clearing the hidden themes so it shows on all themes going forward.
        if (
          existingShortcut.hiddenOnThemes &&
          existingShortcut.hiddenOnThemes.length > 0
        ) {
          updateItemMetadata(existingShortcut.path, {
            hiddenOnThemes: [],
          });
        }
      } else {
        // It's an application - create a new fixed alias
        createAlias(file.path, file.name, "app", file.appId);
      }
    } else if (!file.isDirectory) {
      // Check if alias already exists for this file
      aliasExists = desktopItems.some(
        (item) =>
          item.aliasType === "file" &&
          item.aliasTarget === file.path &&
          item.status === "active"
      );

      if (!aliasExists) {
        // It's a file or applet
        createAlias(file.path, file.name, "file");
      }
    }
  };

  const fileMenuItems = (file: FileItem): MenuItem[] => [
    {
      type: "item",
      label: t("apps.finder.contextMenu.open"),
      onSelect: () => handleFileOpen(file),
    },
    { type: "separator" },
    {
      type: "item",
      label: t("apps.finder.contextMenu.addToDesktop"),
      onSelect: () => handleAddToDesktop(file),
      disabled:
        file.isDirectory ||
        file.path.startsWith("/Desktop") ||
        file.path === "/Desktop",
    },
    { type: "separator" },
    {
      type: "item",
      label: t("apps.finder.contextMenu.rename"),
      onSelect: handleRename,
    },
    {
      type: "item",
      label: t("apps.finder.contextMenu.duplicate"),
      onSelect: handleDuplicate,
    },
    {
      type: "item",
      label: t("apps.finder.contextMenu.moveToTrash"),
      onSelect: () => moveToTrash(file),
      disabled:
        file.path.startsWith("/Trash") ||
        file.path === "/Documents" ||
        file.path === "/Images" ||
        file.path === "/Applications",
    },
  ];

  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  // Computed window title
  const windowTitle = useMemo(() => {
    if (currentPath === "/") {
      return t("apps.finder.window.macintoshHd");
    }
    // Get the last path segment and decode it
    const lastSegment = currentPath.split("/").filter(Boolean).pop() || "";
    try {
      const decodedName = decodeURIComponent(lastSegment);
      // Use localized folder name if available
      return (
        getTranslatedFolderNameFromName(decodedName) ||
        t("apps.finder.window.finder")
      );
    } catch {
      // Use localized folder name even if decode fails
      return (
        getTranslatedFolderNameFromName(lastSegment) ||
        t("apps.finder.window.finder")
      );
    }
  }, [currentPath, t]);

  // Drag handlers
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    // Only handle external file drags, not internal file moves
    if (e.dataTransfer.types.includes("Files") && e.dataTransfer.files.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      if (!isDraggingOver && currentPath === "/Documents") {
        setIsDraggingOver(true);
      }
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Check if we're leaving to a child element
    const relatedTarget = e.relatedTarget as Node | null;
    if (e.currentTarget.contains(relatedTarget)) {
      return;
    }
    setIsDraggingOver(false);
  };

  const handleDragEnd = () => {
    setIsDraggingOver(false);
  };

  const handleMouseLeave = () => {
    setIsDraggingOver(false);
  };

  // Handler for dropping on parent folder button
  const handleParentButtonDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove("bg-black", "text-white");

    // Parse the dragged file data
    try {
      const jsonData = e.dataTransfer.getData("application/json");
      if (jsonData) {
        const { path, name } = JSON.parse(jsonData);
        const sourceItem = getFileItem(path);

        if (sourceItem && currentPath !== "/") {
          // Get parent path
          const parentPath = getParentPath(currentPath);
          console.log(`Moving file from ${path} to ${parentPath}/${name}`);
          moveFile(sourceItem, parentPath);
        }
      }
    } catch (err) {
      console.error("Error handling drop on parent folder button:", err);
    }
  };

  const handleParentButtonDragOver = (e: DragEvent<HTMLButtonElement>) => {
    // Only allow dropping if not at root and if file creation is allowed in parent directory
    if (currentPath !== "/" && canCreateFolder) {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.classList.add("bg-black", "text-white");
    }
  };

  const handleParentButtonDragLeave = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove("bg-black", "text-white");
  };

  // Path input handlers
  const handlePathInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    navigateToPath(e.target.value);
  };

  const handlePathInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      navigateToPath((e.target as HTMLInputElement).value);
    }
  };

  return {
    // Translations
    t,
    // State
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isEmptyTrashDialogOpen,
    setIsEmptyTrashDialogOpen,
    isRenameDialogOpen,
    setIsRenameDialogOpen,
    renameValue,
    setRenameValue,
    isNewFolderDialogOpen,
    setIsNewFolderDialogOpen,
    newFolderName,
    setNewFolderName,
    isDraggingOver,
    storageSpace,
    contextMenuPos,
    setContextMenuPos,
    contextMenuFile,

    // Refs
    pathInputRef,
    fileInputRef,

    // File system state
    currentPath,
    files,
    selectedFile,
    isLoading,
    error,
    sortedFiles,

    // View and sort
    viewType,
    setViewType,
    sortType,
    setSortType,

    // Navigation
    navigateUp,
    navigateToPath,
    navigateBack,
    navigateForward,
    canNavigateBack,
    canNavigateForward,

    // File operations
    handleFileOpen,
    handleFileSelect,
    saveFile,
    renameFile: originalRenameFile,
    createFolder,
    moveFile,
    moveToTrash,
    restoreFromTrash,
    emptyTrash,
    trashItemsCount,

    // Handlers
    handleEmptyTrash,
    confirmEmptyTrash,
    handleNewWindow,
    handleFileDrop,
    handleFileMoved,
    handleDropToCurrentDirectory,
    handleImportFile,
    handleFileInputChange,
    handleRename,
    handleRenameSubmit,
    handleDuplicate,
    handleRestore,
    handleNewFolder,
    handleNewFolderSubmit,
    handleRenameRequest,
    handleItemContextMenu,
    handleBlankContextMenu,
    handleAddToDesktop,

    // Context menu
    blankMenuItems,
    fileMenuItems,
    blankLongPressHandlers,

    // Computed values
    canCreateFolder,
    rootFolders,
    windowTitle,
    isXpTheme,
    currentTheme,

    // Drag handlers
    handleDragOver,
    handleDragLeave,
    handleDragEnd,
    handleMouseLeave,
    handleParentButtonDrop,
    handleParentButtonDragOver,
    handleParentButtonDragLeave,

    // Path input handlers
    handlePathInputChange,
    handlePathInputKeyDown,

    // Help items
    translatedHelpItems,

    // Helper functions
    getFileType: (file: FileItem) => getFileType(file, t),
    getDisplayPath,

    // Props passed through
    isWindowOpen,
    isForeground,
  };
}
