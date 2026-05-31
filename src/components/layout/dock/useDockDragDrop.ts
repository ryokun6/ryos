import { useCallback, useEffect, useRef, useState } from "react";
import type { AppId } from "@/config/appRegistry";
import { appRegistry } from "@/config/appRegistry";
import { PROTECTED_DOCK_ITEMS, type DockItem } from "@/stores/useDockStore";
import type { FileSystemItem } from "@/stores/useFilesStore";

const REORDER_DELAY = 150;
const REORDER_COOLDOWN = 300;
const SWAP_THRESHOLD = 0.65;

export interface UseDockDragDropParams {
  pinnedItems: DockItem[];
  effectiveDockScale: number;
  scaledPadding: number;
  getFileItem: (path: string) => FileSystemItem | undefined;
  addDockItem: (item: DockItem, index?: number) => boolean;
  removeDockItem: (id: string) => void;
  reorderItems: (fromIndex: number, toIndex: number) => void;
  dockBarRef: React.RefObject<HTMLDivElement | null>;
  iconRefsMap: React.RefObject<Map<string, HTMLDivElement>>;
}

export function useDockDragDrop({
  pinnedItems,
  effectiveDockScale,
  scaledPadding,
  getFileItem,
  addDockItem,
  removeDockItem,
  reorderItems,
  dockBarRef,
  iconRefsMap,
}: UseDockDragDropParams) {
  const [externalDragIndex, setExternalDragIndex] = useState<number | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [isDraggedOutside, setIsDraggedOutside] = useState(false);
  const [isDividerDropTarget, setIsDividerDropTarget] = useState(false);

  const calculateDropIndex = useCallback(
    (clientX: number): number => {
      const dockBar = dockBarRef.current;
      if (!dockBar) return pinnedItems.length;

      const dockRect = dockBar.getBoundingClientRect();

      if (pinnedItems.length === 0) return 0;

      const iconWidth = Math.round(56 * effectiveDockScale);
      const startX = dockRect.left + scaledPadding;
      const relativeX = clientX - startX;
      const slotIndex = Math.floor(relativeX / iconWidth);

      return Math.max(0, Math.min(slotIndex, pinnedItems.length));
    },
    [pinnedItems.length, effectiveDockScale, scaledPadding, dockBarRef],
  );

  const isExternalDrag = useCallback((e: React.DragEvent): boolean => {
    const types = Array.from(e.dataTransfer.types);
    return types.includes("application/json") && !types.includes("application/x-dock-item");
  }, []);

  const handleDockDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();

      if (!isExternalDrag(e)) return;

      const dropIndex = calculateDropIndex(e.clientX);
      setExternalDragIndex(dropIndex);
    },
    [calculateDropIndex, isExternalDrag],
  );

  const handleDockDragEnter = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!isExternalDrag(e)) return;
      setExternalDragIndex((prev) => prev ?? pinnedItems.length);
    },
    [isExternalDrag, pinnedItems.length],
  );

  const handleDockDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!isExternalDrag(e)) return;
      setExternalDragIndex(null);
    },
    [isExternalDrag],
  );

  const handleDockDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      if (!isExternalDrag(e)) return;

      const dropIndex = externalDragIndex ?? pinnedItems.length;
      setExternalDragIndex(null);

      try {
        const jsonData = e.dataTransfer.getData("application/json");
        if (!jsonData) {
          console.warn("[Dock] No JSON data in drop");
          return;
        }

        const data = JSON.parse(jsonData);
        console.log("[Dock] Drop data:", data);

        const { path, name, appId, aliasType, aliasTarget } = data;

        let newItem: DockItem | null = null;

        if (aliasType === "app" && aliasTarget) {
          newItem = { type: "app", id: aliasTarget };
        } else if (appId) {
          newItem = { type: "app", id: appId };
        } else if (path && path.startsWith("/Applications/")) {
          const appFile = getFileItem(path);
          if (appFile?.appId) {
            newItem = { type: "app", id: appFile.appId };
          }
        } else if (path && (path.endsWith(".app") || path.endsWith(".html"))) {
          const file = getFileItem(path);
          const fileName = path.split("/").pop()?.replace(/\.(app|html)$/i, "") || name;
          newItem = {
            type: "file",
            id: `file-${path}`,
            path,
            name: fileName,
            icon: file?.icon,
          };
        }

        console.log("[Dock] Adding item:", newItem, "at index:", dropIndex);

        if (newItem) {
          const added = addDockItem(newItem, dropIndex);
          console.log("[Dock] Item added:", added);
        }
      } catch (err) {
        console.warn("[Dock] Failed to handle drop:", err);
      }
    },
    [externalDragIndex, pinnedItems.length, getFileItem, addDockItem, isExternalDrag],
  );

  const handleItemDragStart = useCallback((e: React.DragEvent, itemId: string, index: number) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-dock-item", JSON.stringify({ id: itemId, index }));
    e.dataTransfer.setData("text/plain", itemId);
    setDraggingItemId(itemId);
    setIsDraggedOutside(false);
  }, []);

  const handleItemDragEnd = useCallback(
    (e: React.DragEvent, itemId: string) => {
      const dockRect = dockBarRef.current?.getBoundingClientRect();
      if (dockRect) {
        const isOutside =
          e.clientX < dockRect.left ||
          e.clientX > dockRect.right ||
          e.clientY < dockRect.top - 50 ||
          e.clientY > dockRect.bottom + 50;

        if (isOutside && !PROTECTED_DOCK_ITEMS.has(itemId)) {
          removeDockItem(itemId);
        }
      }

      setDraggingItemId(null);
      setIsDraggedOutside(false);
    },
    [removeDockItem, dockBarRef],
  );

  const handleItemDrag = useCallback(
    (e: React.DragEvent) => {
      const dockRect = dockBarRef.current?.getBoundingClientRect();
      if (dockRect && draggingItemId) {
        const isOutside =
          e.clientX < dockRect.left - 20 ||
          e.clientX > dockRect.right + 20 ||
          e.clientY < dockRect.top - 60 ||
          e.clientY > dockRect.bottom + 60;

        setIsDraggedOutside(isOutside);
      }
    },
    [draggingItemId, dockBarRef],
  );

  const lastReorderTimeRef = useRef<number>(0);
  const lastReorderTargetRef = useRef<number | null>(null);
  const pendingReorderRef = useRef<{
    targetIndex: number;
    timeout: ReturnType<typeof setTimeout>;
  } | null>(null);

  const handleItemDragOver = useCallback(
    (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault();
      const types = Array.from(e.dataTransfer.types);

      if (!types.includes("application/x-dock-item") || !draggingItemId) {
        return;
      }

      e.dataTransfer.dropEffect = "move";

      if (targetIndex === 0 && pinnedItems[0]?.id === "finder") {
        if (pendingReorderRef.current) {
          clearTimeout(pendingReorderRef.current.timeout);
          pendingReorderRef.current = null;
        }
        return;
      }

      const currentIndex = pinnedItems.findIndex((item) => item.id === draggingItemId);
      if (currentIndex === -1 || currentIndex === targetIndex) {
        if (pendingReorderRef.current && currentIndex === targetIndex) {
          clearTimeout(pendingReorderRef.current.timeout);
          pendingReorderRef.current = null;
        }
        return;
      }

      const now = Date.now();
      if (now - lastReorderTimeRef.current < REORDER_COOLDOWN) {
        return;
      }

      const targetElement = iconRefsMap.current?.get(pinnedItems[targetIndex]?.id);
      if (targetElement) {
        const rect = targetElement.getBoundingClientRect();
        const relativeX = e.clientX - rect.left;
        const percentAcross = relativeX / rect.width;

        const movingRight = targetIndex > currentIndex;
        const shouldSwap = movingRight
          ? percentAcross > SWAP_THRESHOLD
          : percentAcross < 1 - SWAP_THRESHOLD;

        if (!shouldSwap) {
          if (pendingReorderRef.current) {
            clearTimeout(pendingReorderRef.current.timeout);
            pendingReorderRef.current = null;
          }
          return;
        }
      }

      if (pendingReorderRef.current?.targetIndex === targetIndex) {
        return;
      }

      if (pendingReorderRef.current) {
        clearTimeout(pendingReorderRef.current.timeout);
      }

      const timeout = setTimeout(() => {
        const newCurrentIndex = pinnedItems.findIndex((item) => item.id === draggingItemId);
        const timeSinceLastReorder = Date.now() - lastReorderTimeRef.current;

        if (
          newCurrentIndex !== -1 &&
          newCurrentIndex !== targetIndex &&
          timeSinceLastReorder >= REORDER_COOLDOWN
        ) {
          reorderItems(newCurrentIndex, targetIndex);
          lastReorderTimeRef.current = Date.now();
          lastReorderTargetRef.current = targetIndex;
        }
        pendingReorderRef.current = null;
      }, REORDER_DELAY);

      pendingReorderRef.current = { targetIndex, timeout };
    },
    [draggingItemId, pinnedItems, reorderItems, iconRefsMap],
  );

  useEffect(() => {
    if (!draggingItemId) {
      if (pendingReorderRef.current) {
        clearTimeout(pendingReorderRef.current.timeout);
        pendingReorderRef.current = null;
      }
      lastReorderTargetRef.current = null;
    }
  }, [draggingItemId]);

  const handleNonPinnedDragStart = useCallback((e: React.DragEvent, appId: AppId) => {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("application/json", JSON.stringify({ appId }));
  }, []);

  const handleDividerDragOver = useCallback(
    (e: React.DragEvent) => {
      const types = Array.from(e.dataTransfer.types);
      if (types.includes("application/json") && !types.includes("application/x-dock-item")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setIsDividerDropTarget(true);
        setExternalDragIndex(pinnedItems.length);
      }
    },
    [pinnedItems.length],
  );

  const handleDividerDragLeave = useCallback(() => {
    setIsDividerDropTarget(false);
  }, []);

  const handleDividerDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDividerDropTarget(false);
      setExternalDragIndex(null);

      try {
        const jsonData = e.dataTransfer.getData("application/json");
        if (!jsonData) return;

        const data = JSON.parse(jsonData);
        const { appId } = data;

        if (appId && appRegistry[appId as AppId]) {
          addDockItem({ type: "app", id: appId }, pinnedItems.length);
        }
      } catch (err) {
        console.warn("[Dock] Failed to handle divider drop:", err);
      }
    },
    [addDockItem, pinnedItems.length],
  );

  return {
    externalDragIndex,
    draggingItemId,
    isDraggedOutside,
    isDividerDropTarget,
    handleDockDragOver,
    handleDockDragEnter,
    handleDockDragLeave,
    handleDockDrop,
    handleItemDragStart,
    handleItemDragEnd,
    handleItemDrag,
    handleItemDragOver,
    handleNonPinnedDragStart,
    handleDividerDragOver,
    handleDividerDragLeave,
    handleDividerDrop,
  };
}
