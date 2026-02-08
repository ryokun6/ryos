import React, {
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
  forwardRef,
} from "react";
import { useTranslation } from "react-i18next";
import { useThemeStore } from "@/stores/useThemeStore";
import { useAppStoreShallow } from "@/stores/helpers";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { AppId, getAppIconPath, appRegistry, getNonFinderApps } from "@/config/appRegistry";
import { getTranslatedAppName, getTranslatedFolderNameFromName } from "@/utils/i18n";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useFinderStore } from "@/stores/useFinderStore";
import { useFilesStore } from "@/stores/useFilesStore";
import { useDockStore, PROTECTED_DOCK_ITEMS, type DockItem } from "@/stores/useDockStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { useIsPhone } from "@/hooks/useIsPhone";
import { useLongPress } from "@/hooks/useLongPress";
import { useSound, Sounds } from "@/hooks/useSound";
import type { AppInstance, LaunchOriginRect } from "@/stores/useAppStore";
import type { AppletViewerInitialData } from "@/apps/applet-viewer";
import { RightClickMenu, MenuItem } from "@/components/ui/right-click-menu";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { requestCloseWindow } from "@/utils/windowUtils";
import {
  AnimatePresence,
  motion,
  LayoutGroup,
  useMotionValue,
  useSpring,
  useTransform,
  useIsPresent,
  type MotionValue,
} from "framer-motion";
import { useShallow } from "zustand/react/shallow";

const MAX_SCALE = 2.3; // peak multiplier at cursor center
const DISTANCE = 140; // px range where magnification is applied
const BASE_BUTTON_SIZE = 48; // px (w-12)

interface IconButtonProps {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  icon: string;
  idKey: string;
  showIndicator?: boolean;
  isEmoji?: boolean;
  onDragOver?: React.DragEventHandler;
  onDrop?: React.DragEventHandler;
  onDragLeave?: React.DragEventHandler;
  onContextMenu?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  mouseX: MotionValue<number>;
  magnifyEnabled: boolean;
  isNew: boolean;
  isHovered: boolean;
  isSwapping: boolean;
  onHover: () => void;
  onLeave: () => void;
  isLoading?: boolean;
  // Drag-and-drop props for reordering
  draggable?: boolean;
  onDragStart?: React.DragEventHandler<HTMLElement>;
  onDragEnd?: React.DragEventHandler<HTMLElement>;
  isDragging?: boolean;
  isDraggedOutside?: boolean;
  // Scaled size prop
  baseSize?: number;
}

// Animated spacer for drop preview - with magnification support
interface DockSpacerProps {
  idKey: string;
  mouseX: MotionValue<number>;
  magnifyEnabled: boolean;
  baseSize?: number;
}

const DockSpacer = forwardRef<HTMLDivElement, DockSpacerProps>(
  ({ idKey, mouseX, magnifyEnabled, baseSize: baseSizeProp }, ref) => {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const baseSize = baseSizeProp ?? BASE_BUTTON_SIZE;
    const maxSize = Math.round(baseSize * MAX_SCALE);
    
    // Use a motion value for target size that we can imperatively update
    const targetSize = useMotionValue(baseSize);
    
    // Update target size when base size changes or magnification is disabled
    useEffect(() => {
      if (!magnifyEnabled) {
        targetSize.set(baseSize);
      }
    }, [baseSize, magnifyEnabled, targetSize]);
    
    const distanceCalc = useTransform(mouseX, (val) => {
      const bounds = wrapperRef.current?.getBoundingClientRect();
      if (!bounds || !Number.isFinite(val)) return Infinity;
      return val - (bounds.left + bounds.width / 2);
    });
    
    // Update target size based on cursor distance when magnification is enabled
    useEffect(() => {
      if (!magnifyEnabled) return;
      
      const unsubscribe = distanceCalc.on("change", (dist) => {
        if (!Number.isFinite(dist)) {
          targetSize.set(baseSize);
          return;
        }
        const absDist = Math.abs(dist);
        if (absDist > DISTANCE) {
          targetSize.set(baseSize);
        } else {
          const t = 1 - absDist / DISTANCE;
          targetSize.set(baseSize + t * (maxSize - baseSize));
        }
      });
      
      return unsubscribe;
    }, [magnifyEnabled, baseSize, maxSize, distanceCalc, targetSize]);
    
    const sizeSpring = useSpring(targetSize, {
      mass: 0.15,
      stiffness: 160,
      damping: 18,
    });
    
    const widthValue = sizeSpring;
    
    const setCombinedRef = useCallback(
      (node: HTMLDivElement | null) => {
        wrapperRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref && "current" in (ref as object)) {
          (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }
      },
      [ref]
    );
    
    return (
      <motion.div
        ref={setCombinedRef}
        layout
        layoutId={`dock-spacer-${idKey}`}
        initial={{ width: 0, height: 0 }}
        animate={{ width: baseSize + 8, height: baseSize }} // Base size for layout, actual size controlled by style
        exit={{ width: 0, height: 0 }}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 30,
        }}
        className="flex-shrink-0"
        style={{
          width: widthValue,
          height: widthValue,
          marginLeft: 4,
          marginRight: 4,
          transformOrigin: "bottom center",
        }}
      />
    );
  }
);

const IconButton = forwardRef<HTMLDivElement, IconButtonProps>(
  (
    {
      label,
      onClick,
      icon,
      idKey,
      showIndicator = false,
      isLoading = false,
      isEmoji = false,
      onDragOver,
      onDrop,
      onDragLeave,
      onContextMenu,
      mouseX,
      magnifyEnabled,
      isNew,
      isHovered,
      isSwapping,
      onHover,
      onLeave,
      draggable = false,
      onDragStart,
      onDragEnd,
      isDragging = false,
      isDraggedOutside = false,
      baseSize: baseSizeProp,
    },
    forwardedRef
  ) => {
    const baseButtonSize = baseSizeProp ?? BASE_BUTTON_SIZE;
    const maxButtonSize = Math.round(baseButtonSize * MAX_SCALE);
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const isPresent = useIsPresent();
    
    // Use a motion value for target size that we can imperatively update
    const targetSize = useMotionValue(baseButtonSize);
    
    // Update target size when base size changes or magnification is disabled
    useEffect(() => {
      if (!magnifyEnabled) {
        targetSize.set(baseButtonSize);
      }
    }, [baseButtonSize, magnifyEnabled, targetSize]);
    
    // Calculate distance from cursor to icon center
    const distanceCalc = useTransform(mouseX, (val) => {
      const bounds = wrapperRef.current?.getBoundingClientRect();
      if (!bounds || !Number.isFinite(val)) return Infinity;
      return val - (bounds.left + bounds.width / 2);
    });
    
    // Update target size based on cursor distance when magnification is enabled
    useEffect(() => {
      if (!magnifyEnabled) return;
      
      const unsubscribe = distanceCalc.on("change", (dist) => {
        if (!Number.isFinite(dist)) {
          targetSize.set(baseButtonSize);
          return;
        }
        const absDist = Math.abs(dist);
        if (absDist > DISTANCE) {
          targetSize.set(baseButtonSize);
        } else {
          const t = 1 - absDist / DISTANCE;
          targetSize.set(baseButtonSize + t * (maxButtonSize - baseButtonSize));
        }
      });
      
      return unsubscribe;
    }, [magnifyEnabled, baseButtonSize, maxButtonSize, distanceCalc, targetSize]);
    
    const sizeSpring = useSpring(targetSize, {
      mass: 0.15,
      stiffness: 160,
      damping: 18,
    });
    const widthValue = isPresent ? sizeSpring : 0;

    // Scale factor for emoji to match magnification (relative to baseButtonSize)
    const emojiScale = useTransform(sizeSpring, (val) => val / baseButtonSize);

    // Add long-press support for context menu on mobile
    const longPressHandlers = useLongPress<HTMLButtonElement>((touchEvent) => {
      if (onContextMenu) {
        const touch = touchEvent.touches[0];
        const syntheticEvent = {
          preventDefault: () => {},
          stopPropagation: () => {},
          clientX: touch.clientX,
          clientY: touch.clientY,
        } as unknown as React.MouseEvent<HTMLButtonElement>;
        onContextMenu(syntheticEvent);
      }
    });

    const setCombinedRef = useCallback(
      (node: HTMLDivElement | null) => {
        wrapperRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef && "current" in (forwardedRef as object)) {
          (
            forwardedRef as React.MutableRefObject<HTMLDivElement | null>
          ).current = node;
        }
      },
      [forwardedRef]
    );

    // When dragged outside dock, shrink to 0; when dragging inside, use normal size
    const dragWidth = isDraggedOutside ? 0 : widthValue;
    const dragHeight = isDraggedOutside ? 0 : widthValue;
    const dragMargin = isDraggedOutside ? 0 : (isPresent ? 4 : 0);

    return (
      <motion.div
        ref={setCombinedRef}
        layout
        layoutId={`dock-icon-${idKey}`}
        data-dock-icon={idKey}
        initial={isNew ? { scale: 0, opacity: 0 } : undefined}
        animate={{
          scale: 1,
          // Hide icon completely when dragging
          opacity: isDragging ? 0 : 1,
        }}
        exit={{
          scale: 0,
          opacity: 0,
        }}
        transition={{
          type: "spring",
          stiffness: 500,
          damping: 36,
          mass: 0.7,
          // Snappier layout transition for reorder snap effect
          layout: {
            type: "spring",
            stiffness: 400,
            damping: 30,
          },
        }}
        style={{
          transformOrigin: "bottom center",
          willChange: "width, height, transform",
          width: dragWidth,
          height: dragHeight,
          marginLeft: dragMargin,
          marginRight: dragMargin,
          overflow: "visible",
          cursor: draggable ? (isDragging ? "grabbing" : "grab") : "pointer",
        }}
        className="flex-shrink-0 relative"
      >
        <AnimatePresence>
          {isHovered && (
            <motion.div
              initial={{ opacity: 0, y: 10, x: "-50%" }}
              animate={{ 
                opacity: 1, 
                y: 0, 
                x: "-50%",
                transition: { duration: isSwapping ? 0 : 0.05 }
              }}
              exit={{ 
                opacity: 0, 
                y: 5, 
                x: "-50%",
                transition: { duration: isSwapping ? 0 : 0.15 }
              }}
              className="absolute bottom-full mb-3 left-1/2 px-3 py-1 bg-neutral-800 text-white/90 text-sm font-medium rounded-full shadow-xl whitespace-nowrap pointer-events-none z-50"
            >
              {label}
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-[10px] h-[5px] bg-neutral-800" style={{ clipPath: "polygon(50% 100%, 0% 0%, 100% 0%)" }} />
            </motion.div>
          )}
        </AnimatePresence>

        <button
          aria-label={label}
          title="" // remove native tooltip
          onClick={onClick}
          onContextMenu={onContextMenu}
          onMouseEnter={onHover}
          onMouseLeave={onLeave}
          draggable={draggable}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragLeave={onDragLeave}
          {...longPressHandlers}
          className="relative flex items-end justify-center w-full h-full"
          style={{
            willChange: "transform",
          }}
        >
          <motion.div
            className="w-full h-full flex items-end justify-center"
            animate={
              isLoading
                ? {
                    y: [0, -20, 0],
                    transition: {
                      y: {
                        repeat: Infinity,
                        duration: 0.8,
                        ease: "easeInOut",
                        repeatType: "loop",
                      },
                    },
                  }
                : { y: 0 }
            }
            transition={{
              y: {
                type: "spring",
                stiffness: 200,
                damping: 20,
              },
            }}
          >
            {isEmoji ? (
              <motion.span
                className="select-none pointer-events-none flex items-end justify-center"
                style={{
                  // Slightly larger base size so initial (non-hover) emoji isn't too small
                  fontSize: baseButtonSize * 0.84,
                  lineHeight: 1,
                  originY: 1,
                  originX: 0.5,
                  scale: magnifyEnabled ? emojiScale : 1,
                  // Lift a couple px so it's not too tight against the bottom
                  y: -5,
                  width: "100%",
                  height: "100%",
                }}
              >
                {icon}
              </motion.span>
            ) : (
              <ThemedIcon
                name={icon}
                alt={label}
                className="select-none pointer-events-none"
                draggable={false}
                style={{
                  imageRendering: "-webkit-optimize-contrast",
                  width: "100%",
                  height: "100%",
                }}
              />
            )}
          </motion.div>
          {showIndicator ? (
            <span
              aria-hidden
              className="absolute"
              style={{
                bottom: -3,
                width: 0,
                height: 0,
                borderLeft: "4px solid transparent",
                borderRight: "4px solid transparent",
                borderTop: "0",
                borderBottom: "4px solid #000",
                filter: "none",
              }}
            />
          ) : null}
        </button>
      </motion.div>
    );
  }
);

interface DividerProps {
  idKey: string;
  onDragOver?: React.DragEventHandler;
  onDrop?: React.DragEventHandler;
  onDragLeave?: React.DragEventHandler;
  isDropTarget?: boolean;
  height?: number;
  resizable?: boolean;
  onResizeStart?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onTouchStart?: React.TouchEventHandler;
  onTouchEnd?: React.TouchEventHandler;
  onTouchMove?: React.TouchEventHandler;
  onTouchCancel?: React.TouchEventHandler;
}

const Divider = forwardRef<HTMLDivElement, DividerProps>(
  ({ idKey, onDragOver, onDrop, onDragLeave, isDropTarget, height = 48, resizable, onResizeStart, onContextMenu, onTouchStart, onTouchEnd, onTouchMove, onTouchCancel }, ref) => {
    const baseWidth = 1;
    
    // Wrap handlers to stop propagation and prevent icon menus from triggering
    const handleContextMenu = (e: React.MouseEvent) => {
      e.stopPropagation();
      onContextMenu?.(e);
    };
    
    const handleTouchStart = (e: React.TouchEvent) => {
      e.stopPropagation();
      onTouchStart?.(e);
    };
    
    const handleTouchEnd = (e: React.TouchEvent) => {
      e.stopPropagation();
      onTouchEnd?.(e);
    };
    
    const handleTouchMove = (e: React.TouchEvent) => {
      e.stopPropagation();
      onTouchMove?.(e);
    };
    
    const handleTouchCancel = (e: React.TouchEvent) => {
      e.stopPropagation();
      onTouchCancel?.(e);
    };
    
    return (
      <motion.div
        ref={ref}
        layout
        layoutId={`dock-divider-${idKey}`}
        initial={{ opacity: 0, scaleY: 0.8 }}
        animate={{ 
          opacity: 0.9, 
          scaleY: 1,
        }}
        exit={{ opacity: 0, scaleY: 0.8 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        onDragOver={onDragOver as React.DragEventHandler<HTMLDivElement>}
        onDrop={onDrop as React.DragEventHandler<HTMLDivElement>}
        onDragLeave={onDragLeave as React.DragEventHandler<HTMLDivElement>}
        onMouseDown={resizable ? onResizeStart : undefined}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onTouchCancel={handleTouchCancel}
        style={{
          height,
          // Wider touch area with padding, visual line is the inner element
          padding: "0 10px",
          alignSelf: "center",
          cursor: resizable ? "ns-resize" : undefined,
          position: "relative",
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Visual divider line */}
        <div
          style={{
            width: isDropTarget ? 4 : baseWidth,
            height: "100%",
            backgroundColor: isDropTarget ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.2)",
            borderRadius: 2,
            transition: "width 0.15s ease, background-color 0.15s ease",
          }}
        />
      </motion.div>
    );
  }
);

// Apps that support multi-window
const MULTI_WINDOW_APPS: AppId[] = ["textedit", "finder", "applet-viewer"];

function MacDock() {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
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
  const files = useFilesStore((s) => s.items);
  const getFileItem = useFilesStore((s) => s.getItem);
  const getFilesInPath = useFilesStore((s) => s.getItemsInPath);
  const removeFileItem = useFilesStore((s) => s.removeItem);
  const emptyTrash = useFilesStore((s) => s.emptyTrash);
  const trashIcon = useFilesStore(
    (s) => s.items["/Trash"]?.icon || "/icons/trash-empty.png"
  );
  const finderInstances = useFinderStore((s) => s.instances);
  
  // Get current username for admin check
  const username = useChatsStore((state) => state.username);
  const isAdmin = username?.toLowerCase() === "ryo";
  
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
  
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isSwapping, setIsSwapping] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Drag-and-drop state
  const [externalDragIndex, setExternalDragIndex] = useState<number | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [isDraggedOutside, setIsDraggedOutside] = useState(false);
  const [isDividerDropTarget, setIsDividerDropTarget] = useState(false);
  
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

  const handleIconHover = useCallback((id: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
      setIsSwapping(true);
      setHoveredId(id);
      return;
    }
    
    setHoveredId((prev) => {
      if (prev !== null && prev !== id) {
        setIsSwapping(true);
      } else {
        setIsSwapping(false);
      }
      return id;
    });
  }, []);

  const handleIconLeave = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredId(null);
      setIsSwapping(false);
      hoverTimeoutRef.current = null;
    }, 50);
  }, []);

  const effectiveDockScale = liveDockScale ?? dockScale;

  // Computed scaled sizes
  const scaledButtonSize = Math.round(BASE_BUTTON_SIZE * effectiveDockScale);
  const scaledDockHeight = Math.round(56 * effectiveDockScale); // Base dock height is 56px
  const scaledPadding = Math.round(4 * effectiveDockScale); // Base padding is 4px (py-1, px-1)

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

  // Get divider context menu items (dock settings)
  const getDividerContextMenuItems = useCallback((): MenuItem[] => {
    return [
      {
        type: "item",
        label: dockHiding ? t("common.dock.turnHidingOff") : t("common.dock.turnHidingOn"),
        onSelect: () => setDockHiding(!dockHiding),
      },
      {
        type: "item",
        label: dockMagnification ? t("common.dock.turnMagnificationOff") : t("common.dock.turnMagnificationOn"),
        onSelect: () => setDockMagnification(!dockMagnification),
      },
    ];
  }, [dockHiding, dockMagnification, setDockHiding, setDockMagnification, t]);

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

  // Get trash items to check if trash is empty
  // Use a selector that directly filters items to avoid infinite loops
  const allItems = useFilesStore((s) => s.items);
  const trashItems = useMemo(
    () => Object.values(allItems).filter((item) => item.status === "trashed"),
    [allItems]
  );
  const isTrashEmpty = trashItems.length === 0;

  // Helper to get applet info (icon and name) from instance
  const getAppletInfo = useCallback(
    (instance: AppInstance) => {
      const initialData = instance.initialData as
        | AppletViewerInitialData
        | undefined;
      const path = initialData?.path || "";
      const file = files[path];

      // Get filename from path for label
      const getFileName = (path: string): string => {
        const parts = path.split("/");
        const fileName = parts[parts.length - 1];
        return fileName.replace(/\.(html|app)$/i, "");
      };

      const label = path ? getFileName(path) : t("common.dock.appletStore");

      // Check if the file icon is an emoji (not a file path)
      const fileIcon = file?.icon;
      const isEmojiIcon =
        fileIcon &&
        !fileIcon.startsWith("/") &&
        !fileIcon.startsWith("http") &&
        fileIcon.length <= 10;

      // If no path (applet store), use the applet viewer icon
      // Otherwise, use file icon if emoji, or fallback to package emoji
      let icon: string;
      let isEmoji: boolean;
      if (!path) {
        // Applet store - use app icon
        icon = getAppIconPath("applet-viewer");
        isEmoji = false;
      } else {
        icon = isEmojiIcon ? fileIcon : "📦";
        isEmoji = true;
      }

      return { icon, label, isEmoji };
    },
    [files, t]
  );

  // Pinned apps on the left side (from dock store)
  const pinnedLeft: AppId[] = useMemo(
    () => pinnedItems.filter(item => item.type === "app").map(item => item.id as AppId),
    [pinnedItems]
  );
  
  // Calculate drop index based on cursor position
  const calculateDropIndex = useCallback((clientX: number): number => {
    // Get dock bar bounds
    const dockBar = dockBarRef.current;
    if (!dockBar) return pinnedItems.length;
    
    const dockRect = dockBar.getBoundingClientRect();
    
    // If no pinned items, return 0
    if (pinnedItems.length === 0) return 0;
    
    // Calculate icon width (including margin) based on dock width
    // Each icon is about 56px wide (48px + 8px margin), scaled by effective dock scale
    const iconWidth = Math.round(56 * effectiveDockScale);
    
    // Get the starting X position of the first icon
    // Account for padding (scaled)
    const startX = dockRect.left + scaledPadding;
    
    // Calculate relative position
    const relativeX = clientX - startX;
    
    // Calculate which slot the cursor is in
    const slotIndex = Math.floor(relativeX / iconWidth);
    
    // Clamp to valid range
    return Math.max(0, Math.min(slotIndex, pinnedItems.length));
  }, [pinnedItems.length, effectiveDockScale, scaledPadding]);
  
  // Check if this is an external drag (from desktop/finder, not internal dock reorder)
  const isExternalDrag = useCallback((e: React.DragEvent): boolean => {
    const types = Array.from(e.dataTransfer.types);
    return types.includes("application/json") && !types.includes("application/x-dock-item");
  }, []);

  // Handle external drag over dock (from desktop/finder)
  const handleDockDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Always allow drops so drop event fires
    e.preventDefault();

    // Only show spacer for external drags
    if (!isExternalDrag(e)) return;

    const dropIndex = calculateDropIndex(e.clientX);
    setExternalDragIndex(dropIndex);
  }, [calculateDropIndex, isExternalDrag]);
  
  const handleDockDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isExternalDrag(e)) return;
    setExternalDragIndex((prev) => prev ?? pinnedItems.length);
  }, [isExternalDrag, pinnedItems.length]);
  
  const handleDockDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!isExternalDrag(e)) return;
    setExternalDragIndex(null);
  }, [isExternalDrag]);
  
  const handleDockDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // Only handle external drops
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
      
      // Determine what to add to dock
      let newItem: DockItem | null = null;
      
      // Case 1: App alias from desktop shortcuts (aliasType === "app")
      if (aliasType === "app" && aliasTarget) {
        newItem = { type: "app", id: aliasTarget };
      }
      // Case 2: Direct app ID (from Applications folder files)
      else if (appId) {
        newItem = { type: "app", id: appId };
      }
      // Case 3: Application from /Applications/ path
      else if (path && path.startsWith("/Applications/")) {
        const appFile = getFileItem(path);
        if (appFile?.appId) {
          newItem = { type: "app", id: appFile.appId };
        }
      }
      // Case 4: Applet file (.app or .html)
      else if (path && (path.endsWith(".app") || path.endsWith(".html"))) {
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
  }, [externalDragIndex, pinnedItems.length, getFileItem, addDockItem, isExternalDrag]);
  
  // Handle internal dock item drag start
  const handleItemDragStart = useCallback((e: React.DragEvent, itemId: string, index: number) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-dock-item", JSON.stringify({ id: itemId, index }));
    // Also set application/json so we can distinguish from external drags
    e.dataTransfer.setData("text/plain", itemId);
    setDraggingItemId(itemId);
    setIsDraggedOutside(false);
  }, []);
  
  // Handle internal dock item drag end
  const handleItemDragEnd = useCallback((e: React.DragEvent, itemId: string) => {
    // Check if dropped outside the dock
    const dockRect = dockBarRef.current?.getBoundingClientRect();
    if (dockRect) {
      const isOutside = 
        e.clientX < dockRect.left ||
        e.clientX > dockRect.right ||
        e.clientY < dockRect.top - 50 || // Allow some margin above
        e.clientY > dockRect.bottom + 50; // Allow some margin below
      
      if (isOutside && !PROTECTED_DOCK_ITEMS.has(itemId)) {
        // Remove item from dock
        removeDockItem(itemId);
      }
    }
    
    setDraggingItemId(null);
    setIsDraggedOutside(false);
  }, [removeDockItem]);
  
  // Track when drag leaves dock area
  const handleItemDrag = useCallback((e: React.DragEvent) => {
    const dockRect = dockBarRef.current?.getBoundingClientRect();
    if (dockRect && draggingItemId) {
      const isOutside = 
        e.clientX < dockRect.left - 20 ||
        e.clientX > dockRect.right + 20 ||
        e.clientY < dockRect.top - 60 ||
        e.clientY > dockRect.bottom + 60;
      
      setIsDraggedOutside(isOutside);
    }
  }, [draggingItemId]);
  
  // Reorder state with hysteresis to prevent flip-flopping
  const lastReorderTimeRef = useRef<number>(0);
  const lastReorderTargetRef = useRef<number | null>(null);
  const pendingReorderRef = useRef<{ targetIndex: number; timeout: ReturnType<typeof setTimeout> } | null>(null);
  
  const REORDER_DELAY = 150; // ms delay before reorder commits
  const REORDER_COOLDOWN = 300; // ms cooldown after a reorder before another can happen
  const SWAP_THRESHOLD = 0.65; // Must drag past 65% of an icon's width to trigger swap
  
  // Handle internal reordering when dragging over another item
  const handleItemDragOver = useCallback((e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const types = Array.from(e.dataTransfer.types);
    
    if (!types.includes("application/x-dock-item") || !draggingItemId) {
      return;
    }
    
    e.dataTransfer.dropEffect = "move";
    
    // Don't allow targeting index 0 (Finder's reserved spot)
    if (targetIndex === 0 && pinnedItems[0]?.id === "finder") {
      if (pendingReorderRef.current) {
        clearTimeout(pendingReorderRef.current.timeout);
        pendingReorderRef.current = null;
      }
      return;
    }
    
    const currentIndex = pinnedItems.findIndex(item => item.id === draggingItemId);
    if (currentIndex === -1 || currentIndex === targetIndex) {
      // Clear pending if we're back at current position
      if (pendingReorderRef.current && currentIndex === targetIndex) {
        clearTimeout(pendingReorderRef.current.timeout);
        pendingReorderRef.current = null;
      }
      return;
    }
    
    // Check cooldown - don't allow rapid successive reorders
    const now = Date.now();
    if (now - lastReorderTimeRef.current < REORDER_COOLDOWN) {
      return;
    }
    
    // Get the target element to check cursor position within it
    const targetElement = iconRefsMap.current.get(pinnedItems[targetIndex]?.id);
    if (targetElement) {
      const rect = targetElement.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const percentAcross = relativeX / rect.width;
      
      // Determine if we should swap based on direction and threshold
      // For moving right, cursor must be past SWAP_THRESHOLD of the target
      // For moving left, cursor must be before (1 - SWAP_THRESHOLD) of the target
      const movingRight = targetIndex > currentIndex;
      const shouldSwap = movingRight 
        ? percentAcross > SWAP_THRESHOLD
        : percentAcross < (1 - SWAP_THRESHOLD);
      
      if (!shouldSwap) {
        // Clear pending if threshold not met
        if (pendingReorderRef.current) {
          clearTimeout(pendingReorderRef.current.timeout);
          pendingReorderRef.current = null;
        }
        return;
      }
    }
    
    // If we're already pending for this target, do nothing
    if (pendingReorderRef.current?.targetIndex === targetIndex) {
      return;
    }
    
    // Clear any existing pending reorder
    if (pendingReorderRef.current) {
      clearTimeout(pendingReorderRef.current.timeout);
    }
    
    // Schedule reorder after delay
    const timeout = setTimeout(() => {
      // Re-check conditions
      const newCurrentIndex = pinnedItems.findIndex(item => item.id === draggingItemId);
      const timeSinceLastReorder = Date.now() - lastReorderTimeRef.current;
      
      if (newCurrentIndex !== -1 && newCurrentIndex !== targetIndex && timeSinceLastReorder >= REORDER_COOLDOWN) {
        reorderItems(newCurrentIndex, targetIndex);
        lastReorderTimeRef.current = Date.now();
        lastReorderTargetRef.current = targetIndex;
      }
      pendingReorderRef.current = null;
    }, REORDER_DELAY);
    
    pendingReorderRef.current = { targetIndex, timeout };
  }, [draggingItemId, pinnedItems, reorderItems]);
  
  // Clean up pending reorder on drag end and reset state
  useEffect(() => {
    if (!draggingItemId) {
      if (pendingReorderRef.current) {
        clearTimeout(pendingReorderRef.current.timeout);
        pendingReorderRef.current = null;
      }
      lastReorderTargetRef.current = null;
    }
  }, [draggingItemId]);

  // Handle non-pinned app drag start (for pinning)
  const handleNonPinnedDragStart = useCallback((e: React.DragEvent, appId: AppId) => {
    e.dataTransfer.effectAllowed = "copy";
    // Set data as application/json so it's treated like an external drag for pinning
    e.dataTransfer.setData("application/json", JSON.stringify({ appId }));
  }, []);

  // Handle divider drag over (for pinning non-pinned apps)
  const handleDividerDragOver = useCallback((e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer.types);
    // Only accept external drags (non-pinned apps or from finder/desktop)
    if (types.includes("application/json") && !types.includes("application/x-dock-item")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setIsDividerDropTarget(true);
      // Set drop index to end of pinned items
      setExternalDragIndex(pinnedItems.length);
    }
  }, [pinnedItems.length]);

  const handleDividerDragLeave = useCallback(() => {
    setIsDividerDropTarget(false);
  }, []);

  const handleDividerDrop = useCallback((e: React.DragEvent) => {
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
        // Pin the app at the end
        addDockItem({ type: "app", id: appId }, pinnedItems.length);
      }
    } catch (err) {
      console.warn("[Dock] Failed to handle divider drop:", err);
    }
  }, [addDockItem, pinnedItems.length]);

  // Compute open apps and individual applet instances
  const openItems = useMemo(() => {
    const items: Array<{
      type: "app" | "applet";
      appId: AppId;
      instanceId?: string;
      sortKey: number;
    }> = [];

    // Group instances by appId
    const openByApp: Record<string, AppInstance[]> = {};
    Object.values(instances)
      .filter((i) => i.isOpen)
      .forEach((i) => {
        if (!openByApp[i.appId]) openByApp[i.appId] = [];
        openByApp[i.appId].push(i);
      });

    // For each app, either add individual applet instances or a single app entry
    Object.entries(openByApp).forEach(([appId, instancesList]) => {
      if (appId === "applet-viewer") {
        // Add each applet instance separately
        instancesList.forEach((inst) => {
          items.push({
            type: "applet",
            appId: inst.appId as AppId,
            instanceId: inst.instanceId,
            sortKey: inst.createdAt || 0,
          });
        });
      } else {
        // Add a single entry for this app
        items.push({
          type: "app",
          appId: appId as AppId,
          sortKey: instancesList[0]?.createdAt ?? 0,
        });
      }
    });

    // Sort by creation time to keep a stable order
    items.sort((a, b) => a.sortKey - b.sortKey);
    
    // Filter out pinned apps
    return items.filter((item) => !pinnedLeft.includes(item.appId));
  }, [instances, pinnedLeft]);

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

  // Generate context menu items for an app
  const getAppContextMenuItems = useCallback(
    (appId: AppId, specificInstanceId?: string): MenuItem[] => {
      const items: MenuItem[] = [];
      
      // Get all open instances of this app
      const appInstances = Object.values(instances).filter(
        (inst) => inst.appId === appId && inst.isOpen
      );
      
      // For non-opened apps, show "Open" and optionally "Remove from Dock"
      if (appInstances.length === 0 && !specificInstanceId) {
        items.push({
          type: "item",
          label: t("common.dock.open"),
          onSelect: () => {
            if (appId === "finder") {
              launchApp("finder", { initialPath: "/" });
            } else {
              launchApp(appId);
            }
          },
        });
        
        // Add "Remove from Dock" for pinned, non-protected items
        const isPinned = pinnedItems.some(item => item.type === "app" && item.id === appId);
        const isProtected = PROTECTED_DOCK_ITEMS.has(appId);
        
        if (isPinned && !isProtected) {
          items.push({ type: "separator" });
          items.push({
            type: "item",
            label: t("common.dock.removeFromDock") || "Remove from Dock",
            onSelect: () => {
              removeDockItem(appId);
            },
          });
        }
        
        return items;
      }
      
      // For applet-viewer with a specific instance, only show that applet's menu
      if (appId === "applet-viewer" && specificInstanceId) {
        const instance = instances[specificInstanceId];
        if (instance) {
          // Single applet instance - show its window
          const { label } = getAppletInfo(instance);
          const isForeground = !!(instance.isForeground && !instance.isMinimized);
          items.push({
            type: "checkbox",
            label: `${label}${instance.isMinimized ? ` ${t("common.dock.minimized")}` : ""}`,
            checked: isForeground,
            onSelect: () => {
              if (instance.isMinimized) {
                restoreInstance(specificInstanceId);
              }
              bringInstanceToForeground(specificInstanceId);
            },
          });
          
          items.push({ type: "separator" });
          
          // Show All Windows (Expose View)
          items.push({
            type: "item",
            label: t("common.dock.showAllWindows"),
            onSelect: () => {
              // Trigger Expose View
              window.dispatchEvent(new CustomEvent("toggleExposeView"));
            },
          });
          
          // Hide
          items.push({
            type: "item",
            label: t("common.dock.hide"),
            onSelect: () => {
              playZoomMinimize();
              minimizeInstance(specificInstanceId);
            },
            disabled: instance.isMinimized,
          });
          
          // Quit
          items.push({
            type: "item",
            label: t("common.dock.quit"),
            onSelect: () => {
              // If minimized, close directly without animation/sound (window isn't visible)
              if (instance.isMinimized) {
                closeAppInstance(specificInstanceId);
              } else {
                requestCloseWindow(specificInstanceId);
              }
            },
          });
          
          return items;
        }
      }
      
      // List existing windows if any
      if (appInstances.length > 0) {
        appInstances.forEach((inst) => {
          let windowLabel = inst.displayTitle || inst.title || appRegistry[appId]?.name || appId;
          
          // For Finder, show the current path with localized folder name
          if (appId === "finder") {
            const finderState = finderInstances[inst.instanceId];
            if (finderState?.currentPath) {
              if (finderState.currentPath === "/") {
                // Root path - use localized "Macintosh HD"
                windowLabel = t("apps.finder.window.macintoshHd");
              } else {
                const pathParts = finderState.currentPath.split("/");
                const lastSegment = pathParts[pathParts.length - 1] || "";
                try {
                  const decodedName = decodeURIComponent(lastSegment);
                  windowLabel = getTranslatedFolderNameFromName(decodedName);
                } catch {
                  windowLabel = getTranslatedFolderNameFromName(lastSegment);
                }
              }
            }
          }
          
          const isForeground = !!(inst.isForeground && !inst.isMinimized);
          items.push({
            type: "checkbox",
            label: `${windowLabel}${inst.isMinimized ? ` ${t("common.dock.minimized")}` : ""}`,
            checked: isForeground,
            onSelect: () => {
              if (inst.isMinimized) {
                restoreInstance(inst.instanceId);
              }
              bringInstanceToForeground(inst.instanceId);
            },
          });
        });
        
        items.push({ type: "separator" });
      }
      
      // New Window option for multi-instance apps
      if (MULTI_WINDOW_APPS.includes(appId)) {
        items.push({
          type: "item",
          label: t("common.dock.newWindow"),
          onSelect: () => {
            if (appId === "finder") {
              launchApp("finder", { initialPath: "/" });
            } else {
              launchApp(appId);
            }
          },
        });
        
        items.push({ type: "separator" });
      }
      
      // Add/Remove from Dock options (before Show All Windows section)
      const isPinned = pinnedItems.some(item => item.type === "app" && item.id === appId);
      const isProtected = PROTECTED_DOCK_ITEMS.has(appId);
      
      if (isPinned && !isProtected) {
        // Show "Remove from Dock" for pinned, non-protected items
        items.push({
          type: "item",
          label: t("common.dock.removeFromDock"),
          onSelect: () => {
            removeDockItem(appId);
          },
        });
        items.push({ type: "separator" });
      } else if (!isPinned && !isProtected && appInstances.length > 0) {
        // Show "Add to Dock" for running apps that aren't pinned
        items.push({
          type: "item",
          label: t("common.dock.addToDock"),
          onSelect: () => {
            addDockItem({ type: "app", id: appId });
          },
        });
        items.push({ type: "separator" });
      }
      
      // Show All Windows (Expose View)
      items.push({
        type: "item",
        label: t("common.dock.showAllWindows"),
        onSelect: () => {
          // Trigger Expose View
          window.dispatchEvent(new CustomEvent("toggleExposeView"));
        },
        disabled: appInstances.length === 0,
      });
      
      // Hide (minimize all)
      items.push({
        type: "item",
        label: t("common.dock.hide"),
        onSelect: () => {
          // Play sound once for the hide action
          playZoomMinimize();
          appInstances.forEach((inst) => {
            if (!inst.isMinimized) {
              minimizeInstance(inst.instanceId);
            }
          });
        },
        disabled: appInstances.length === 0 || appInstances.every((inst) => inst.isMinimized),
      });
      
      // Quit (close all)
      items.push({
        type: "item",
        label: t("common.dock.quit"),
        onSelect: () => {
          appInstances.forEach((inst) => {
            // If minimized, close directly without animation/sound (window isn't visible)
            if (inst.isMinimized) {
              closeAppInstance(inst.instanceId);
            } else {
              requestCloseWindow(inst.instanceId);
            }
          });
        },
        disabled: appInstances.length === 0,
      });
      
      return items;
    },
    [instances, finderInstances, getAppletInfo, restoreInstance, bringInstanceToForeground, minimizeInstance, closeAppInstance, playZoomMinimize, launchApp, pinnedItems, removeDockItem, addDockItem, t]
  );

  // Generate context menu items for a folder shortcut
  const getFolderContextMenuItems = useCallback(
    (folderPath: string, isTrash: boolean = false): MenuItem[] => {
      const items: MenuItem[] = [];
      
      // Handle virtual directories
      let sortedItems: Array<{
        name: string;
        path: string;
        isDirectory: boolean;
        appId?: AppId;
        aliasType?: "file" | "app";
        aliasTarget?: string;
        icon?: string;
      }> = [];
      
      if (folderPath === "/Applications") {
        // Applications is a virtual directory - get apps from registry
        const apps = getNonFinderApps(isAdmin);
        sortedItems = apps.map((app) => ({
          name: app.name,
          path: `/Applications/${app.name}`,
          isDirectory: false,
          appId: app.id,
          aliasType: "app" as const,
          aliasTarget: app.id,
          icon: app.icon,
        })).sort((a, b) => a.name.localeCompare(b.name));
      } else {
        // Regular directory - get items from file store
        const folderItems = getFilesInPath(folderPath);
        sortedItems = folderItems.map((item) => {
          let icon: string | undefined;
          
          // Get icon for the item
          if (item.aliasType === "app" && item.aliasTarget) {
            // App alias - get icon from app registry
            icon = getAppIconPath(item.aliasTarget as AppId);
          } else if (item.aliasType === "file" && item.aliasTarget) {
            // File alias - get icon from target file
            const targetFile = getFileItem(item.aliasTarget);
            icon = targetFile?.icon || "/icons/default/file.png";
          } else if (item.isDirectory) {
            // Directory - use folder icon
            icon = item.icon || "/icons/directory.png";
          } else if (item.icon) {
            // Use stored icon
            icon = item.icon;
          } else {
            // Default file icon
            icon = "/icons/default/file.png";
          }
          
          return {
            name: item.name,
            path: item.path,
            isDirectory: item.isDirectory,
            appId: item.appId as AppId | undefined,
            aliasType: item.aliasType,
            aliasTarget: item.aliasTarget,
            icon,
          };
        }).sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
      }
      
      // Add "Open" option
      items.push({
        type: "item",
        label: t("common.dock.open"),
        onSelect: () => {
          focusFinderAtPathOrLaunch(folderPath);
          if (isTrash) {
            setTrashContextMenuPos(null);
          } else {
            setApplicationsContextMenuPos(null);
          }
        },
      });
      
      // Add separator if there are items
      if (sortedItems.length > 0) {
        items.push({ type: "separator" });
        
        // Create submenu items for folder contents
        const submenuItems: MenuItem[] = sortedItems.map((item) => {
          let displayName = item.name;
          
          // For directories, use translated folder name
          if (item.isDirectory) {
            displayName = getTranslatedFolderNameFromName(item.name);
          } else if (item.aliasType === "app" && item.aliasTarget) {
            // For app aliases, use translated app name
            displayName = getTranslatedAppName(item.aliasTarget as AppId);
          } else if (item.appId) {
            // For Applications folder apps, use translated app name
            displayName = getTranslatedAppName(item.appId);
          } else {
            // Remove file extension for display
            displayName = item.name.replace(/\.[^/.]+$/, "");
          }
          
          return {
            type: "item",
            label: displayName,
            icon: item.icon,
            onSelect: () => {
              if (item.isDirectory) {
                // Open folder in Finder
                focusFinderAtPathOrLaunch(item.path);
              } else if (item.appId) {
                // Launch app (from Applications folder)
                const appId = item.appId;
                if (appId === "finder") {
                  focusOrLaunchFinder("/");
                } else {
                  focusOrLaunchApp(appId);
                }
              } else if (item.aliasType === "app" && item.aliasTarget) {
                // Launch app
                const appId = item.aliasTarget as AppId;
                if (appId === "finder") {
                  focusOrLaunchFinder("/");
                } else {
                  focusOrLaunchApp(appId);
                }
              } else if (item.aliasType === "file" && item.aliasTarget) {
                // Open file alias - resolve target and open
                const targetFile = getFileItem(item.aliasTarget);
                if (targetFile) {
                  if (targetFile.isDirectory) {
                    focusFinderAtPathOrLaunch(targetFile.path);
                  } else {
                    // For files, open in Finder at the file's location
                    const parentPath = item.aliasTarget.substring(0, item.aliasTarget.lastIndexOf("/"));
                    focusFinderAtPathOrLaunch(parentPath || "/");
                  }
                }
              } else {
                // Regular file - open in Finder at the file's location
                const parentPath = item.path.substring(0, item.path.lastIndexOf("/"));
                focusFinderAtPathOrLaunch(parentPath || "/");
              }
              // Close the context menu
              if (isTrash) {
                setTrashContextMenuPos(null);
              } else {
                setApplicationsContextMenuPos(null);
              }
            },
          };
        });
        
        // Add submenu with folder contents
        items.push({
          type: "submenu",
          label: t("common.dock.folderContents") || "Folder Contents",
          items: submenuItems,
        });
      }
      
      // For Trash, add separator and Empty Trash option
      if (isTrash) {
        items.push({ type: "separator" });
        items.push({
          type: "item",
          label: t("apps.finder.contextMenu.emptyTrash"),
          onSelect: () => {
            setIsEmptyTrashDialogOpen(true);
            setTrashContextMenuPos(null);
          },
          disabled: isTrashEmpty,
        });
      }
      
      return items;
    },
    [getFilesInPath, getFileItem, focusFinderAtPathOrLaunch, focusOrLaunchFinder, focusOrLaunchApp, isTrashEmpty, t, isAdmin]
  );

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

  // Dock magnification state/logic driven by Framer motion value at container level
  const mouseX = useMotionValue<number>(Infinity);

  // Disable magnification on mobile/touch (coarse pointer or no hover)
  const [magnifyEnabled, setMagnifyEnabled] = useState(true);
  useEffect(() => {
    const compute = () => {
      if (
        typeof window === "undefined" ||
        typeof window.matchMedia !== "function"
      ) {
        setMagnifyEnabled(true);
        return;
      }
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const noHover = window.matchMedia("(hover: none)").matches;
      setMagnifyEnabled(!(coarse || noHover));
    };
    compute();

    const mqlPointerCoarse = window.matchMedia("(pointer: coarse)");
    const mqlHoverNone = window.matchMedia("(hover: none)");

    const onChange = () => compute();

    const removeListeners: Array<() => void> = [];

    const addListener = (mql: MediaQueryList) => {
      if (typeof mql.addEventListener === "function") {
        const listener = onChange as EventListener;
        mql.addEventListener("change", listener);
        removeListeners.push(() => mql.removeEventListener("change", listener));
      } else if (
        typeof (
          mql as {
            addListener?: (
              this: MediaQueryList,
              listener: (ev: MediaQueryListEvent) => void
            ) => void;
          }
        ).addListener === "function"
      ) {
        const legacyListener = () => onChange();
        (mql as MediaQueryList).addListener!(legacyListener);
        removeListeners.push(() =>
          (mql as MediaQueryList).removeListener!(legacyListener)
        );
      }
    };

    addListener(mqlPointerCoarse);
    addListener(mqlHoverNone);

    return () => {
      removeListeners.forEach((fn) => fn());
    };
  }, []);

  // Effective magnification: disabled when resizing, on touch devices, or user preference
  const effectiveMagnifyEnabled = magnifyEnabled && !isResizing && dockMagnification;

  // Ensure no magnification state is applied when disabled
  useEffect(() => {
    if (!effectiveMagnifyEnabled) mouseX.set(Infinity);
  }, [effectiveMagnifyEnabled, mouseX]);

  // Track which icons have appeared before to control enter animations
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [hasMounted, setHasMounted] = useState(false);
  // Mark all currently visible ids as seen whenever the set changes
  const allVisibleIds = useMemo(() => {
    const ids = [
      ...pinnedItems.map(item => item.id),
      ...openItems.map((item) =>
        item.type === "applet" ? item.instanceId! : item.appId
      ),
      "__applications__",
      "__trash__",
    ];
    return ids;
  }, [pinnedItems, openItems]);
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
            background: "rgba(248, 248, 248, 0.75)",
            backgroundImage: "var(--os-pinstripe-menubar)",
            border: "none",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
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
              {/* Left pinned items from dock store */}
              {(() => {
                // Build array of elements with spacer inserted at correct position
                const elements: React.ReactNode[] = [];
                
                pinnedItems.forEach((item, index) => {
                  // Insert spacer before this item if it's the drop target
                  if (externalDragIndex === index) {
                    elements.push(<DockSpacer key="dock-drop-spacer" idKey="dock-drop-spacer" mouseX={mouseX} magnifyEnabled={effectiveMagnifyEnabled} baseSize={scaledButtonSize} />);
                  }
                  
                  if (item.type === "app") {
                    const appId = item.id as AppId;
                    const icon = getAppIconPath(appId);
                    const isOpen = openAppsAllSet.has(appId);
                    const isLoading = Object.values(instances).some(
                      (i) => i.appId === appId && i.isOpen && i.isLoading
                    );
                    const label = getTranslatedAppName(appId);
                    const isProtected = PROTECTED_DOCK_ITEMS.has(item.id);
                    
                    elements.push(
                      <IconButton
                        key={appId}
                        ref={(el) => {
                          if (el) iconRefsMap.current.set(item.id, el);
                          else iconRefsMap.current.delete(item.id);
                        }}
                        label={label}
                        icon={icon}
                        idKey={appId}
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const launchOrigin: LaunchOriginRect = {
                            x: rect.left,
                            y: rect.top,
                            width: rect.width,
                            height: rect.height,
                          };
                          if (appId === "finder") {
                            focusOrLaunchFinder("/", launchOrigin);
                          } else {
                            focusOrLaunchApp(appId, undefined, launchOrigin);
                          }
                        }}
                        onContextMenu={(e) => handleAppContextMenu(e, appId)}
                        showIndicator={isOpen}
                        isLoading={isLoading}
                        mouseX={mouseX}
                        magnifyEnabled={effectiveMagnifyEnabled}
                        isNew={hasMounted && !seenIdsRef.current.has(appId)}
                        isHovered={hoveredId === appId}
                        isSwapping={isSwapping}
                        onHover={() => handleIconHover(appId)}
                        onLeave={handleIconLeave}
                        draggable={!isProtected}
                        onDragStart={(e) => handleItemDragStart(e, item.id, index)}
                        onDragEnd={(e) => handleItemDragEnd(e, item.id)}
                        onDragOver={(e) => handleItemDragOver(e, index)}
                        isDragging={draggingItemId === item.id}
                        isDraggedOutside={draggingItemId === item.id && isDraggedOutside}
                        baseSize={scaledButtonSize}
                      />
                    );
                  } else {
                    // File/applet pinned item
                    const file = item.path ? getFileItem(item.path) : null;
                    const isEmojiIcon = item.icon && !item.icon.startsWith("/") && !item.icon.startsWith("http") && item.icon.length <= 10;
                    const icon = isEmojiIcon ? item.icon! : (file?.icon || "📦");
                    const label = item.name || item.path?.split("/").pop()?.replace(/\.(app|html)$/i, "") || "Applet";
                    
                    elements.push(
                      <IconButton
                        key={item.id}
                        ref={(el) => {
                          if (el) iconRefsMap.current.set(item.id, el);
                          else iconRefsMap.current.delete(item.id);
                        }}
                        label={label}
                        icon={icon}
                        idKey={item.id}
                        isEmoji={isEmojiIcon || (!item.icon?.startsWith("/") && !item.icon?.startsWith("http"))}
                        onClick={(e) => {
                          if (item.path) {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const launchOrigin: LaunchOriginRect = {
                              x: rect.left,
                              y: rect.top,
                              width: rect.width,
                              height: rect.height,
                            };
                            launchApp("applet-viewer", {
                              initialData: { path: item.path },
                              launchOrigin,
                            });
                          }
                        }}
                        mouseX={mouseX}
                        magnifyEnabled={effectiveMagnifyEnabled}
                        isNew={hasMounted && !seenIdsRef.current.has(item.id)}
                        isHovered={hoveredId === item.id}
                        isSwapping={isSwapping}
                        onHover={() => handleIconHover(item.id)}
                        onLeave={handleIconLeave}
                        draggable
                        onDragStart={(e) => handleItemDragStart(e, item.id, index)}
                        onDragEnd={(e) => handleItemDragEnd(e, item.id)}
                        onDragOver={(e) => handleItemDragOver(e, index)}
                        isDragging={draggingItemId === item.id}
                        isDraggedOutside={draggingItemId === item.id && isDraggedOutside}
                        baseSize={scaledButtonSize}
                      />
                    );
                  }
                });
                
                // Add spacer at end if dropping after all items
                if (externalDragIndex === pinnedItems.length) {
                  elements.push(<DockSpacer key="dock-drop-spacer" idKey="dock-drop-spacer" mouseX={mouseX} magnifyEnabled={effectiveMagnifyEnabled} baseSize={scaledButtonSize} />);
                }
                
                return elements;
              })()}

              {/* Divider between pinned and non-pinned apps */}
              {openItems.length > 0 && (
                <Divider 
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

              {/* Open apps and applet instances dynamically (excluding pinned) */}
              {openItems.map((item) => {
                if (item.type === "applet" && item.instanceId) {
                  // Render individual applet instance
                  const instance = instances[item.instanceId];
                  if (!instance) return null;

                  const { icon, label, isEmoji } = getAppletInfo(instance);
                  return (
                    <IconButton
                      key={item.instanceId}
                      label={label}
                      icon={icon}
                      idKey={item.instanceId}
                      onClick={(_e) => {
                        // If minimized, restore it; otherwise just bring to foreground
                        if (instance.isMinimized) {
                          restoreInstance(item.instanceId!);
                        } else {
                          bringInstanceToForeground(item.instanceId!);
                        }
                      }}
                      onContextMenu={(e) => handleAppContextMenu(e, "applet-viewer", item.instanceId)}
                      showIndicator
                      isLoading={instance.isLoading}
                      isEmoji={isEmoji}
                      mouseX={mouseX}
                      magnifyEnabled={effectiveMagnifyEnabled}
                      isNew={hasMounted && !seenIdsRef.current.has(item.instanceId!)}
                      isHovered={hoveredId === item.instanceId}
                      isSwapping={isSwapping}
                      onHover={() => handleIconHover(item.instanceId!)}
                      onLeave={handleIconLeave}
                      baseSize={scaledButtonSize}
                    />
                  );
                } else {
                  // Render regular app
                  const icon = getAppIconPath(item.appId);
                  const label = getTranslatedAppName(item.appId);
                  const isLoading = Object.values(instances).some(
                    (i) => i.appId === item.appId && i.isOpen && i.isLoading
                  );
                  return (
                    <IconButton
                      key={item.appId}
                      label={label}
                      icon={icon}
                      idKey={item.appId}
                      onClick={(_e) => focusMostRecentInstanceOfApp(item.appId)}
                      onContextMenu={(e) => handleAppContextMenu(e, item.appId)}
                      showIndicator
                      isLoading={isLoading}
                      mouseX={mouseX}
                      magnifyEnabled={effectiveMagnifyEnabled}
                      isNew={hasMounted && !seenIdsRef.current.has(item.appId)}
                      isHovered={hoveredId === item.appId}
                      isSwapping={isSwapping}
                      onHover={() => handleIconHover(item.appId)}
                      onLeave={handleIconLeave}
                      draggable
                      onDragStart={(e) => handleNonPinnedDragStart(e, item.appId)}
                      baseSize={scaledButtonSize}
                    />
                  );
                }
              })}

              {/* Divider between open apps and Applications/Trash */}
              <Divider 
                key="divider-between" 
                idKey="between" 
                height={scaledButtonSize}
                resizable={!isPhone}
                onResizeStart={handleResizeStart}
                onContextMenu={handleDividerContextMenu}
                {...dividerLongPress}
              />

              {/* Applications (left of Trash) */}
              {(() => {
                const handleApplicationsContextMenu = (
                  e: React.MouseEvent<HTMLButtonElement>
                ) => {
                  e.preventDefault();
                  e.stopPropagation();

                  const containerRect =
                    dockContainerRef.current?.getBoundingClientRect();
                  if (!containerRect) {
                    setApplicationsContextMenuPos({ x: e.clientX, y: e.clientY });
                    return;
                  }

                  setApplicationsContextMenuPos({
                    x: e.clientX - containerRect.left,
                    y: e.clientY - containerRect.top,
                  });
                };

                return (
                  <IconButton
                    key="__applications__"
                    label={t("common.dock.applications")}
                    icon="/icons/default/applications.png"
                    idKey="__applications__"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const launchOrigin: LaunchOriginRect = {
                        x: rect.left,
                        y: rect.top,
                        width: rect.width,
                        height: rect.height,
                      };
                      focusFinderAtPathOrLaunch("/Applications", {
                        path: "/Applications",
                        viewType: "large",
                      }, launchOrigin);
                    }}
                    onContextMenu={handleApplicationsContextMenu}
                    mouseX={mouseX}
                    magnifyEnabled={effectiveMagnifyEnabled}
                    isNew={hasMounted && !seenIdsRef.current.has("__applications__")}
                    isHovered={hoveredId === "__applications__"}
                    isSwapping={isSwapping}
                    onHover={() => handleIconHover("__applications__")}
                    onLeave={handleIconLeave}
                    baseSize={scaledButtonSize}
                  />
                );
              })()}

              {/* Trash (right side) */}
              {(() => {
                const handleTrashDragOver = (e: React.DragEvent<HTMLButtonElement>) => {
                  // Check if this is a desktop shortcut being dragged
                  // We can't use getData in dragOver, so check types instead
                  const types = Array.from(e.dataTransfer.types);
                  if (types.includes("application/json")) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = "move";
                    setIsDraggingOverTrash(true);
                  }
                };

                const handleTrashDrop = (e: React.DragEvent<HTMLButtonElement>) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingOverTrash(false);

                  try {
                    const data = e.dataTransfer.getData("application/json");
                    if (data) {
                      const parsed = JSON.parse(data);
                      // Only handle desktop shortcuts
                      if (parsed.path && parsed.path.startsWith("/Desktop/")) {
                        // Move shortcut to trash
                        removeFileItem(parsed.path);
                      }
                    }
                  } catch (err) {
                    console.warn("[Dock] Failed to handle trash drop:", err);
                  }
                };

                const handleTrashDragLeave = (e: React.DragEvent<HTMLButtonElement>) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingOverTrash(false);
                };

                const handleTrashContextMenu = (
                  e: React.MouseEvent<HTMLButtonElement>
                ) => {
                  e.preventDefault();
                  e.stopPropagation();

                  const containerRect =
                    dockContainerRef.current?.getBoundingClientRect();
                  if (!containerRect) {
                    setTrashContextMenuPos({ x: e.clientX, y: e.clientY });
                    return;
                  }

                  setTrashContextMenuPos({
                    x: e.clientX - containerRect.left,
                    y: e.clientY - containerRect.top,
                  });
                };

                return (
                  <motion.div
                    animate={{
                      scale: isDraggingOverTrash ? 1.2 : 1,
                      opacity: isDraggingOverTrash ? 0.7 : 1,
                    }}
                    transition={{ duration: 0.2 }}
                  >
                    <IconButton
                      key="__trash__"
                      label={t("common.dock.trash")}
                      icon={trashIcon}
                      idKey="__trash__"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const launchOrigin: LaunchOriginRect = {
                          x: rect.left,
                          y: rect.top,
                          width: rect.width,
                          height: rect.height,
                        };
                        focusFinderAtPathOrLaunch("/Trash", undefined, launchOrigin);
                      }}
                      onDragOver={handleTrashDragOver}
                      onDrop={handleTrashDrop}
                      onDragLeave={handleTrashDragLeave}
                      onContextMenu={handleTrashContextMenu}
                      mouseX={mouseX}
                      magnifyEnabled={effectiveMagnifyEnabled}
                      isNew={hasMounted && !seenIdsRef.current.has("__trash__")}
                      isHovered={hoveredId === "__trash__"}
                      isSwapping={isSwapping}
                      onHover={() => handleIconHover("__trash__")}
                      onLeave={handleIconLeave}
                      baseSize={scaledButtonSize}
                    />
                  </motion.div>
                );
              })()}
            </AnimatePresence>
          </LayoutGroup>
        </motion.div>
      </div>
      
      {/* Invisible hover zone at bottom edge to trigger dock reveal when hiding is enabled */}
      {dockHiding && !isDockVisible && (
        <div
          className="fixed left-0 right-0 z-40"
          style={{
            bottom: 0,
            // Desktop: half dock height, Mobile: full dock height + safe area
            height: isPhone 
              ? `calc(${scaledDockHeight}px + env(safe-area-inset-bottom, 0px))` 
              : Math.max(Math.round(scaledDockHeight / 2), 8),
            pointerEvents: "auto",
            // Debug: uncomment to visualize hover zone
            // backgroundColor: "rgba(255, 0, 0, 0.2)",
          }}
          onMouseEnter={showDock}
          onTouchStart={(e) => {
            e.preventDefault();
            showDock();
          }}
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

export function Dock() {
  const currentTheme = useThemeStore((s) => s.current);
  if (currentTheme !== "macosx") return null;
  return <MacDock />;
}
