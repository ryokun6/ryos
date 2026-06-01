import React, {
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
import { useTranslation } from "react-i18next";
import { useAppStoreShallow } from "@/stores/helpers";
import { AppId, appRegistry } from "@/config/appRegistry";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useFinderStore } from "@/stores/useFinderStore";
import { useFilesStore } from "@/stores/useFilesStore";
import { useDockStore } from "@/stores/useDockStore";
import { useIsPhone } from "@/hooks/useIsPhone";
import { useIsRyoAdmin } from "@/hooks/useIsRyoAdmin";
import { useLongPress } from "@/hooks/useLongPress";
import { useSound, Sounds } from "@/hooks/useSound";
import type { LaunchOriginRect } from "@/stores/useAppStore";
import { RightClickMenu } from "@/components/ui/right-click-menu";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { AnimatePresence, motion, LayoutGroup } from "framer-motion";
import { useShallow } from "zustand/react/shallow";
import {
  isClientYInBottomZone,
  shouldRevealDockFromSwipeUp,
} from "@/utils/dockRevealGesture";
import { useDashboardShellInputDisabled } from "@/hooks/useDashboardShellInputDisabled";
import { DOCK_BASE_BUTTON_SIZE } from "./dockConstants";
import { renderDockPinnedItems } from "./DockPinnedItems";
import { renderDockOpenItems } from "./DockOpenItems";
import { computeDockOpenItems } from "./dockOpenList";
import { computeDockPinnedItems } from "./dockPinnedList";
import { DockApplicationsButton } from "./DockApplicationsButton";
import { DockTrashButton } from "./DockTrashButton";
import { useDockContextMenus } from "./useDockContextMenus";
import { useDockDragDrop } from "./useDockDragDrop";
import { createDockTrashHandlers } from "./dockTrashHandlers";
import { DockDivider } from "./DockDivider";
import { useDockIconHover } from "./useDockIconHover";
import { useDockMagnification } from "./useDockMagnification";

export function MacDock() {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  // Match Dashboard shell guards: no bottom hover capture zone on touch-first viewports.
  const useSwipeToRevealDock = useDashboardShellInputDisabled();
  const { instances, instanceOrder, bringInstanceToForeground, restoreInstance, minimizeInstance, closeAppInstance } =
    useAppStoreShallow((s) => ({
      instances: s.instances,
      instanceOrder: s.instanceOrder,
      bringInstanceToForeground: s.bringInstanceToForeground,
      restoreInstance: s.restoreInstance,
      minimizeInstance: s.minimizeInstance,
      closeAppInstance: s.closeAppInstance,
    }));
  
  // Sound for hide/minimize action from dock context menu
  const { play: playZoomMinimize } = useSound(Sounds.WINDOW_ZOOM_MINIMIZE);

  const launchApp = useLaunchApp();
  const getFileItem = useFilesStore((s) => s.getItem);
  const getFilesInPath = useFilesStore((s) => s.getItemsInPath);
  const removeFileItem = useFilesStore((s) => s.removeItem);
  const emptyTrash = useFilesStore((s) => s.emptyTrash);
  const trashIcon = useFilesStore(
    (s) => s.items["/Trash"]?.icon || "/icons/trash-empty.png"
  );
  const finderInstances = useFinderStore((s) => s.instances);
  
  const isAdmin = useIsRyoAdmin();
  
  // Dock store for customization
  const { 
    pinnedItems, 
    addItem: addDockItem, 
    removeItem: removeDockItem, 
    reorderItems, 
    scale: dockScale, 
    setScale: setDockScale,
    hiding: dockHiding,
    setHiding: setDockHiding,
    magnification: dockMagnification,
    setMagnification: setDockMagnification,
  } = useDockStore(
    useShallow((state) => ({
      pinnedItems: state.pinnedItems,
      addItem: state.addItem,
      removeItem: state.removeItem,
      reorderItems: state.reorderItems,
      scale: state.scale,
      setScale: state.setScale,
      hiding: state.hiding,
      setHiding: state.setHiding,
      magnification: state.magnification,
      setMagnification: state.setMagnification,
    }))
  );
  
  const [isDraggingOverTrash, setIsDraggingOverTrash] = useState(false);
  const [trashContextMenuPos, setTrashContextMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [applicationsContextMenuPos, setApplicationsContextMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isEmptyTrashDialogOpen, setIsEmptyTrashDialogOpen] = useState(false);
  const dockContainerRef = useRef<HTMLDivElement | null>(null);
  const dockBarRef = useRef<HTMLDivElement | null>(null);
  const iconRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
  
  // App context menu state
  const [appContextMenu, setAppContextMenu] = useState<{
    x: number;
    y: number;
    appId: AppId;
    instanceId?: string; // For applet instances
  } | null>(null);
  
  // Divider context menu state (for dock settings)
  const [dividerContextMenuPos, setDividerContextMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  
  const { hoveredId, isSwapping, handleIconHover, handleIconLeave } =
    useDockIconHover();

  // Resize dragging state
  const [isResizing, setIsResizing] = useState(false);
  const [liveDockScale, setLiveDockScale] = useState<number | null>(null);
  const resizeStartY = useRef<number>(0);
  const resizeStartScale = useRef<number>(1);
  
  // Dock hiding state
  const [isDockVisible, setIsDockVisible] = useState(!dockHiding);
  const isMouseInZoneRef = useRef(false);
  
  // Auto-hide timer for inactivity (both desktop and mobile)
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const AUTO_HIDE_DELAY_PHONE = 4000; // 4 seconds of inactivity on phone
  const AUTO_HIDE_DELAY_DESKTOP = 6000; // 6 seconds fallback on desktop (safety net for missed mouseLeave)
  const AUTO_HIDE_COOLDOWN = 500; // Cooldown before dock can be shown again after auto-hide
  const AUTO_HIDE_THROTTLE = 1000; // Throttle timer restarts on mouse move to 1 per second
  const lastAutoHideTimeRef = useRef<number>(0); // Track when dock was last auto-hidden
  const lastTimerRestartRef = useRef<number>(0); // Throttle timer restarts

  const effectiveDockScale = liveDockScale ?? dockScale;

  // Computed scaled sizes
  const scaledButtonSize = Math.round(DOCK_BASE_BUTTON_SIZE * effectiveDockScale);
  const scaledDockHeight = Math.round(56 * effectiveDockScale); // Base dock height is 56px
  const scaledPadding = Math.round(4 * effectiveDockScale); // Base padding is 4px (py-1, px-1)


  const {
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
  } = useDockDragDrop({
    pinnedItems,
    effectiveDockScale,
    scaledPadding,
    getFileItem,
    addDockItem,
    removeDockItem,
    reorderItems,
    dockBarRef,
    iconRefsMap,
  });

  // Resize handlers for divider drag (only on desktop)
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (isPhone) return;
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStartY.current = e.clientY;
    resizeStartScale.current = effectiveDockScale;
    setLiveDockScale(effectiveDockScale);
  }, [isPhone, effectiveDockScale]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Dragging up (negative deltaY) = larger scale
      // Dragging down (positive deltaY) = smaller scale
      const deltaY = resizeStartY.current - e.clientY;
      const scaleDelta = deltaY / 100; // 100px drag = 1.0 scale change
      const newScale = resizeStartScale.current + scaleDelta;
      // Keep drag updates local and transient; persist only on mouseup.
      const clampedScale = Math.max(0.5, Math.min(1.5, newScale));
      setLiveDockScale(clampedScale);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      const finalScale = liveDockScale ?? resizeStartScale.current;
      setDockScale(finalScale);
      setLiveDockScale(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, setDockScale, liveDockScale]);

  useEffect(() => {
    if (!isResizing) {
      setLiveDockScale(null);
    }
  }, [isResizing]);

  // Sync visibility state when hiding setting changes
  useEffect(() => {
    if (!dockHiding) {
      // When hiding is disabled, always show the dock
      setIsDockVisible(true);
      // Clear any auto-hide timer
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current);
        autoHideTimerRef.current = null;
      }
    } else {
      // When hiding is enabled, hide the dock unless mouse is in zone
      if (!isMouseInZoneRef.current) {
        setIsDockVisible(false);
      }
    }
  }, [dockHiding]);
  
  // Cleanup auto-hide timer on unmount
  useEffect(() => {
    return () => {
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current);
      }
    };
  }, []);

  // Helper to restart the auto-hide timer (works on both desktop and mobile)
  const restartAutoHideTimer = useCallback(() => {
    // Only apply when hiding is enabled
    if (!dockHiding) return;
    
    // Clear existing timer
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }
    
    // Don't start timer if dragging or context menu open
    if (draggingItemId || externalDragIndex !== null || 
        trashContextMenuPos || applicationsContextMenuPos || appContextMenu || dividerContextMenuPos) {
      return;
    }
    
    // Use shorter delay on phone, longer on desktop (desktop uses it as a fallback)
    const delay = isPhone ? AUTO_HIDE_DELAY_PHONE : AUTO_HIDE_DELAY_DESKTOP;
    
    // Start new timer to hide dock
    autoHideTimerRef.current = setTimeout(() => {
      // Only hide if mouse is not in zone (desktop safety check)
      if (!isMouseInZoneRef.current) {
        setIsDockVisible(false);
        autoHideTimerRef.current = null;
        // Record time of auto-hide for cooldown
        lastAutoHideTimeRef.current = Date.now();
      } else {
        // Mouse is still in zone, restart timer
        autoHideTimerRef.current = null;
        restartAutoHideTimer();
      }
    }, delay);
  }, [isPhone, dockHiding, draggingItemId, externalDragIndex, trashContextMenuPos, applicationsContextMenuPos, appContextMenu, dividerContextMenuPos]);
  
  // Restart auto-hide timer when context menus close or dragging ends
  useEffect(() => {
    // When context menu closes or drag ends, restart the timer
    if (dockHiding && isDockVisible) {
      restartAutoHideTimer();
    }
  }, [dockHiding, isDockVisible, trashContextMenuPos, applicationsContextMenuPos, appContextMenu, dividerContextMenuPos, draggingItemId, externalDragIndex, restartAutoHideTimer]);
  
  // Show dock (called when mouse enters dock zone)
  const showDock = useCallback(() => {
    // Check cooldown period after auto-hide to prevent immediate re-show
    if (dockHiding) {
      const timeSinceAutoHide = Date.now() - lastAutoHideTimeRef.current;
      if (timeSinceAutoHide < AUTO_HIDE_COOLDOWN) {
        return; // Still in cooldown, don't show
      }
    }
    
    isMouseInZoneRef.current = true;
    setIsDockVisible(true);
    
    // Start auto-hide timer
    restartAutoHideTimer();
  }, [dockHiding, restartAutoHideTimer]);

  // Hide dock immediately (called when mouse leaves dock zone)
  // Won't hide if dragging is in progress or context menu is open
  const hideDock = useCallback(() => {
    isMouseInZoneRef.current = false;
    if (!dockHiding) return;
    // Don't hide while dragging
    if (draggingItemId || externalDragIndex !== null) return;
    // Don't hide while context menu is open
    if (trashContextMenuPos || applicationsContextMenuPos || appContextMenu || dividerContextMenuPos) return;
    
    // Clear auto-hide timer
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }
    
    setIsDockVisible(false);
  }, [dockHiding, draggingItemId, externalDragIndex, trashContextMenuPos, applicationsContextMenuPos, appContextMenu, dividerContextMenuPos]);

  // Mobile / small-height: swipe up from bottom reveals dock; taps pass through (no overlay).
  useEffect(() => {
    if (!dockHiding || isDockVisible || !useSwipeToRevealDock) {
      return;
    }

    const getZoneHeightPx = () => {
      const safeInset = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--sat-safe-area-bottom",
        ),
        10,
      );
      const safeBottom = Number.isFinite(safeInset) ? safeInset : 0;
      return scaledDockHeight + safeBottom;
    };

    let activePointer: {
      pointerId: number;
      startX: number;
      startY: number;
    } | null = null;

    const clearActivePointer = () => {
      activePointer = null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      const zoneHeight = getZoneHeightPx();
      if (!isClientYInBottomZone(e.clientY, window.innerHeight, zoneHeight)) {
        return;
      }
      activePointer = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
      };
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!activePointer || e.pointerId !== activePointer.pointerId) {
        return;
      }
      const deltaX = e.clientX - activePointer.startX;
      const deltaY = e.clientY - activePointer.startY;
      clearActivePointer();

      if (shouldRevealDockFromSwipeUp(deltaX, deltaY)) {
        showDock();
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", clearActivePointer);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", clearActivePointer);
      clearActivePointer();
    };
  }, [
    dockHiding,
    isDockVisible,
    useSwipeToRevealDock,
    scaledDockHeight,
    showDock,
  ]);

  // Divider context menu handler
  const handleDividerContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const containerRect = dockContainerRef.current?.getBoundingClientRect();
    if (!containerRect) {
      setDividerContextMenuPos({ x: e.clientX, y: e.clientY });
      return;
    }
    
    setDividerContextMenuPos({
      x: e.clientX - containerRect.left,
      y: e.clientY - containerRect.top,
    });
  }, []);

  // Long press handler for divider on mobile (opens context menu)
  const handleDividerLongPress = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0] || e.changedTouches[0];
    if (!touch) return;
    
    const containerRect = dockContainerRef.current?.getBoundingClientRect();
    if (!containerRect) {
      setDividerContextMenuPos({ x: touch.clientX, y: touch.clientY });
      return;
    }
    
    setDividerContextMenuPos({
      x: touch.clientX - containerRect.left,
      y: touch.clientY - containerRect.top,
    });
  }, []);

  // Use long press hook for divider
  const dividerLongPress = useLongPress(handleDividerLongPress);

  // Get trash items to check if trash is empty - use targeted selector
  const trashItemCount = useFilesStore(
    (s) => Object.values(s.items).filter((item) => item.status === "trashed").length
  );
  const isTrashEmpty = trashItemCount === 0;

  // Normalize pinned app ids before rendering. Stale localStorage / cloud sync
  // entries would otherwise throw in getAppIconPath and paint a blank slot.
  const sanitizedPinnedItems = useMemo(
    () => computeDockPinnedItems(pinnedItems),
    [pinnedItems]
  );

  // Pinned apps on the left side (from dock store)
  const pinnedLeft: AppId[] = useMemo(
    () =>
      sanitizedPinnedItems.reduce<AppId[]>((acc, item) => {
        if (item.type === "app") {
          acc.push(item.id as AppId);
        }
        return acc;
      }, []),
    [sanitizedPinnedItems]
  );

  // Compute open apps and individual applet instances. Entries that can't be
  // rendered (unknown app ids, applet instances without an id) are filtered out
  // so the dock never shows an empty slot.
  const openItems = useMemo(
    () =>
      computeDockOpenItems(
        instances,
        pinnedLeft,
        (appId) => Boolean(appRegistry[appId])
      ),
    [instances, pinnedLeft]
  );

  const openAppsAllSet = useMemo(() => {
    const set = new Set<AppId>();
    Object.values(instances).forEach((inst) => {
      if (inst.isOpen) set.add(inst.appId as AppId);
    });
    return set;
  }, [instances]);

  const focusMostRecentInstanceOfApp = (appId: AppId) => {
    // First, restore all minimized instances of this app
    let hasMinimized = false;
    let lastRestoredId: string | null = null;
    Object.values(instances).forEach((inst) => {
      if (inst.appId === appId && inst.isOpen && inst.isMinimized) {
        restoreInstance(inst.instanceId);
        hasMinimized = true;
        lastRestoredId = inst.instanceId;
      }
    });
    
    // If we restored any, bring the last one to foreground
    if (hasMinimized && lastRestoredId) {
      bringInstanceToForeground(lastRestoredId);
      return;
    }
    
    // Otherwise, walk instanceOrder from end to find most recent open instance for appId
    for (let i = instanceOrder.length - 1; i >= 0; i--) {
      const id = instanceOrder[i];
      const inst = instances[id];
      if (inst && inst.appId === appId && inst.isOpen) {
        bringInstanceToForeground(id);
        return;
      }
    }
    // No open instance found
  };

  const focusOrLaunchApp = useCallback(
    (appId: AppId, initialData?: unknown, launchOrigin?: LaunchOriginRect) => {
      // First, restore all minimized instances of this app
      let hasMinimized = false;
      let lastRestoredId: string | null = null;
      Object.values(instances).forEach((inst) => {
        if (inst.appId === appId && inst.isOpen && inst.isMinimized) {
          restoreInstance(inst.instanceId);
          hasMinimized = true;
          lastRestoredId = inst.instanceId;
        }
      });
      
      // If we restored any, bring the last one to foreground
      if (hasMinimized && lastRestoredId) {
        bringInstanceToForeground(lastRestoredId);
        return;
      }
      
      // Try focusing existing instance of this app
      for (let i = instanceOrder.length - 1; i >= 0; i--) {
        const id = instanceOrder[i];
        const inst = instances[id];
        if (inst && inst.appId === appId && inst.isOpen) {
          bringInstanceToForeground(id);
          return;
        }
      }
      // Launch new with launch origin for animation
      launchApp(appId, initialData !== undefined ? { initialData, launchOrigin } : { launchOrigin });
    },
    [instanceOrder, instances, bringInstanceToForeground, restoreInstance, launchApp]
  );

  // Finder-specific: bring existing to foreground, otherwise launch one
  const focusOrLaunchFinder = useCallback(
    (initialPath?: string, launchOrigin?: LaunchOriginRect) => {
      // First, restore all minimized Finder instances
      let hasMinimized = false;
      let lastRestoredId: string | null = null;
      Object.values(instances).forEach((inst) => {
        if (inst.appId === "finder" && inst.isOpen && inst.isMinimized) {
          restoreInstance(inst.instanceId);
          hasMinimized = true;
          lastRestoredId = inst.instanceId;
        }
      });
      
      // If we restored any, bring the last one to foreground
      if (hasMinimized && lastRestoredId) {
        bringInstanceToForeground(lastRestoredId);
        return;
      }
      
      // Try focusing existing Finder instance
      for (let i = instanceOrder.length - 1; i >= 0; i--) {
        const id = instanceOrder[i];
        const inst = instances[id];
        if (inst && inst.appId === "finder" && inst.isOpen) {
          bringInstanceToForeground(id);
          return;
        }
      }
      // None open; launch new Finder instance (multi-window supported by hook)
      if (initialPath) launchApp("finder", { initialPath, launchOrigin });
      else launchApp("finder", { initialPath: "/", launchOrigin });
    },
    [instances, instanceOrder, bringInstanceToForeground, restoreInstance, launchApp]
  );

  // Focus a Finder window already at targetPath (or its subpath); otherwise launch new Finder at targetPath
  const focusFinderAtPathOrLaunch = useCallback(
    (targetPath: string, initialData?: unknown, launchOrigin?: LaunchOriginRect) => {
      for (let i = instanceOrder.length - 1; i >= 0; i--) {
        const id = instanceOrder[i];
        const inst = instances[id];
        if (inst && inst.appId === "finder" && inst.isOpen) {
          const fi = finderInstances[id];
          if (
            fi &&
            (fi.currentPath === targetPath ||
              fi.currentPath.startsWith(targetPath + "/"))
          ) {
            // If minimized, restore it; otherwise just bring to foreground
            if (inst.isMinimized) {
              restoreInstance(id);
            } else {
              bringInstanceToForeground(id);
            }
            return;
          }
        }
      }
      launchApp("finder", {
        initialPath: targetPath,
        initialData: initialData,
        launchOrigin,
      });
    },
    [
      instanceOrder,
      instances,
      finderInstances,
      bringInstanceToForeground,
      restoreInstance,
      launchApp,
    ]
  );

  const {
    getDividerContextMenuItems,
    getAppContextMenuItems,
    getFolderContextMenuItems,
  } = useDockContextMenus({
    t,
    instances,
    finderInstances,
    pinnedItems,
    dockHiding,
    dockMagnification,
    setDockHiding,
    setDockMagnification,
    isAdmin,
    isTrashEmpty,
    getFileItem,
    getFilesInPath,
    launchApp,
    restoreInstance,
    bringInstanceToForeground,
    minimizeInstance,
    closeAppInstance,
    playZoomMinimize,
    removeDockItem,
    addDockItem,
    focusFinderAtPathOrLaunch,
    focusOrLaunchFinder,
    focusOrLaunchApp,
    setTrashContextMenuPos,
    setApplicationsContextMenuPos,
    setIsEmptyTrashDialogOpen,
  });

  // Handle app context menu
  const handleAppContextMenu = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, appId: AppId, instanceId?: string) => {
      e.preventDefault();
      e.stopPropagation();
      
      const containerRect = dockContainerRef.current?.getBoundingClientRect();
      if (!containerRect) {
        setAppContextMenu({ x: e.clientX, y: e.clientY, appId, instanceId });
        return;
      }
      
      setAppContextMenu({
        x: e.clientX - containerRect.left,
        y: e.clientY - containerRect.top,
        appId,
        instanceId,
      });
    },
    []
  );

  const { handleTrashDragOver, handleTrashDrop, handleTrashDragLeave } =
    createDockTrashHandlers(removeFileItem, setIsDraggingOverTrash);

  const { mouseX, effectiveMagnifyEnabled } = useDockMagnification(
    dockMagnification,
    isResizing,
  );

  // Track which icons have appeared before to control enter animations
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [hasMounted, setHasMounted] = useState(false);
  // Mark all currently visible ids as seen whenever the set changes
  const allVisibleIds = useMemo(() => {
    const ids = [
      ...sanitizedPinnedItems.map(item => item.id),
      ...openItems.map((item) =>
        item.type === "applet" ? item.instanceId! : item.appId
      ),
      "__applications__",
      "__trash__",
    ];
    return ids;
  }, [sanitizedPinnedItems, openItems]);
  // After first paint, mark everything present as seen and mark mounted
  // Also update seen set whenever visible ids change
  useEffect(() => {
    allVisibleIds.forEach((id) => seenIdsRef.current.add(id));
    if (!hasMounted) setHasMounted(true);
  }, [allVisibleIds, hasMounted]);

  // No global pointer listeners; container updates mouseX and resets to Infinity on leave

  // index tracking no longer needed; sizing is per-element via motion values

  return (
    <div
      ref={dockContainerRef}
      className="fixed left-0 right-0 z-50"
      style={{
        bottom: 0,
        pointerEvents: "none",
      }}
    >
      <div
        className="flex w-full items-end justify-center"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <motion.div
          ref={dockBarRef}
          layout
          layoutRoot
          className="inline-flex items-end"
          initial={false}
          animate={{
            y: isDockVisible ? 0 : scaledDockHeight + 10,
            opacity: isDockVisible ? 1 : 0,
          }}
          style={{
            pointerEvents: isDockVisible ? "auto" : "none",
            // Same tint variable as the menubar so light/dark switch in lockstep.
            background:
              "var(--os-color-dock-surface, rgba(248, 248, 248, 0.75))",
            backgroundImage: "var(--os-pinstripe-menubar)",
            border: "none",
            boxShadow:
              "var(--os-color-dock-shadow, 0 2px 8px rgba(0, 0, 0, 0.15))",
            height: scaledDockHeight,
            padding: scaledPadding,
            maxWidth: "min(92vw, 980px)",
            transformOrigin: "center bottom",
            borderRadius: "0px",
            overflowX: isPhone ? "auto" : "visible",
            overflowY: "visible",
            WebkitOverflowScrolling: isPhone ? "touch" : undefined,
            overscrollBehaviorX: isPhone ? "contain" : undefined,
          }}
          transition={{
            y: {
              type: "tween",
              duration: 0.2,
              ease: "easeOut",
            },
            opacity: {
              duration: 0.15,
            },
            layout: {
              type: "spring",
              stiffness: 400,
              damping: 30,
            },
          }}
          onMouseEnter={() => {
            if (dockHiding) {
              showDock();
            }
          }}
          onMouseLeave={() => {
            if (dockHiding) {
              hideDock();
            }
            if (effectiveMagnifyEnabled && !trashContextMenuPos && !appContextMenu) {
              mouseX.set(Infinity);
              handleIconLeave();
            }
          }}
          onMouseMove={(e) => {
            // Update mouse position for magnification
            if (effectiveMagnifyEnabled && !trashContextMenuPos && !appContextMenu) {
              mouseX.set(e.clientX);
            }
            // Restart auto-hide timer on mouse movement (desktop fallback, throttled)
            if (!isPhone && dockHiding) {
              const now = Date.now();
              if (now - lastTimerRestartRef.current >= AUTO_HIDE_THROTTLE) {
                lastTimerRestartRef.current = now;
                restartAutoHideTimer();
              }
            }
          }}
          onTouchStart={() => {
            // Restart auto-hide timer on any touch interaction
            if (dockHiding) {
              restartAutoHideTimer();
            }
          }}
          onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
            handleDockDragOver(e);
            if (draggingItemId) {
              handleItemDrag(e);
            }
          }}
          onDragEnter={handleDockDragEnter}
          onDragLeave={handleDockDragLeave}
          onDrop={handleDockDrop}
        >
          <LayoutGroup>
            <AnimatePresence mode="popLayout" initial={false}>
              {renderDockPinnedItems({
                pinnedItems: sanitizedPinnedItems,
                externalDragIndex,
                openAppsAllSet,
                instances,
                mouseX,
                effectiveMagnifyEnabled,
                scaledButtonSize,
                iconRefsMap,
                hasMounted,
                seenIdsRef,
                hoveredId,
                isSwapping,
                handleIconHover,
                handleIconLeave,
                draggingItemId,
                isDraggedOutside,
                handleItemDragStart,
                handleItemDragEnd,
                handleItemDragOver,
                handleAppContextMenu,
                focusOrLaunchFinder,
                focusOrLaunchApp,
                getFileItem,
                launchApp,
              })}

              {/* Divider between pinned and non-pinned apps */}
              {openItems.length > 0 && (
                <DockDivider 
                  key="divider-pinned" 
                  idKey="pinned"
                  onDragOver={handleDividerDragOver}
                  onDrop={handleDividerDrop}
                  onDragLeave={handleDividerDragLeave}
                  isDropTarget={isDividerDropTarget}
                  height={scaledButtonSize}
                  onContextMenu={handleDividerContextMenu}
                  {...dividerLongPress}
                />
              )}

              {renderDockOpenItems({
                openItems,
                instances,
                mouseX,
                effectiveMagnifyEnabled,
                scaledButtonSize,
                hasMounted,
                seenIdsRef,
                hoveredId,
                isSwapping,
                handleIconHover,
                handleIconLeave,
                handleAppContextMenu,
                restoreInstance,
                bringInstanceToForeground,
                focusMostRecentInstanceOfApp,
                handleNonPinnedDragStart,
                getFileItem,
                t,
              })}

              {/* Divider between open apps and Applications/Trash */}
              <DockDivider 
                key="divider-between" 
                idKey="between" 
                height={scaledButtonSize}
                resizable={!isPhone}
                onResizeStart={handleResizeStart}
                onContextMenu={handleDividerContextMenu}
                {...dividerLongPress}
              />

              <DockApplicationsButton
                key="__applications__"
                dockContainerRef={dockContainerRef}
                setApplicationsContextMenuPos={setApplicationsContextMenuPos}
                focusFinderAtPathOrLaunch={focusFinderAtPathOrLaunch}
                mouseX={mouseX}
                effectiveMagnifyEnabled={effectiveMagnifyEnabled}
                scaledButtonSize={scaledButtonSize}
                hasMounted={hasMounted}
                seenIdsRef={seenIdsRef}
                hoveredId={hoveredId}
                isSwapping={isSwapping}
                handleIconHover={handleIconHover}
                handleIconLeave={handleIconLeave}
                t={t}
              />

              <DockTrashButton
                key="__trash__"
                dockContainerRef={dockContainerRef}
                setTrashContextMenuPos={setTrashContextMenuPos}
                focusFinderAtPathOrLaunch={focusFinderAtPathOrLaunch}
                trashIcon={trashIcon}
                handleTrashDragOver={handleTrashDragOver}
                handleTrashDrop={handleTrashDrop}
                handleTrashDragLeave={handleTrashDragLeave}
                isDraggingOverTrash={isDraggingOverTrash}
                mouseX={mouseX}
                effectiveMagnifyEnabled={effectiveMagnifyEnabled}
                scaledButtonSize={scaledButtonSize}
                hasMounted={hasMounted}
                seenIdsRef={seenIdsRef}
                hoveredId={hoveredId}
                isSwapping={isSwapping}
                handleIconHover={handleIconHover}
                handleIconLeave={handleIconLeave}
                t={t}
              />

            </AnimatePresence>
          </LayoutGroup>
        </motion.div>
      </div>
      
      {/* Desktop: hover zone reveals hidden dock. Mobile uses swipe (see effect above). */}
      {dockHiding && !isDockVisible && !useSwipeToRevealDock && (
        <div
          className="fixed left-0 right-0 z-40"
          style={{
            bottom: 0,
            height: Math.max(Math.round(scaledDockHeight / 2), 8),
            pointerEvents: "auto",
            // Debug: uncomment to visualize hover zone
            // backgroundColor: "rgba(255, 0, 0, 0.2)",
          }}
          onMouseEnter={showDock}
        />
      )}
      
      <RightClickMenu
        items={getFolderContextMenuItems("/Trash", true)}
        position={trashContextMenuPos}
        onClose={() => {
          setTrashContextMenuPos(null);
          mouseX.set(Infinity);
        }}
      />
      <RightClickMenu
        items={getFolderContextMenuItems("/Applications", false)}
        position={applicationsContextMenuPos}
        onClose={() => {
          setApplicationsContextMenuPos(null);
          mouseX.set(Infinity);
        }}
      />
      {appContextMenu && (
        <RightClickMenu
          items={getAppContextMenuItems(appContextMenu.appId, appContextMenu.instanceId)}
          position={appContextMenu}
          onClose={() => {
            setAppContextMenu(null);
            mouseX.set(Infinity);
          }}
        />
      )}
      {dividerContextMenuPos && (
        <RightClickMenu
          items={getDividerContextMenuItems()}
          position={dividerContextMenuPos}
          onClose={() => {
            setDividerContextMenuPos(null);
            mouseX.set(Infinity);
          }}
        />
      )}
      <ConfirmDialog
        isOpen={isEmptyTrashDialogOpen}
        onOpenChange={setIsEmptyTrashDialogOpen}
        onConfirm={() => {
          emptyTrash();
          setIsEmptyTrashDialogOpen(false);
        }}
        title={t("apps.finder.dialogs.emptyTrash.title")}
        description={t("apps.finder.dialogs.emptyTrash.description")}
      />
    </div>
  );
}
