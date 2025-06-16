import { WindowFrame } from "@/components/layout/WindowFrame";
import { FinderMenuBar, ViewType, SortType } from "./FinderMenuBar";
import { AppProps } from "@/apps/base/types";
import { useState, useRef, useEffect, useCallback } from "react";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { FileList } from "./FileList";
import {
  useFileSystem,
  dbOperations,
  STORES,
  DocumentContent,
} from "../hooks/useFileSystem";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { appMetadata, helpItems } from "../index";
import { calculateStorageSpace } from "@/stores/useFinderStore";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { useFilesStore } from "@/stores/useFilesStore";
import { FileItem } from "./FileList";
import { useFinderStore } from "@/stores/useFinderStore";
import { useAppStore } from "@/stores/useAppStore";
import { RightClickMenu, MenuItem } from "@/components/ui/right-click-menu";
import { v4 as uuidv4 } from "uuid";
import type { FileSystemItem } from "@/stores/useFilesStore";

// Type for Finder initial data
interface FinderInitialData {
  path?: string;
}

// Helper function to determine file type from FileItem
const getFileType = (file: FileItem): string => {
  // Check for directory first
  if (file.isDirectory) {
    return "Folder";
  }

  // Check for specific known virtual types *before* appId
  if (file.type === "Music") return "MP3 Audio";
  if (file.type === "Video") return "QuickTime Movie";
  if (file.type === "site-link") return "Internet Shortcut";

  // Check for application
  if (file.appId) {
    return "Application";
  }

  // Now check extension from file.name
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "png":
      return "PNG Image";
    case "jpg":
    case "jpeg":
      return "JPEG Image";
    case "gif":
      return "GIF Image";
    case "webp":
      return "WebP Image";
    case "bmp":
      return "BMP Image";
    case "md":
      return "Document";
    case "txt":
      return "Document";
    case "mp3":
      return "MP3 Audio";
    case "mov":
      return "QuickTime Movie";
    default:
      return "Unknown";
  }
};

export function FinderAppComponent({
  onClose,
  isWindowOpen,
  isForeground = true,
  skipInitialSound,
  instanceId,
  initialData,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps) {
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isEmptyTrashDialogOpen, setIsEmptyTrashDialogOpen] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const pathInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [storageSpace, setStorageSpace] = useState(calculateStorageSpace());
  const fileStore = useFilesStore();
  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [contextMenuFile, setContextMenuFile] = useState<FileItem | null>(null);

  // Use instance-based store management
  const createFinderInstance = useFinderStore((state) => state.createInstance);
  const removeFinderInstance = useFinderStore((state) => state.removeInstance);
  const updateFinderInstance = useFinderStore((state) => state.updateInstance);
  const finderInstances = useFinderStore((state) => state.instances);

  // Legacy store methods for single-window mode
  const legacyViewType = useFinderStore((state) => state.viewType);
  const legacySortType = useFinderStore((state) => state.sortType);
  const legacySetViewType = useFinderStore((state) => state.setViewType);
  const legacySetSortType = useFinderStore((state) => state.setSortType);

  // Create instance when component mounts (only if using instanceId)
  useEffect(() => {
    if (instanceId) {
      // Check if instance already exists (from persisted state)
      const existingInstance = finderInstances[instanceId];
      if (existingInstance) {
        // Instance already exists from persisted state, don't recreate
        return;
      }

      // Get initial path from initialData or localStorage
      const typedInitialData = initialData as FinderInitialData | undefined;
      const initialPath =
        typedInitialData?.path ||
        localStorage.getItem("app_finder_initialPath") ||
        "/";
      createFinderInstance(instanceId, initialPath);

      // Clear the localStorage if we used it
      if (localStorage.getItem("app_finder_initialPath")) {
        localStorage.removeItem("app_finder_initialPath");
      }
    }
  }, [instanceId, createFinderInstance, initialData, finderInstances]);

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

  // Get current instance data (only if using instanceId)
  const currentInstance = instanceId ? finderInstances[instanceId] : null;

  // Use instance data if available, otherwise use legacy store
  const viewType = instanceId
    ? currentInstance?.viewType || "list"
    : legacyViewType;

  const sortType = instanceId
    ? currentInstance?.sortType || "name"
    : legacySortType;

  const setViewType = useCallback(
    (type: ViewType) => {
      if (instanceId) {
        updateFinderInstance(instanceId, { viewType: type });
      } else {
        legacySetViewType(type);
      }
    },
    [instanceId, updateFinderInstance, legacySetViewType]
  );

  const setSortType = useCallback(
    (type: SortType) => {
      if (instanceId) {
        updateFinderInstance(instanceId, { sortType: type });
      } else {
        legacySetSortType(type);
      }
    },
    [instanceId, updateFinderInstance, legacySetSortType]
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

  // Wrap the original handleFileOpen - now only calls the original without TextEditStore updates
  const handleFileOpen = async (file: FileItem) => {
    // Call original file open handler from useFileSystem
    originalHandleFileOpen(file);
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

  // Handle initial path from launch event - removed to prevent conflicts with instance-based navigation

  const sortedFiles = [...files].sort((a, b) => {
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
            new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
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
  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
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
    const sourceItem = fileStore.getItem(sourceFile.path);
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
    const sourceItem = fileStore.getItem(sourceFile.path);
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

  // Helper to get parent path
  const getParentPath = (path: string): string => {
    if (path === "/") return "/";
    const parts = path.split("/").filter(Boolean);
    if (parts.length <= 1) return "/";
    return "/" + parts.slice(0, -1).join("/");
  };

  const handleImportFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      // Only accept text and markdown files
      if (!file.type.startsWith("text/") && !file.name.endsWith(".md")) {
        return;
      }

      try {
        const text = await file.text();
        // Ensure path is correct for current directory
        const basePath = currentPath === "/" ? "" : currentPath;
        const filePath = `${basePath}/${file.name}`;

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

        // Clear the input
        e.target.value = "";
      } catch (err) {
        console.error("Error importing file:", err);
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
      let copyName = `${baseName} copy${ext}`;
      // Fix path construction here
      const basePath = currentPath === "/" ? "" : currentPath;
      let copyPath = `${basePath}/${copyName}`;

      // Ensure unique name
      while (fileStore.getItem(copyPath)) {
        copyIndex++;
        copyName = `${baseName} copy ${copyIndex}${ext}`;
        copyPath = `${basePath}/${copyName}`;
      }

      // Get the file metadata to find UUID
      const fileMetadata = fileStore.getItem(selectedFile.path);

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

      // Select the new file (optional)
      // Need to get the updated files list from the hook/store to find the new item
      // This might require a slight delay or relying on the store update triggering a re-render
      // For now, let's skip auto-selection after duplication to avoid complexity.
      // const newItem = files.find(f => f.path === copyPath);
      // if (newItem) {
      //     originalSetSelectedFile(newItem);
      // }
    } catch (err) {
      console.error("Error duplicating file:", err);
    }
  };

  const handleRestore = () => {
    if (!selectedFile) return;
    // restoreFromTrash now expects the DisplayFileItem from the UI
    restoreFromTrash(selectedFile);
  };

  // --- New Folder State & Handlers --- //
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("untitled folder");

  const handleNewFolder = () => {
    // Find a unique default name
    let folderIndex = 0;
    let defaultName = "untitled folder";
    const basePath = currentPath === "/" ? "" : currentPath;
    let folderPath = `${basePath}/${defaultName}`;
    while (fileStore.getItem(folderPath)) {
      folderIndex++;
      defaultName = `untitled folder ${folderIndex}`;
      folderPath = `${basePath}/${defaultName}`;
    }
    setNewFolderName(defaultName);
    setIsNewFolderDialogOpen(true);
  };

  const handleNewFolderSubmit = (name: string) => {
    if (!name || !name.trim()) return;
    const trimmedName = name.trim();
    const basePath = currentPath === "/" ? "" : currentPath;
    const newPath = `${basePath}/${trimmedName}`;

    // Use the createFolder function from the hook
    createFolder({ path: newPath, name: trimmedName });

    // No need to manually add to fileStore here
    // const newFolderItem: FileSystemItem = { ... };
    // fileStore.addItem(newFolderItem);

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
  const rootFolders = fileStore
    .getItemsInPath("/")
    .filter(
      (item) => item.isDirectory && item.path !== "/Trash" // We'll add Trash separately in the menu
    )
    .map((item) => ({
      name: item.name,
      isDirectory: true,
      path: item.path,
      icon: item.icon || "/icons/folder.png",
    }));

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

  const handleItemContextMenu = (file: FileItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setContextMenuFile(file);
    handleFileSelect(file); // ensure selected
  };

  const handleBlankContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setContextMenuFile(null);
  };

  // Inside component before return create two arrays
  const blankMenuItems: MenuItem[] = [
    {
      type: "submenu",
      label: "Sort By",
      items: [
        {
          type: "radioGroup",
          value: sortType,
          onChange: (val) => setSortType(val as SortType),
          items: [
            { label: "Name", value: "name" },
            { label: "Date", value: "date" },
            { label: "Size", value: "size" },
            { label: "Kind", value: "kind" },
          ],
        },
      ],
    },
    { type: "separator" },
    { type: "item", label: "New Folder…", onSelect: handleNewFolder },
  ];

  const fileMenuItems = (file: FileItem): MenuItem[] => [
    { type: "item", label: "Rename…", onSelect: handleRename },
    { type: "item", label: "Duplicate", onSelect: handleDuplicate },
    {
      type: "item",
      label: "Move to Trash",
      onSelect: () => moveToTrash(file),
      disabled:
        file.path.startsWith("/Trash") ||
        file.path === "/Documents" ||
        file.path === "/Images" ||
        file.path === "/Applications",
    },
  ];

  // -------------- CUT / COPY / PASTE ---------------- //
  const fileStoreClipboard = useFilesStore();

  const isEditable = (file: FileItem | undefined): boolean => {
    if (!file) return false;
    // Reuse the same rules we use for moving to trash / rename
    if (
      file.path === "/Trash" ||
      file.path.startsWith("/Trash/") ||
      file.path === "/Applications" ||
      file.path.startsWith("/Applications/")
    ) {
      return false;
    }
    return true;
  };

  const handleCut = () => {
    if (!selectedFile || !isEditable(selectedFile)) return;
    fileStoreClipboard.setClipboard("cut", [selectedFile.path]);
  };

  const handleCopy = () => {
    if (!selectedFile || !isEditable(selectedFile)) return;
    fileStoreClipboard.setClipboard("copy", [selectedFile.path]);
  };

  const handlePaste = async () => {
    const clipboard = fileStoreClipboard.clipboard;
    if (!clipboard || clipboard.items.length === 0) return;

    // Prevent pasting into locations that cannot accept files
    if (!canCreateFolder) return;

    for (const srcPath of clipboard.items) {
      const srcItem = fileStore.getItem(srcPath);
      if (!srcItem) continue;

      const destinationBase = currentPath === "/" ? "" : currentPath;
      let targetPath = `${destinationBase}/${srcItem.name}`;

      // Ensure unique name if destination already exists
      if (fileStore.getItem(targetPath)) {
        const ext = srcItem.name.includes(".") ? `.${srcItem.name.split(".").pop()}` : "";
        const baseName = srcItem.name.replace(ext, "");
        let index = 1;
        let newName = `${baseName} copy${ext}`;
        targetPath = `${destinationBase}/${newName}`;
        while (fileStore.getItem(targetPath)) {
          index++;
          newName = `${baseName} copy ${index}${ext}`;
          targetPath = `${destinationBase}/${newName}`;
        }
      }

      if (clipboard.operation === "cut") {
        // Use moveFile helper which moves content as well
        if (!srcItem) continue;
        await moveFile(srcItem, currentPath);
      } else {
        // COPY operation
        if (srcItem.isDirectory) {
          // Create new root directory first
          createFolder({ path: targetPath, name: srcItem.name });

          // Recursively copy all nested items
          const allItems = Object.values(useFilesStore.getState().items);
          for (const childItem of allItems as FileSystemItem[]) {
            if (childItem.path.startsWith(srcPath + "/")) {
              const relative = childItem.path.substring(srcPath.length);
              const newChildPath = targetPath + relative;

              if (childItem.isDirectory) {
                createFolder({ path: newChildPath, name: childItem.name });
              } else {
                // Duplicate file content
                const storeName = childItem.path.startsWith("/Documents/")
                  ? STORES.DOCUMENTS
                  : childItem.path.startsWith("/Images/")
                  ? STORES.IMAGES
                  : null;

                let contentToCopy: string | Blob | undefined;
                if (storeName && childItem.uuid) {
                  contentToCopy = (await dbOperations.get<{
                    content: string | Blob;
                  }>(
                    storeName,
                    childItem.uuid
                  ))?.content;
                }

                const newUuid = uuidv4();
                const newName = childItem.name;
                const newMeta: Omit<FileSystemItem, "status"> = {
                  ...childItem,
                  path: newChildPath,
                  name: newName,
                  uuid: newUuid,
                } as Omit<FileSystemItem, "status">;

                fileStore.addItem(newMeta);

                if (storeName && contentToCopy !== undefined) {
                  await dbOperations.put(storeName, { name: newName, content: contentToCopy }, newUuid);
                }
              }
            }
          }
        } else {
          // File copy
          let contentToCopy: string | Blob | undefined;
          const storeName = srcItem.path.startsWith("/Documents/")
            ? STORES.DOCUMENTS
            : srcItem.path.startsWith("/Images/")
            ? STORES.IMAGES
            : null;

          if (storeName && srcItem.uuid) {
            contentToCopy = (await dbOperations.get<{
              content: string | Blob;
            }>(
              storeName,
              srcItem.uuid
            ))?.content;
          }

          await saveFile({
            name: targetPath.split("/").pop() || srcItem.name,
            path: targetPath,
            content: contentToCopy || "",
            type: srcItem.type,
          });
        }
      }
    }

    if (clipboard.operation === "cut") {
      fileStoreClipboard.clearClipboard();
    }
  };

  const canCut = isEditable(selectedFile);
  const canCopy = isEditable(selectedFile);
  const canPaste = Boolean(fileStoreClipboard.clipboard && canCreateFolder);

  if (!isWindowOpen) return null;

  return (
    <>
      <FinderMenuBar
        onClose={onClose}
        onShowHelp={() => setIsHelpDialogOpen(true)}
        onShowAbout={() => setIsAboutDialogOpen(true)}
        viewType={viewType}
        onViewTypeChange={setViewType}
        sortType={sortType}
        onSortTypeChange={setSortType}
        selectedFile={selectedFile}
        onMoveToTrash={moveToTrash}
        onEmptyTrash={handleEmptyTrash}
        onRestore={handleRestore}
        isTrashEmpty={trashItemsCount === 0}
        isInTrash={Boolean(selectedFile?.path.startsWith("/Trash"))}
        onNavigateBack={navigateBack}
        onNavigateForward={navigateForward}
        canNavigateBack={canNavigateBack()}
        canNavigateForward={canNavigateForward()}
        onNavigateToPath={navigateToPath}
        onImportFile={handleImportFile}
        onRename={handleRename}
        onDuplicate={handleDuplicate}
        onNewFolder={handleNewFolder}
        canCreateFolder={canCreateFolder}
        rootFolders={rootFolders}
        onNewWindow={handleNewWindow}
        onCut={handleCut}
        onCopy={handleCopy}
        onPaste={handlePaste}
        canCut={canCut}
        canCopy={canCopy}
        canPaste={canPaste}
      />
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".txt,.md,text/*"
        onChange={handleFileInputChange}
      />
      <WindowFrame
        appId="finder"
        instanceId={instanceId}
        title={
          currentPath === "/"
            ? "Macintosh HD"
            : (() => {
                // Get the last path segment and decode it
                const lastSegment =
                  currentPath.split("/").filter(Boolean).pop() || "";
                try {
                  return decodeURIComponent(lastSegment) || "Finder";
                } catch {
                  return lastSegment || "Finder";
                }
              })()
        }
        onClose={onClose}
        isForeground={isForeground}
        skipInitialSound={skipInitialSound}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
      >
        <div
          className={`flex flex-col h-full w-full bg-white relative ${
            isDraggingOver && currentPath === "/Documents"
              ? "after:absolute after:inset-0 after:bg-black/20"
              : ""
          }`}
          onDragOver={(e) => {
            // Only handle external file drags, not internal file moves
            if (
              e.dataTransfer.types.includes("Files") &&
              e.dataTransfer.files.length > 0
            ) {
              e.preventDefault();
              e.stopPropagation();
              if (!isDraggingOver && currentPath === "/Documents") {
                setIsDraggingOver(true);
              }
            }
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // Check if we're leaving to a child element
            const relatedTarget = e.relatedTarget as Node | null;
            if (e.currentTarget.contains(relatedTarget)) {
              return;
            }
            setIsDraggingOver(false);
          }}
          onDragEnd={() => setIsDraggingOver(false)}
          onMouseLeave={() => setIsDraggingOver(false)}
          onDrop={handleFileDrop}
          onContextMenu={handleBlankContextMenu}
        >
          <div className="flex flex-col gap-1 p-1 bg-gray-100 border-b border-black">
            <div className="flex gap-2 items-center">
              <div className="flex gap-0 items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={navigateBack}
                  disabled={!canNavigateBack()}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={navigateForward}
                  disabled={!canNavigateForward()}
                  className="h-8 w-8"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={navigateUp}
                  disabled={currentPath === "/"}
                  className="h-8 w-8"
                  onDragOver={(e) => {
                    // Only allow dropping if not at root and if file creation is allowed in parent directory
                    if (currentPath !== "/" && canCreateFolder) {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.classList.add("bg-black", "text-white");
                    }
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.classList.remove("bg-black", "text-white");
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.classList.remove("bg-black", "text-white");

                    // Parse the dragged file data
                    try {
                      const jsonData =
                        e.dataTransfer.getData("application/json");
                      if (jsonData) {
                        const { path, name } = JSON.parse(jsonData);
                        const sourceItem = fileStore.getItem(path);

                        if (sourceItem && currentPath !== "/") {
                          // Get parent path
                          const parentPath = getParentPath(currentPath);
                          console.log(
                            `Moving file from ${path} to ${parentPath}/${name}`
                          );
                          moveFile(sourceItem, parentPath);
                        }
                      }
                    } catch (err) {
                      console.error(
                        "Error handling drop on parent folder button:",
                        err
                      );
                    }
                  }}
                >
                  <ArrowLeft className="h-4 w-4 rotate-90" />
                </Button>
              </div>
              <Input
                ref={pathInputRef}
                value={getDisplayPath(currentPath)}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  navigateToPath(e.target.value)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    navigateToPath((e.target as HTMLInputElement).value);
                  }
                }}
                className="flex-1 !text-[16px]"
                placeholder="Enter path"
              />
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                Loading...
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full text-red-500">
                {error}
              </div>
            ) : (
              <FileList
                files={sortedFiles}
                onFileOpen={handleFileOpen}
                onFileSelect={handleFileSelect}
                selectedFile={selectedFile}
                viewType={viewType}
                getFileType={getFileType}
                onFileDrop={handleFileMoved}
                onDropToCurrentDirectory={handleDropToCurrentDirectory}
                canDropFiles={canCreateFolder}
                currentPath={currentPath}
                onRenameRequest={handleRenameRequest}
                onItemContextMenu={handleItemContextMenu}
              />
            )}
          </div>
          <div className="flex items-center justify-between px-2 py-1 text-[10px] font-geneva-12 bg-gray-100 border-t border-gray-300">
            <span>
              {sortedFiles.length} item{sortedFiles.length !== 1 ? "s" : ""}
            </span>
            <span>
              {Math.round((storageSpace.available / 1024 / 1024) * 10) / 10} MB
              available
            </span>
          </div>
        </div>
      </WindowFrame>
      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appName="Finder"
        helpItems={helpItems}
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={appMetadata}
      />
      <ConfirmDialog
        isOpen={isEmptyTrashDialogOpen}
        onOpenChange={setIsEmptyTrashDialogOpen}
        onConfirm={confirmEmptyTrash}
        title="Empty Trash"
        description="Are you sure you want to empty the Trash? This action cannot be undone."
      />
      <InputDialog
        isOpen={isRenameDialogOpen}
        onOpenChange={setIsRenameDialogOpen}
        onSubmit={handleRenameSubmit}
        title="Rename Item"
        description={`Enter a new name for "${selectedFile?.name || "item"}"`}
        value={renameValue}
        onChange={setRenameValue}
      />
      <InputDialog
        isOpen={isNewFolderDialogOpen}
        onOpenChange={setIsNewFolderDialogOpen}
        onSubmit={handleNewFolderSubmit}
        title="New Folder"
        description="Enter a name for the new folder:"
        value={newFolderName}
        onChange={setNewFolderName}
      />
      <RightClickMenu
        position={contextMenuPos}
        onClose={() => setContextMenuPos(null)}
        items={
          contextMenuFile ? fileMenuItems(contextMenuFile) : blankMenuItems
        }
      />
    </>
  );
}
