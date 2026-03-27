import { FileIcon } from "./FileIcon";
import { ViewType } from "./FinderMenuBar";
import { useSound, Sounds } from "@/hooks/useSound";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { useState, useRef, useEffect, memo, useCallback } from "react";
import { useLongPress } from "@/hooks/useLongPress";
import { isTouchDevice } from "@/utils/device";
import { getFinderDisplayName } from "@/utils/finderDisplay";
import { useThemeStore } from "@/stores/useThemeStore";
import type { LaunchOriginRect } from "@/stores/useAppStore";
import { useTranslation } from "react-i18next";
import { isWindowsTheme } from "@/themes";
import {
  createSelectionRect,
  getIntersectingSelectionIds,
  hasToggleModifier,
  mergeSelectionIds,
  resolveMultiSelection,
  type SelectionPoint,
} from "@/utils/selection";

export interface FileItem {
  name: string;
  isDirectory: boolean;
  path: string;
  icon?: string;
  appId?: string; // For application files
  content?: string | Blob; // For document files or images
  contentUrl?: string; // For blob URLs
  size?: number; // File size in bytes
  modifiedAt?: Date; // Last modified date
  type?: string;
  aliasType?: "file" | "app"; // For desktop shortcuts/aliases
  aliasTarget?: string; // Target path or appId for aliases
}

interface FileListProps {
  files: FileItem[];
  onFileOpen: (file: FileItem, launchOrigin?: LaunchOriginRect) => void;
  onFileSelect: (
    file: FileItem | undefined,
    options?: {
      selectedPaths?: string[];
      anchorPath?: string | null;
    }
  ) => void;
  selectedFile?: FileItem;
  selectedFiles?: string[];
  selectionAnchorPath?: string | null;
  viewType?: ViewType;
  getFileType: (file: FileItem) => string;
  onFileDrop?: (sourceFile: FileItem, targetFolder: FileItem) => void;
  onDropToCurrentDirectory?: (sourceFile: FileItem) => void;
  canDropFiles?: boolean;
  currentPath?: string;
  onRenameRequest?: (file: FileItem) => void;
  onItemContextMenu?: (file: FileItem, e: React.MouseEvent) => void;
}

// Memoized list row item for table view
interface ListRowItemProps {
  file: FileItem;
  selectedFiles: string[];
  dropTargetPath: string | null;
  onItemContextMenu?: (file: FileItem, e: React.MouseEvent) => void;
  onFileOpen: (file: FileItem, launchOrigin?: LaunchOriginRect) => void;
  onFileSelect: (
    file: FileItem,
    event: React.MouseEvent<HTMLElement>,
    options?: { allowRename?: boolean }
  ) => void;
  onDragStart: (e: React.DragEvent<HTMLElement>, file: FileItem) => void;
  onDragOver: (e: React.DragEvent<HTMLElement>, file: FileItem) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLElement>, file: FileItem) => void;
  onDragEnd: () => void;
  getIconPath: (file: FileItem) => string;
  getDisplayName: (file: FileItem) => string;
  getFileType: (file: FileItem) => string;
  shouldShowThumbnail: (file: FileItem) => boolean;
  isImageFile: (file: FileItem) => boolean;
}

const ListRowItem = memo(function ListRowItem({
  file,
  selectedFiles,
  dropTargetPath,
  onItemContextMenu,
  onFileOpen,
  onFileSelect,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  getIconPath,
  getDisplayName,
  getFileType,
  shouldShowThumbnail,
  isImageFile,
}: ListRowItemProps) {
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);
  const lastClickSoundRef = useRef(0);
  const CLICK_SOUND_COOLDOWN_MS = 400;

  const longPressHandlers = useLongPress((touchEvent) => {
    if (onItemContextMenu) {
      const touch = touchEvent.touches[0];
      onItemContextMenu(file, {
        preventDefault: () => {},
        stopPropagation: () => {},
        clientX: touch.clientX,
        clientY: touch.clientY,
      } as unknown as React.MouseEvent);
    }
  });

  const handleClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    const now = Date.now();
    if (now - lastClickSoundRef.current >= CLICK_SOUND_COOLDOWN_MS) {
      lastClickSoundRef.current = now;
      playClick();
    }
    if (isTouchDevice()) {
      const rect = e.currentTarget.getBoundingClientRect();
      const launchOrigin: LaunchOriginRect = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      };
      onFileOpen(file, launchOrigin);
    } else {
      onFileSelect(file, e);
    }
  };

  const isSelected = selectedFiles.includes(file.path);

  const handleDoubleClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    const now = Date.now();
    if (now - lastClickSoundRef.current >= CLICK_SOUND_COOLDOWN_MS) {
      lastClickSoundRef.current = now;
      playClick();
    }
    if (!isTouchDevice()) {
      const rect = e.currentTarget.getBoundingClientRect();
      const launchOrigin: LaunchOriginRect = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      };
      onFileOpen(file, launchOrigin);
    }
  };

  return (
    <TableRow
      className={`border-none cursor-default ${
        isSelected || dropTargetPath === file.path
          ? ""
          : "odd:bg-gray-200/50 hover:bg-gray-100/50 transition-colors"
      }`}
      data-selected={isSelected || dropTargetPath === file.path ? "true" : undefined}
      onClick={handleClick}
      onMouseDown={(e) => {
        if (
          e.button === 0 &&
          !file.isDirectory &&
          (!isSelected || e.shiftKey || hasToggleModifier(e))
        ) {
          onFileSelect(file, e, { allowRename: false });
        }
      }}
      onContextMenu={(e: React.MouseEvent) => {
        if (onItemContextMenu) {
          onItemContextMenu(file, e);
        }
      }}
      onDoubleClick={handleDoubleClick}
      draggable={!file.isDirectory}
      onDragStart={(e) => onDragStart(e, file)}
      onDragOver={(e) => onDragOver(e, file)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, file)}
      onDragEnd={onDragEnd}
      data-file-item="true"
      data-file-path={file.path}
      {...(isTouchDevice() ? longPressHandlers : {})}
    >
      <TableCell className="flex items-center gap-2">
        {file.icon &&
        !(file.icon.startsWith("/") || file.icon.startsWith("http")) ? (
          <span
            className="inline-flex items-center justify-center leading-none"
            style={{ fontSize: 14, lineHeight: 1, width: 16, height: 16 }}
            aria-hidden
          >
            {file.icon}
          </span>
        ) : file.contentUrl && shouldShowThumbnail(file) ? (
          <img
            src={file.contentUrl}
            alt={file.name}
            className="w-4 h-4 object-cover rounded-sm"
            style={{ imageRendering: isImageFile(file) ? "pixelated" : "auto" }}
            onError={(e) => {
              console.error(`Error loading thumbnail for ${file.name}`);
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <ThemedIcon
            name={getIconPath(file)}
            alt={file.isDirectory ? "Directory" : "File"}
            className="w-4 h-4"
            style={{ imageRendering: "pixelated" }}
            data-legacy-aware="true"
          />
        )}
        {getDisplayName(file)}
      </TableCell>
      <TableCell>{getFileType(file)}</TableCell>
      <TableCell className="whitespace-nowrap">
        {file.size
          ? file.size < 1024
            ? `${file.size} B`
            : file.size < 1024 * 1024
            ? `${(file.size / 1024).toFixed(1)} KB`
            : `${(file.size / (1024 * 1024)).toFixed(1)} MB`
          : "--"}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {file.modifiedAt
          ? new Date(file.modifiedAt).toLocaleDateString()
          : "--"}
      </TableCell>
    </TableRow>
  );
});

// Memoized grid item for icon view
interface GridItemProps {
  file: FileItem;
  selectedFiles: string[];
  dropTargetPath: string | null;
  viewType: ViewType;
  onItemContextMenu?: (file: FileItem, e: React.MouseEvent) => void;
  onFileOpen: (file: FileItem, launchOrigin?: LaunchOriginRect) => void;
  onFileSelect: (
    file: FileItem,
    event: React.MouseEvent<HTMLElement>,
    options?: { allowRename?: boolean }
  ) => void;
  onDragStart: (e: React.DragEvent<HTMLElement>, file: FileItem) => void;
  onDragOver: (e: React.DragEvent<HTMLElement>, file: FileItem) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLElement>, file: FileItem) => void;
  onDragEnd: () => void;
  getDisplayName: (file: FileItem) => string;
  shouldShowThumbnail: (file: FileItem) => boolean;
  isImageFile: (file: FileItem) => boolean;
}

const GridItem = memo(function GridItem({
  file,
  selectedFiles,
  dropTargetPath,
  viewType,
  onItemContextMenu,
  onFileOpen,
  onFileSelect,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  getDisplayName,
  shouldShowThumbnail,
  isImageFile,
}: GridItemProps) {
  const isSelected = selectedFiles.includes(file.path);

  const longPressHandlers = useLongPress((touchEvent) => {
    if (onItemContextMenu) {
      const touch = touchEvent.touches[0];
      onItemContextMenu(file, {
        preventDefault: () => {},
        stopPropagation: () => {},
        clientX: touch.clientX,
        clientY: touch.clientY,
      } as unknown as React.MouseEvent);
    }
  });

  return (
    <div
      onMouseDown={(e) => {
        if (
          e.button === 0 &&
          !file.isDirectory &&
          (!isSelected || e.shiftKey || hasToggleModifier(e))
        ) {
          onFileSelect(file, e, { allowRename: false });
        }
      }}
      draggable={!file.isDirectory}
      onDragStart={(e) => onDragStart(e, file)}
      onDragOver={(e) => onDragOver(e, file)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, file)}
      onDragEnd={onDragEnd}
      className="transition-all duration-75"
      onContextMenu={(e: React.MouseEvent) => {
        if (onItemContextMenu) {
          onItemContextMenu(file, e);
        }
      }}
      data-file-item="true"
      data-file-path={file.path}
      {...(isTouchDevice() ? longPressHandlers : {})}
    >
      <FileIcon
        name={getDisplayName(file)}
        isDirectory={file.isDirectory}
        icon={file.icon}
        content={isImageFile(file) ? file.content : undefined}
        contentUrl={shouldShowThumbnail(file) ? file.contentUrl : undefined}
        onDoubleClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const launchOrigin: LaunchOriginRect = {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          };
          onFileOpen(file, launchOrigin);
        }}
        onClick={(e) => onFileSelect(file, e)}
        isSelected={isSelected}
        isDropTarget={dropTargetPath === file.path}
        size={viewType === "large" ? "large" : "small"}
        context="finder"
      />
    </div>
  );
});

export function FileList({
  files,
  onFileOpen,
  onFileSelect,
  selectedFile,
  selectedFiles = [],
  selectionAnchorPath,
  viewType = "small",
  getFileType,
  onFileDrop,
  onDropToCurrentDirectory,
  canDropFiles = false,
  currentPath = "/",
  onRenameRequest,
  onItemContextMenu,
}: FileListProps) {
  const { t } = useTranslation();
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const draggedFileRef = useRef<FileItem | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const marqueeStartRef = useRef<SelectionPoint | null>(null);
  const marqueeBaseSelectionRef = useRef<string[]>([]);
  const marqueeAdditiveRef = useRef(false);
  const [selectionRect, setSelectionRect] = useState<{
    start: SelectionPoint;
    end: SelectionPoint;
  } | null>(null);
  const currentTheme = useThemeStore((state) => state.current);
  const isMacOSXTheme = currentTheme === "macosx";
  const isXpTheme = isWindowsTheme(currentTheme);

  // Add refs for rename timing
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastClickedPathRef = useRef<string | null>(null);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  const handleFileOpen = (file: FileItem, launchOrigin?: LaunchOriginRect) => {
    // Clear any pending rename timeout when opening a file
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }

    onFileOpen(file, launchOrigin);
    onFileSelect(undefined, { selectedPaths: [], anchorPath: null });
  };

  const orderedPaths = files.map((file) => file.path);

  const applySelection = useCallback(
    (
      nextSelectedPaths: string[],
      primaryPath: string | null,
      anchorPath: string | null
    ) => {
      const nextPrimaryFile = primaryPath
        ? files.find((candidate) => candidate.path === primaryPath)
        : undefined;
      onFileSelect(nextPrimaryFile, {
        selectedPaths: nextSelectedPaths,
        anchorPath,
      });
    },
    [files, onFileSelect]
  );

  const updateSelectionFromMarquee = useCallback(
    (start: SelectionPoint, end: SelectionPoint) => {
      const container = containerRef.current;
      if (!container) return;

      const intersectingPaths = getIntersectingSelectionIds(
        createSelectionRect(start, end),
        Array.from(
          container.querySelectorAll<HTMLElement>("[data-file-path]")
        ).map((element) => ({
          id: element.dataset.filePath || "",
          rect: {
            left: element.getBoundingClientRect().left,
            top: element.getBoundingClientRect().top,
            right: element.getBoundingClientRect().right,
            bottom: element.getBoundingClientRect().bottom,
          },
        }))
      ).filter(Boolean);

      const nextSelectedPaths = marqueeAdditiveRef.current
        ? mergeSelectionIds(
            orderedPaths,
            marqueeBaseSelectionRef.current,
            intersectingPaths
          )
        : intersectingPaths;
      const primaryPath = nextSelectedPaths[nextSelectedPaths.length - 1] ?? null;
      const anchorPath = primaryPath;

      applySelection(nextSelectedPaths, primaryPath, anchorPath);
    },
    [applySelection, orderedPaths]
  );

  const handleBlankMouseDown = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (event.button !== 0 || isTouchDevice()) return;
      const target = event.target as HTMLElement;
      if (target.closest("[data-file-item]")) return;

      const start = { x: event.clientX, y: event.clientY };
      marqueeStartRef.current = start;
      marqueeBaseSelectionRef.current = selectedFiles;
      marqueeAdditiveRef.current = event.shiftKey || hasToggleModifier(event);
      setSelectionRect({ start, end: start });
    },
    [selectedFiles]
  );

  useEffect(() => {
    if (!selectionRect || !marqueeStartRef.current) return;

    const handleMouseMove = (event: MouseEvent) => {
      const start = marqueeStartRef.current;
      if (!start) return;

      const end = { x: event.clientX, y: event.clientY };
      setSelectionRect({ start, end });
      updateSelectionFromMarquee(start, end);
    };

    const handleMouseUp = (event: MouseEvent) => {
      const start = marqueeStartRef.current;
      const end = { x: event.clientX, y: event.clientY };
      const movedEnough =
        Math.abs(end.x - start!.x) > 3 || Math.abs(end.y - start!.y) > 3;

      if (movedEnough) {
        updateSelectionFromMarquee(start!, end);
      } else if (!marqueeAdditiveRef.current) {
        applySelection([], null, null);
      }

      marqueeStartRef.current = null;
      setSelectionRect(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp, { once: true });

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [applySelection, selectionRect, updateSelectionFromMarquee]);

  const handleFileSelect = (
    file: FileItem,
    event: React.MouseEvent<HTMLElement>,
    options?: { allowRename?: boolean }
  ) => {
    const allowRename = options?.allowRename !== false;
    const toggleKey = hasToggleModifier(event);
    const shiftKey = event.shiftKey;
    const isSinglePrimarySelection =
      selectedFile?.path === file.path &&
      selectedFiles.length === 1 &&
      selectedFiles[0] === file.path;

    // If user clicks on the already selected primary file without modifiers,
    // treat a delayed second click as a rename request.
    if (allowRename && !toggleKey && !shiftKey && isSinglePrimarySelection) {
      // If rename is already pending, don't set another timeout
      if (clickTimeoutRef.current) {
        return;
      }

      // Start a timeout to trigger rename after a short delay (600ms)
      lastClickedPathRef.current = file.path;
      clickTimeoutRef.current = setTimeout(() => {
        // Only trigger rename if this is still the selected file
        if (onRenameRequest && lastClickedPathRef.current === file.path) {
          onRenameRequest(file);
        }
        clickTimeoutRef.current = null;
      }, 600);

      return;
    }

    // If clicking on a different file, cancel any pending rename and update selection
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }

    lastClickedPathRef.current = file.path;
    const nextSelection = resolveMultiSelection({
      orderedIds: orderedPaths,
      currentSelectedIds: selectedFiles,
      clickedId: file.path,
      anchorId:
        selectionAnchorPath || selectedFile?.path || selectedFiles[0] || null,
      modifiers: {
        shiftKey,
        toggleKey,
      },
    });

    applySelection(
      nextSelection.selectedIds,
      nextSelection.primaryId,
      nextSelection.anchorId
    );
  };

  const handleDragStart = (e: React.DragEvent<HTMLElement>, file: FileItem) => {
    // Only allow dragging files, not folders
    if (file.isDirectory) {
      e.preventDefault();
      return;
    }

    // Store the dragged file
    draggedFileRef.current = file;

    // Set drag data
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({
        path: file.path,
        name: file.name,
        appId: file.appId, // Include appId for applications
      })
    );

    // Create a clean drag image
    const target = e.currentTarget as HTMLElement;
    const clonedElement = target.cloneNode(true) as HTMLElement;
    
    // Check if this is icon view (small/large) vs list view
    const isIconView = viewType === "small" || viewType === "large";
    
    let dragImage: HTMLElement = clonedElement;
    
    if (isIconView) {
      // For icon view: apply desktop-style transparent background and text shadows
      const labelElement = clonedElement.querySelector('.file-icon-label') as HTMLElement;
      if (labelElement) {
        labelElement.style.background = 'transparent';
        labelElement.style.backgroundColor = 'transparent';
        
        // Apply the same text shadow styles as desktop shortcuts
        if (isMacOSXTheme || isXpTheme) {
          labelElement.style.color = 'white';
          if (isMacOSXTheme) {
            labelElement.style.textShadow =
              'rgba(0, 0, 0, 0.9) 0px 1px 0px, rgba(0, 0, 0, 0.85) 0px 1px 3px, rgba(0, 0, 0, 0.45) 0px 2px 3px';
          } else if (isXpTheme) {
            labelElement.style.textShadow = '1px 1px 2px rgba(0, 0, 0, 0.8)';
          }
        }
      }
      
      // Make the container background transparent too
      clonedElement.style.background = 'transparent';
      clonedElement.style.backgroundColor = 'transparent';
    } else {
      // For list view: retain original styling and fix width to match original
      const originalWidth = target.offsetWidth;
      
      // Ensure table structure is maintained - wrap in table/tbody if needed
      if (clonedElement.tagName === 'TR') {
        // If it's a table row, ensure it has proper table structure
        const table = document.createElement('table');
        table.style.width = `${originalWidth}px`;
        table.style.borderCollapse = 'collapse';
        table.style.tableLayout = 'auto';
        const tbody = document.createElement('tbody');
        tbody.appendChild(clonedElement);
        table.appendChild(tbody);
        dragImage = table;
      } else {
        clonedElement.style.width = `${originalWidth}px`;
        clonedElement.style.minWidth = `${originalWidth}px`;
        clonedElement.style.maxWidth = `${originalWidth}px`;
      }
      
      clonedElement.style.whiteSpace = 'nowrap';
      clonedElement.style.display = clonedElement.style.display || 'table-row';
      
      // Ensure table cells maintain their width and visibility
      const cells = clonedElement.querySelectorAll('td');
      cells.forEach((cell) => {
        const cellEl = cell as HTMLElement;
        cellEl.style.width = 'auto';
        cellEl.style.minWidth = '0';
        cellEl.style.maxWidth = 'none';
        cellEl.style.visibility = 'visible';
        
        // For flex containers (like the first cell with icon and name), prevent wrapping
        if (cellEl.classList.contains('flex')) {
          // Keep flex display but ensure it doesn't wrap
          cellEl.style.display = 'flex';
          cellEl.style.flexWrap = 'nowrap';
          cellEl.style.whiteSpace = 'nowrap';
          // Ensure flex children don't wrap and stay on one line
          const flexChildren = Array.from(cellEl.children);
          flexChildren.forEach((child) => {
            const childEl = child as HTMLElement;
            childEl.style.whiteSpace = 'nowrap';
            childEl.style.flexShrink = '0';
            // Ensure text content doesn't wrap
            if (childEl.textContent) {
              childEl.style.display = 'inline-block';
            }
          });
        } else {
          // For non-flex cells, use table-cell display
          cellEl.style.display = 'table-cell';
          cellEl.style.whiteSpace = 'nowrap';
        }
        
        // Preserve whitespace-nowrap on cells that have it
        if (cellEl.classList.contains('whitespace-nowrap')) {
          cellEl.style.whiteSpace = 'nowrap';
        }
      });
    }
    
    // Position off-screen and add to DOM temporarily
    dragImage.style.position = "absolute";
    dragImage.style.top = "-1000px";
    dragImage.style.left = "-1000px";
    document.body.appendChild(dragImage);
    
    // Set drag image
    e.dataTransfer.setDragImage(dragImage, e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    
    // Clean up after a short delay
    setTimeout(() => {
      if (document.body.contains(dragImage)) {
        document.body.removeChild(dragImage);
      }
    }, 0);
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>, file: FileItem) => {
    // Only allow dropping onto directories and only if canDropFiles is true
    if (
      file.isDirectory &&
      canDropFiles &&
      draggedFileRef.current &&
      draggedFileRef.current.path !== file.path
    ) {
      e.preventDefault();
      setDropTargetPath(file.path);
    }
  };

  const handleDragLeave = () => {
    setDropTargetPath(null);
  };

  const handleDrop = (
    e: React.DragEvent<HTMLElement>,
    targetFolder: FileItem
  ) => {
    e.preventDefault();

    // Reset states
    setDropTargetPath(null);

    // Only process if we have a dragged file and onFileDrop handler
    if (!draggedFileRef.current || !onFileDrop || !targetFolder.isDirectory) {
      draggedFileRef.current = null;
      return;
    }

    // Prevent dropping a folder into itself or its descendant
    if (
      draggedFileRef.current.path === targetFolder.path ||
      targetFolder.path.startsWith(draggedFileRef.current.path + "/")
    ) {
      draggedFileRef.current = null;
      return;
    }

    // Call the handler with source and target
    onFileDrop(draggedFileRef.current, targetFolder);
    draggedFileRef.current = null;
  };

  const handleDragEnd = () => {
    draggedFileRef.current = null;
    setDropTargetPath(null);
  };

  // Handlers for container-level drag events
  const handleContainerDragOver = (e: React.DragEvent<HTMLElement>) => {
    if (
      canDropFiles &&
      draggedFileRef.current &&
      (currentPath === "/Documents" || currentPath === "/Images")
    ) {
      e.preventDefault();
    }
  };

  const handleContainerDragLeave = () => {
    // Only needed for type compatibility, no state change required
  };

  const handleContainerDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();

    // If already processed by a folder drop handler, don't double process
    if (dropTargetPath) {
      setDropTargetPath(null);
      return;
    }

    // Process drop on the container
    if (
      draggedFileRef.current &&
      onDropToCurrentDirectory &&
      (currentPath === "/Documents" || currentPath === "/Images")
    ) {
      onDropToCurrentDirectory(draggedFileRef.current);
    }

    draggedFileRef.current = null;
  };

  // Add a helper function to detect image files
  const isImageFile = (file: FileItem): boolean => {
    // Check by extension first
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext || "")) {
      return true;
    }

    // Then check by type
    if (
      file.type?.startsWith("image") ||
      file.type === "png" ||
      file.type === "jpg" ||
      file.type === "jpeg" ||
      file.type === "gif" ||
      file.type === "webp" ||
      file.type === "bmp"
    ) {
      return true;
    }

    return false;
  };

  // Add a helper function to detect music files
  const isMusicFile = (file: FileItem): boolean => {
    // Check by extension first
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (["mp3", "m4a", "wav", "aac", "flac", "ogg"].includes(ext || "")) {
      return true;
    }

    // Then check by type
    if (file.type === "Music") {
      return true;
    }

    return false;
  };

  // Helper to check if file should show a thumbnail (image or music with cover)
  const shouldShowThumbnail = (file: FileItem): boolean => {
    return isImageFile(file) || (isMusicFile(file) && !!file.contentUrl);
  };

  // Helper to resolve icon path (legacy-aware names, works with ThemedIcon)
  const getIconPath = (file: FileItem) => {
    if (file.icon) return file.icon;
    if (file.isDirectory) return "/icons/directory.png"; // logical name; ThemedIcon will theme it
    if (file.name.endsWith(".txt") || file.name.endsWith(".md"))
      return "/icons/file-text.png";
    return "/icons/file.png";
  };

  // Helper to compute display name. For Finder applets in /Applets ending with .app, hide extension
  // Also hide extensions for desktop shortcuts
  // For folders, use translated names
  const getDisplayName = (file: FileItem): string => getFinderDisplayName(file);
  const renderedSelectionRect =
    selectionRect &&
    containerRef.current &&
    createSelectionRect(selectionRect.start, selectionRect.end);
  const containerRect = containerRef.current?.getBoundingClientRect();

  // ------------------- Render -------------------

  if (viewType === "list") {
    return (
      <div
        ref={containerRef}
        className="relative font-geneva-12"
        onDragOver={handleContainerDragOver}
        onDragLeave={handleContainerDragLeave}
        onDrop={handleContainerDrop}
        onMouseDown={handleBlankMouseDown}
      >
        <Table className="min-w-[480px]">
          <TableHeader>
            <TableRow className="text-[10px] border-none font-normal">
              <TableHead className="font-normal bg-gray-100/50 h-[28px]">
                {t("apps.finder.tableHeaders.name")}
              </TableHead>
              <TableHead className="font-normal bg-gray-100/50 h-[28px]">
                {t("apps.finder.tableHeaders.type")}
              </TableHead>
              <TableHead className="font-normal bg-gray-100/50 h-[28px] whitespace-nowrap">
                {t("apps.finder.tableHeaders.size")}
              </TableHead>
              <TableHead className="font-normal bg-gray-100/50 h-[28px] whitespace-nowrap">
                {t("apps.finder.tableHeaders.modified")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-[11px]">
            {files.map((file) => (
              <ListRowItem
                key={file.path}
                file={file}
                selectedFiles={selectedFiles}
                dropTargetPath={dropTargetPath}
                onItemContextMenu={onItemContextMenu}
                onFileOpen={handleFileOpen}
                onFileSelect={handleFileSelect}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                getIconPath={getIconPath}
                getDisplayName={getDisplayName}
                getFileType={getFileType}
                shouldShowThumbnail={shouldShowThumbnail}
                isImageFile={isImageFile}
              />
            ))}
          </TableBody>
        </Table>
        {renderedSelectionRect && containerRect ? (
          <div
            className="pointer-events-none absolute z-10 border"
            style={{
              left: renderedSelectionRect.left - containerRect.left,
              top: renderedSelectionRect.top - containerRect.top,
              width:
                renderedSelectionRect.right - renderedSelectionRect.left,
              height:
                renderedSelectionRect.bottom - renderedSelectionRect.top,
              borderColor: "rgba(128, 128, 128, 0.6)",
              backgroundColor: "rgba(128, 128, 128, 0.15)",
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`grid ${
        viewType === "large"
          ? "grid-cols-[repeat(auto-fit,minmax(96px,1fr))]"
          : "grid-cols-[repeat(auto-fit,minmax(80px,1fr))]"
      } gap-x-3 gap-y-3 p-3 min-h-[150px] ${
        files.length <= 1 ? "justify-items-start" : "justify-items-center"
      } relative`}
      onDragOver={handleContainerDragOver}
      onDragLeave={handleContainerDragLeave}
      onDrop={handleContainerDrop}
      onMouseDown={handleBlankMouseDown}
    >
      {files.map((file) => (
        <GridItem
          key={file.path}
          file={file}
          selectedFiles={selectedFiles}
          dropTargetPath={dropTargetPath}
          viewType={viewType}
          onItemContextMenu={onItemContextMenu}
          onFileOpen={handleFileOpen}
          onFileSelect={handleFileSelect}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          getDisplayName={getDisplayName}
          shouldShowThumbnail={shouldShowThumbnail}
          isImageFile={isImageFile}
        />
      ))}
      {renderedSelectionRect && containerRect ? (
        <div
          className="pointer-events-none absolute z-10 border"
          style={{
            left: renderedSelectionRect.left - containerRect.left,
            top: renderedSelectionRect.top - containerRect.top,
            width: renderedSelectionRect.right - renderedSelectionRect.left,
            height:
              renderedSelectionRect.bottom - renderedSelectionRect.top,
            borderColor: "rgba(128, 128, 128, 0.6)",
            backgroundColor: "rgba(128, 128, 128, 0.15)",
          }}
        />
      ) : null}
    </div>
  );
}
