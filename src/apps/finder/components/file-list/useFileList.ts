import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { getFinderDisplayName } from "@/utils/finderDisplay";
import type { LaunchOriginRect } from "@/stores/useAppStore";
import { isTouchDevice } from "@/utils/device";
import {
  createSelectionRect,
  getIntersectingSelectionIds,
  hasToggleModifier,
  mergeSelectionIds,
  resolveMultiSelection,
  type SelectionPoint,
} from "@/utils/selection";
import type { ViewType } from "../FinderMenuBar";
import {
  getIconPath,
  isImageFile,
  shouldShowThumbnail,
} from "./fileListUtils";
import type { FileItem, FileListProps } from "./types";

export function useFileList({
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
  const {
    isWindowsTheme,
    isMacOSTheme,
  } = useThemeFlags();

  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastClickedPathRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  const handleFileOpen = useCallback(
    (file: FileItem, launchOrigin?: LaunchOriginRect) => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }

      onFileOpen(file, launchOrigin);
      onFileSelect(undefined, { selectedPaths: [], anchorPath: null });
    },
    [onFileOpen, onFileSelect]
  );

  const orderedPaths = useMemo(() => files.map((file) => file.path), [files]);

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

  const handleFileSelect = useCallback(
    (
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

      if (allowRename && !toggleKey && !shiftKey && isSinglePrimarySelection) {
        if (clickTimeoutRef.current) {
          return;
        }

        lastClickedPathRef.current = file.path;
        clickTimeoutRef.current = setTimeout(() => {
          if (onRenameRequest && lastClickedPathRef.current === file.path) {
            onRenameRequest(file);
          }
          clickTimeoutRef.current = null;
        }, 600);

        return;
      }

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
    },
    [
      applySelection,
      onRenameRequest,
      orderedPaths,
      selectedFile?.path,
      selectedFiles,
      selectionAnchorPath,
    ]
  );

  const handleDragStart = useCallback((e: React.DragEvent<HTMLElement>, file: FileItem) => {
    if (file.isDirectory) {
      e.preventDefault();
      return;
    }

    draggedFileRef.current = file;

    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({
        path: file.path,
        name: file.name,
        appId: file.appId,
      })
    );

    const target = e.currentTarget as HTMLElement;
    const clonedElement = target.cloneNode(true) as HTMLElement;

    const isIconView = viewType === "small" || viewType === "large";

    let dragImage: HTMLElement = clonedElement;

    if (isIconView) {
      const labelElement = clonedElement.querySelector(
        ".file-icon-label"
      ) as HTMLElement;
      if (labelElement) {
        labelElement.style.background = "transparent";
        labelElement.style.backgroundColor = "transparent";

        if (isMacOSTheme || isWindowsTheme) {
          labelElement.style.color = "white";
          if (isMacOSTheme) {
            labelElement.style.textShadow =
              "rgba(0, 0, 0, 0.9) 0px 1px 0px, rgba(0, 0, 0, 0.85) 0px 1px 3px, rgba(0, 0, 0, 0.45) 0px 2px 3px";
          } else if (isWindowsTheme) {
            labelElement.style.textShadow = "1px 1px 2px rgba(0, 0, 0, 0.8)";
          }
        }
      }

      clonedElement.style.background = "transparent";
      clonedElement.style.backgroundColor = "transparent";
    } else {
      const originalWidth = target.offsetWidth;

      if (clonedElement.tagName === "TR") {
        const table = document.createElement("table");
        table.style.width = `${originalWidth}px`;
        table.style.borderCollapse = "collapse";
        table.style.tableLayout = "auto";
        const tbody = document.createElement("tbody");
        tbody.appendChild(clonedElement);
        table.appendChild(tbody);
        dragImage = table;
      } else {
        clonedElement.style.width = `${originalWidth}px`;
        clonedElement.style.minWidth = `${originalWidth}px`;
        clonedElement.style.maxWidth = `${originalWidth}px`;
      }

      clonedElement.style.whiteSpace = "nowrap";
      clonedElement.style.display = clonedElement.style.display || "table-row";

      const cells = clonedElement.querySelectorAll("td");
      cells.forEach((cell) => {
        const cellEl = cell as HTMLElement;
        cellEl.style.width = "auto";
        cellEl.style.minWidth = "0";
        cellEl.style.maxWidth = "none";
        cellEl.style.visibility = "visible";

        if (cellEl.classList.contains("flex")) {
          cellEl.style.display = "flex";
          cellEl.style.flexWrap = "nowrap";
          cellEl.style.whiteSpace = "nowrap";
          const flexChildren = Array.from(cellEl.children);
          flexChildren.forEach((child) => {
            const childEl = child as HTMLElement;
            childEl.style.whiteSpace = "nowrap";
            childEl.style.flexShrink = "0";
            if (childEl.textContent) {
              childEl.style.display = "inline-block";
            }
          });
        } else {
          cellEl.style.display = "table-cell";
          cellEl.style.whiteSpace = "nowrap";
        }

        if (cellEl.classList.contains("whitespace-nowrap")) {
          cellEl.style.whiteSpace = "nowrap";
        }
      });
    }

    dragImage.style.position = "absolute";
    dragImage.style.top = "-1000px";
    dragImage.style.left = "-1000px";
    document.body.appendChild(dragImage);

    e.dataTransfer.setDragImage(
      dragImage,
      e.nativeEvent.offsetX,
      e.nativeEvent.offsetY
    );

    setTimeout(() => {
      if (document.body.contains(dragImage)) {
        document.body.removeChild(dragImage);
      }
    }, 0);
  }, [isMacOSTheme, isWindowsTheme, viewType]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLElement>, file: FileItem) => {
    if (
      file.isDirectory &&
      canDropFiles &&
      draggedFileRef.current &&
      draggedFileRef.current.path !== file.path
    ) {
      e.preventDefault();
      setDropTargetPath(file.path);
    }
  }, [canDropFiles]);

  const handleDragLeave = useCallback(() => {
    setDropTargetPath(null);
  }, []);

  const handleDrop = useCallback((
    e: React.DragEvent<HTMLElement>,
    targetFolder: FileItem
  ) => {
    e.preventDefault();

    setDropTargetPath(null);

    if (!draggedFileRef.current || !onFileDrop || !targetFolder.isDirectory) {
      draggedFileRef.current = null;
      return;
    }

    if (
      draggedFileRef.current.path === targetFolder.path ||
      targetFolder.path.startsWith(draggedFileRef.current.path + "/")
    ) {
      draggedFileRef.current = null;
      return;
    }

    onFileDrop(draggedFileRef.current, targetFolder);
    draggedFileRef.current = null;
  }, [onFileDrop]);

  const handleDragEnd = useCallback(() => {
    draggedFileRef.current = null;
    setDropTargetPath(null);
  }, []);

  const handleContainerDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    if (
      canDropFiles &&
      draggedFileRef.current &&
      (currentPath === "/Documents" || currentPath === "/Images")
    ) {
      e.preventDefault();
    }
  }, [canDropFiles, currentPath]);

  const handleContainerDragLeave = useCallback(() => {}, []);

  const handleContainerDrop = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();

    if (dropTargetPath) {
      setDropTargetPath(null);
      return;
    }

    if (
      draggedFileRef.current &&
      onDropToCurrentDirectory &&
      (currentPath === "/Documents" || currentPath === "/Images")
    ) {
      onDropToCurrentDirectory(draggedFileRef.current);
    }

    draggedFileRef.current = null;
  }, [currentPath, dropTargetPath, onDropToCurrentDirectory]);

  const getDisplayName = useCallback(
    (file: FileItem): string => getFinderDisplayName(file),
    []
  );
  const getListIconAlt = useCallback(
    (file: FileItem): string =>
      file.isDirectory
        ? t("apps.finder.fileTypes.directory")
        : t("apps.finder.fileTypes.file"),
    [t]
  );

  const renderedSelectionRect =
    selectionRect &&
    containerRef.current &&
    createSelectionRect(selectionRect.start, selectionRect.end);
  const containerRect = containerRef.current?.getBoundingClientRect();
  const listTableKey = files.length === 0 ? "empty" : "populated";

  const selectionMarqueeProps =
    renderedSelectionRect && containerRect
      ? {
          left: renderedSelectionRect.left - containerRect.left,
          top: renderedSelectionRect.top - containerRect.top,
          width: renderedSelectionRect.right - renderedSelectionRect.left,
          height: renderedSelectionRect.bottom - renderedSelectionRect.top,
        }
      : null;

  const containerDragHandlers = useMemo(
    () => ({
      onDragOver: handleContainerDragOver,
      onDragLeave: handleContainerDragLeave,
      onDrop: handleContainerDrop,
      onMouseDown: handleBlankMouseDown,
    }),
    [
      handleBlankMouseDown,
      handleContainerDragLeave,
      handleContainerDragOver,
      handleContainerDrop,
    ]
  );

  const itemDragHandlers = useMemo(
    () => ({
      onDragStart: handleDragStart,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
      onDragEnd: handleDragEnd,
    }),
    [
      handleDragEnd,
      handleDragLeave,
      handleDragOver,
      handleDragStart,
      handleDrop,
    ]
  );

  return {
    files,
    viewType: viewType as ViewType,
    isMacOSTheme,
    dropTargetPath,
    selectedFiles,
    containerRef,
    listTableKey,
    selectionMarqueeProps,
    onItemContextMenu,
    handleFileOpen,
    handleFileSelect,
    getFileType,
    getIconPath,
    getDisplayName,
    getListIconAlt,
    shouldShowThumbnail,
    isImageFile,
    containerDragHandlers,
    itemDragHandlers,
    t,
  };
}

export type FileListViewModel = ReturnType<typeof useFileList>;
