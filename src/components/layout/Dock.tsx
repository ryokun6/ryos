import {
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
  forwardRef,
} from "react";
import type React from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { useAppStoreShallow } from "@/stores/helpers";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { AppId, getAppIconPath, appRegistry } from "@/config/appRegistry";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useFinderStore } from "@/stores/useFinderStore";
import { useFilesStore } from "@/stores/useFilesStore";
import { useIsPhone } from "@/hooks/useIsPhone";
import { useLongPress } from "@/hooks/useLongPress";
import type { AppInstance } from "@/stores/useAppStore";
import type { AppletViewerInitialData } from "@/apps/applet-viewer";
import { RightClickMenu, MenuItem } from "@/components/ui/right-click-menu";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
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

const MAX_SCALE = 2.3; // peak multiplier at cursor center
const DISTANCE = 140; // px range where magnification is applied
const BASE_BUTTON_SIZE = 48; // px (w-12)

interface IconButtonProps {
  label: string;
  onClick: () => void;
  icon: string;
  idKey: string;
  showIndicator?: boolean;
  isEmoji?: boolean;
  onDragOver?: (e: React.DragEvent<HTMLButtonElement>) => void;
  onDrop?: (e: React.DragEvent<HTMLButtonElement>) => void;
  onDragLeave?: (e: React.DragEvent<HTMLButtonElement>) => void;
  onContextMenu?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  mouseX: MotionValue<number>;
  magnifyEnabled: boolean;
  isNew: boolean;
  isHovered: boolean;
  isSwapping: boolean;
  onHover: () => void;
  onLeave: () => void;
  isLoading?: boolean;
}

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
    },
    forwardedRef
  ) => {
    const baseButtonSize = BASE_BUTTON_SIZE;
    const maxButtonSize = Math.round(baseButtonSize * MAX_SCALE);
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const isPresent = useIsPresent();
    const distanceCalc = useTransform(mouseX, (val) => {
      const bounds = wrapperRef.current?.getBoundingClientRect();
      if (!bounds || !Number.isFinite(val)) return Infinity;
      return val - (bounds.left + bounds.width / 2);
    });
    const sizeTransform = useTransform(
      distanceCalc,
      [-DISTANCE, 0, DISTANCE],
      [baseButtonSize, maxButtonSize, baseButtonSize]
    );
    const sizeSpring = useSpring(sizeTransform, {
      mass: 0.15,
      stiffness: 160,
      damping: 18,
    });
    const widthValue = isPresent
      ? magnifyEnabled
        ? sizeSpring
        : baseButtonSize
      : 0;

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

    return (
      <motion.div
        ref={setCombinedRef}
        layout
        layoutId={`dock-icon-${idKey}`}
        data-dock-icon={idKey}
        initial={isNew ? { scale: 0, opacity: 0 } : undefined}
        animate={{ scale: 1, opacity: 1 }}
        exit={{
          scale: 0,
          opacity: 0,
        }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 30,
          mass: 0.8,
          layout: {
            type: "spring",
            stiffness: 300,
            damping: 30,
            mass: 0.8,
          },
        }}
        style={{
          transformOrigin: "bottom center",
          willChange: "width, height, transform",
          width: widthValue,
          height: widthValue,
          marginLeft: isPresent ? 4 : 0,
          marginRight: isPresent ? 4 : 0,
          overflow: "visible",
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
              className="absolute bottom-full mb-3 left-1/2 px-3 py-1 bg-gray-800 text-white/90 text-sm font-medium rounded-full shadow-xl whitespace-nowrap pointer-events-none z-50"
            >
              {label}
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-gray-800" />
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
          {...(onDragOver && { onDragOver })}
          {...(onDrop && { onDrop })}
          {...(onDragLeave && { onDragLeave })}
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

const Divider = forwardRef<HTMLDivElement, { idKey: string }>(
  ({ idKey }, ref) => (
    <motion.div
      ref={ref}
      layout
      layoutId={`dock-divider-${idKey}`}
      initial={{ opacity: 0, scaleY: 0.8 }}
      animate={{ opacity: 0.9, scaleY: 1 }}
      exit={{ opacity: 0, scaleY: 0.8 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="bg-black/20"
      style={{
        width: 1,
        height: 48,
        marginLeft: 6,
        marginRight: 6,
        alignSelf: "center",
      }}
    />
  )
);

// Apps that support multi-window
const MULTI_WINDOW_APPS: AppId[] = ["textedit", "finder", "applet-viewer"];

function MacDock() {
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

  const launchApp = useLaunchApp();
  const files = useFilesStore((s) => s.items);
  const fileStore = useFilesStore();
  const trashIcon = useFilesStore(
    (s) => s.items["/Trash"]?.icon || "/icons/trash-empty.png"
  );
  const finderInstances = useFinderStore((s) => s.instances);
  const [isDraggingOverTrash, setIsDraggingOverTrash] = useState(false);
  const [trashContextMenuPos, setTrashContextMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isEmptyTrashDialogOpen, setIsEmptyTrashDialogOpen] = useState(false);
  const dockContainerRef = useRef<HTMLDivElement | null>(null);
  
  // App context menu state
  const [appContextMenu, setAppContextMenu] = useState<{
    x: number;
    y: number;
    appId: AppId;
    instanceId?: string; // For applet instances
  } | null>(null);
  
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isSwapping, setIsSwapping] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      const label = path ? getFileName(path) : "Applet Store";

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
    [files]
  );

  // Pinned apps on the left side (in order)
  const pinnedLeft: AppId[] = useMemo(
    () => ["finder", "chats", "internet-explorer"] as AppId[],
    []
  );

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
    (appId: AppId, initialData?: unknown) => {
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
      // Launch new
      launchApp(appId, initialData !== undefined ? { initialData } : undefined);
    },
    [instanceOrder, instances, bringInstanceToForeground, restoreInstance, launchApp]
  );

  // Finder-specific: bring existing to foreground, otherwise launch one
  const focusOrLaunchFinder = useCallback(
    (initialPath?: string) => {
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
      if (initialPath) launchApp("finder", { initialPath });
      else launchApp("finder", { initialPath: "/" });
    },
    [instances, instanceOrder, bringInstanceToForeground, restoreInstance, launchApp]
  );

  // Focus a Finder window already at targetPath (or its subpath); otherwise launch new Finder at targetPath
  const focusFinderAtPathOrLaunch = useCallback(
    (targetPath: string, initialData?: unknown) => {
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
      
      // For non-opened apps, show only "Open"
      if (appInstances.length === 0 && !specificInstanceId) {
        items.push({
          type: "item",
          label: "Open",
          onSelect: () => {
            if (appId === "finder") {
              launchApp("finder", { initialPath: "/" });
            } else {
              launchApp(appId);
            }
          },
        });
        return items;
      }
      
      // For applet-viewer with a specific instance, only show that applet's menu
      if (appId === "applet-viewer" && specificInstanceId) {
        const instance = instances[specificInstanceId];
        if (instance) {
          // Single applet instance - show its window
          const { label } = getAppletInfo(instance);
          const isForeground = instance.isForeground && !instance.isMinimized;
          items.push({
            type: "item",
            label: `${isForeground ? "✓ " : ""}${label}${instance.isMinimized ? " (minimized)" : ""}`,
            onSelect: () => {
              if (instance.isMinimized) {
                restoreInstance(specificInstanceId);
              }
              bringInstanceToForeground(specificInstanceId);
            },
          });
          
          items.push({ type: "separator" });
          
          // Show All Windows
          items.push({
            type: "item",
            label: "Show All Windows",
            onSelect: () => {
              if (instance.isMinimized) {
                restoreInstance(specificInstanceId);
              }
              bringInstanceToForeground(specificInstanceId);
            },
          });
          
          // Hide
          items.push({
            type: "item",
            label: "Hide",
            onSelect: () => {
              minimizeInstance(specificInstanceId);
            },
            disabled: instance.isMinimized,
          });
          
          // Quit
          items.push({
            type: "item",
            label: "Quit",
            onSelect: () => {
              // Dispatch event to trigger WindowFrame's close animation and sound
              window.dispatchEvent(new CustomEvent(`requestClose-${specificInstanceId}`));
            },
          });
          
          return items;
        }
      }
      
      // List existing windows if any
      if (appInstances.length > 0) {
        appInstances.forEach((inst) => {
          let windowLabel = inst.title || appRegistry[appId]?.name || appId;
          
          // For Finder, show the current path
          if (appId === "finder") {
            const finderState = finderInstances[inst.instanceId];
            if (finderState?.currentPath) {
              const pathParts = finderState.currentPath.split("/");
              windowLabel = pathParts[pathParts.length - 1] || "Root";
            }
          }
          
          const isForeground = inst.isForeground && !inst.isMinimized;
          items.push({
            type: "item",
            label: `${isForeground ? "✓ " : ""}${windowLabel}${inst.isMinimized ? " (minimized)" : ""}`,
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
          label: "New Window",
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
      
      // Show All Windows
      items.push({
        type: "item",
        label: "Show All Windows",
        onSelect: () => {
          // Restore all minimized instances and bring the last one to foreground
          let lastRestoredId: string | null = null;
          appInstances.forEach((inst) => {
            if (inst.isMinimized) {
              restoreInstance(inst.instanceId);
            }
            lastRestoredId = inst.instanceId;
          });
          if (lastRestoredId) {
            bringInstanceToForeground(lastRestoredId);
          }
        },
        disabled: appInstances.length === 0,
      });
      
      // Hide (minimize all)
      items.push({
        type: "item",
        label: "Hide",
        onSelect: () => {
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
        label: "Quit",
        onSelect: () => {
          // Dispatch events to trigger WindowFrame's close animation and sound for each instance
          appInstances.forEach((inst) => {
            window.dispatchEvent(new CustomEvent(`requestClose-${inst.instanceId}`));
          });
        },
        disabled: appInstances.length === 0,
      });
      
      return items;
    },
    [instances, finderInstances, getAppletInfo, restoreInstance, bringInstanceToForeground, minimizeInstance, closeAppInstance, launchApp]
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

  // Ensure no magnification state is applied when disabled
  useEffect(() => {
    if (!magnifyEnabled) mouseX.set(Infinity);
  }, [magnifyEnabled, mouseX]);

  // Track which icons have appeared before to control enter animations
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [hasMounted, setHasMounted] = useState(false);
  // Mark all currently visible ids as seen whenever the set changes
  const allVisibleIds = useMemo(() => {
    const ids = [
      ...pinnedLeft,
      ...openItems.map((item) =>
        item.type === "applet" ? item.instanceId! : item.appId
      ),
      "__applications__",
      "__trash__",
    ];
    return ids;
  }, [pinnedLeft, openItems]);
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
          layout
          layoutRoot
          className="inline-flex items-end px-1 py-1"
          style={{
            pointerEvents: "auto",
            background: "rgba(248, 248, 248, 0.75)",
            backgroundImage: "var(--os-pinstripe-menubar)",
            border: "none",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
            height: 56,
            maxWidth: "min(92vw, 980px)",
            transformOrigin: "center bottom",
            borderRadius: "0px",
            overflowX: isPhone ? "auto" : "visible",
            overflowY: "visible",
            WebkitOverflowScrolling: isPhone ? "touch" : undefined,
            overscrollBehaviorX: isPhone ? "contain" : undefined,
          }}
          transition={{
            layout: {
              type: "spring",
              stiffness: 400,
              damping: 30,
            },
          }}
          onMouseMove={
            magnifyEnabled && !trashContextMenuPos && !appContextMenu
              ? (e) => mouseX.set(e.clientX)
              : undefined
          }
          onMouseLeave={
            magnifyEnabled && !trashContextMenuPos && !appContextMenu
              ? () => {
                  mouseX.set(Infinity);
                  handleIconLeave();
                }
              : undefined
          }
        >
          <LayoutGroup>
            <AnimatePresence mode="popLayout" initial={false}>
              {/* Left pinned */}
              {pinnedLeft.map((appId) => {
                const icon = getAppIconPath(appId);
                const isOpen = openAppsAllSet.has(appId);
                const isLoading = Object.values(instances).some(
                  (i) => i.appId === appId && i.isOpen && i.isLoading
                );
                const label = appRegistry[appId]?.name ?? appId;
                return (
                  <IconButton
                    key={appId}
                    label={label}
                    icon={icon}
                    idKey={appId}
                    onClick={() => {
                      if (appId === "finder") {
                        focusOrLaunchFinder("/");
                      } else {
                        focusOrLaunchApp(appId);
                      }
                    }}
                    onContextMenu={(e) => handleAppContextMenu(e, appId)}
                    showIndicator={isOpen}
                    isLoading={isLoading}
                    mouseX={mouseX}
                    magnifyEnabled={magnifyEnabled}
                    isNew={hasMounted && !seenIdsRef.current.has(appId)}
                    isHovered={hoveredId === appId}
                    isSwapping={isSwapping}
                    onHover={() => handleIconHover(appId)}
                    onLeave={handleIconLeave}
                  />
                );
              })}

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
                      onClick={() => {
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
                      magnifyEnabled={magnifyEnabled}
                      isNew={hasMounted && !seenIdsRef.current.has(item.instanceId!)}
                      isHovered={hoveredId === item.instanceId}
                      isSwapping={isSwapping}
                      onHover={() => handleIconHover(item.instanceId!)}
                      onLeave={handleIconLeave}
                    />
                  );
                } else {
                  // Render regular app
                  const icon = getAppIconPath(item.appId);
                  const label = appRegistry[item.appId]?.name ?? item.appId;
                  const isLoading = Object.values(instances).some(
                    (i) => i.appId === item.appId && i.isOpen && i.isLoading
                  );
                  return (
                    <IconButton
                      key={item.appId}
                      label={label}
                      icon={icon}
                      idKey={item.appId}
                      onClick={() => focusMostRecentInstanceOfApp(item.appId)}
                      onContextMenu={(e) => handleAppContextMenu(e, item.appId)}
                      showIndicator
                      isLoading={isLoading}
                      mouseX={mouseX}
                      magnifyEnabled={magnifyEnabled}
                      isNew={hasMounted && !seenIdsRef.current.has(item.appId)}
                      isHovered={hoveredId === item.appId}
                      isSwapping={isSwapping}
                      onHover={() => handleIconHover(item.appId)}
                      onLeave={handleIconLeave}
                    />
                  );
                }
              })}

              {/* Divider between open apps and Applications/Trash */}
              <Divider key="divider-between" idKey="between" />

              {/* Applications (left of Trash) */}
              <IconButton
                key="__applications__"
                label="Applications"
                icon="/icons/default/applications.png"
                idKey="__applications__"
                onClick={() =>
                  focusFinderAtPathOrLaunch("/Applications", {
                    path: "/Applications",
                    viewType: "large",
                  })
                }
                mouseX={mouseX}
                magnifyEnabled={magnifyEnabled}
                isNew={hasMounted && !seenIdsRef.current.has("__applications__")}
                isHovered={hoveredId === "__applications__"}
                isSwapping={isSwapping}
                onHover={() => handleIconHover("__applications__")}
                onLeave={handleIconLeave}
              />

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
                        fileStore.removeItem(parsed.path);
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
                      label="Trash"
                      icon={trashIcon}
                      idKey="__trash__"
                      onClick={() => {
                        focusFinderAtPathOrLaunch("/Trash");
                      }}
                      onDragOver={handleTrashDragOver}
                      onDrop={handleTrashDrop}
                      onDragLeave={handleTrashDragLeave}
                      onContextMenu={handleTrashContextMenu}
                      mouseX={mouseX}
                      magnifyEnabled={magnifyEnabled}
                      isNew={hasMounted && !seenIdsRef.current.has("__trash__")}
                      isHovered={hoveredId === "__trash__"}
                      isSwapping={isSwapping}
                      onHover={() => handleIconHover("__trash__")}
                      onLeave={handleIconLeave}
                    />
                  </motion.div>
                );
              })()}
            </AnimatePresence>
          </LayoutGroup>
        </motion.div>
      </div>
      <RightClickMenu
        items={[
          {
            type: "item",
            label: "Open",
            onSelect: () => {
              focusFinderAtPathOrLaunch("/Trash");
              setTrashContextMenuPos(null);
            },
          },
          { type: "separator" },
          {
            type: "item",
            label: "Empty Trash...",
            onSelect: () => {
              setIsEmptyTrashDialogOpen(true);
              setTrashContextMenuPos(null);
            },
            disabled: isTrashEmpty,
          },
        ]}
        position={trashContextMenuPos}
        onClose={() => {
          setTrashContextMenuPos(null);
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
      <ConfirmDialog
        isOpen={isEmptyTrashDialogOpen}
        onOpenChange={setIsEmptyTrashDialogOpen}
        onConfirm={() => {
          fileStore.emptyTrash();
          setIsEmptyTrashDialogOpen(false);
        }}
        title="Empty Trash"
        description="Are you sure you want to empty the Trash? This action cannot be undone."
      />
    </div>
  );
}

export function Dock() {
  const currentTheme = useThemeStore((s) => s.current);
  if (currentTheme !== "macosx") return null;
  return <MacDock />;
}
