import { useWindowManager } from "@/hooks/useWindowManager";
import { ResizeType } from "@/types/types";
import { useSound, Sounds } from "@/hooks/useSound";
import { useVibration } from "@/hooks/useVibration";
import { useWindowInsets } from "@/hooks/useWindowInsets";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import { getWindowConfig } from "@/config/appRegistry";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";
import { AppId } from "@/config/appIds";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useIsPhone } from "@/hooks/useIsPhone";
import { useAppStoreShallow } from "@/stores/helpers";
import { useAppStore } from "@/stores/useAppStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";

import {
  WindowFrameDrawerContext,
  type WindowFrameDrawerContextValue,
} from "@/components/shared/WindowFrameDrawerContext";
import { motion, AnimatePresence } from "framer-motion";
import { calculateExposeGrid, getExposeTransform } from "../exposeUtils";
import { selectExposeWindow } from "@/utils/appEventBus";
import type { WindowFrameProps } from "./windowFrameTypes";
import { getSwipeStyle } from "./windowFrameUtils";
import {
  getAnimateState,
  getExitAnimation,
  getInitialAnimation,
} from "./windowFrameAnimations";
import { WindowFrameResizeHandles } from "./WindowFrameResizeHandles";
import { WindowFrameSnapZoneIndicator } from "./WindowFrameSnapZoneIndicator";
import { WindowFrameTitleBar } from "./WindowFrameTitleBar";

export type { WindowFrameProps } from "./windowFrameTypes";

export function WindowFrame({
  children,
  title,
  onClose,
  isForeground = true,
  isShaking = false,
  appId,
  material = "default",
  skipInitialSound = false,
  windowConstraints = {},
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
  interceptClose = false,
  menuBar, // Add menuBar to destructured props
  keepMountedWhenMinimized = false,
  onFullscreenToggle,
  onCoverFlowToggle,
  isCoverFlowActive = false,
  disableTitlebarAutoHide = false,
  titleBarRightContent,
  drawer,
}: WindowFrameProps) {
  const config = getWindowConfig(appId);
  const defaultConstraints = useMemo(
    () => ({
      minWidth: config.minSize?.width,
      minHeight: config.minSize?.height,
      maxWidth: config.maxSize?.width,
      maxHeight: config.maxSize?.height,
      defaultSize: config.defaultSize,
    }),
    [config]
  );

  // Merge provided constraints with defaults from config
  const mergedConstraints = useMemo(
    () => ({
      ...defaultConstraints,
      ...windowConstraints,
    }),
    [defaultConstraints, windowConstraints]
  );

  const [isOpen, setIsOpen] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [isInitialMount, setIsInitialMount] = useState(true);
  // Ref to store the exit animation - updated synchronously before state changes
  const exitAnimationRef = useRef<'close' | 'minimize'>('minimize');
  // Track if close was triggered via external event (menu bar, dock, etc.)
  const closeViaEventRef = useRef(false);
  const {
    bringInstanceToForeground,
    updateInstanceWindowState,
    minimizeInstance,
    closeAppInstance,
    updateInstanceTitle,
    exposeMode,
    openInstanceCount,
  } = useAppStoreShallow((state) => ({
    bringInstanceToForeground: state.bringInstanceToForeground,
    updateInstanceWindowState: state.updateInstanceWindowState,
    minimizeInstance: state.minimizeInstance,
    closeAppInstance: state.closeAppInstance,
    updateInstanceTitle: state.updateInstanceTitle,
    exposeMode: state.exposeMode,
    openInstanceCount: state.exposeMode
      ? Object.values(state.instances).filter(inst => inst.isOpen && !inst.isMinimized).length
      : 0,
  }));
  
  // Debug mode from display settings store
  const debugMode = useDisplaySettingsStore((s) => s.debugMode);
  
  // Subscribe only to this instance's minimized state, not all instances
  const isMinimized = useAppStore((state) =>
    instanceId ? state.instances[instanceId]?.isMinimized ?? false : false
  );
  const { play: playWindowOpen } = useSound(Sounds.WINDOW_OPEN);
  const { play: playWindowClose } = useSound(Sounds.WINDOW_CLOSE);
  // For green button zoom (maximize/restore window size)
  const { play: playWindowExpand } = useSound(Sounds.WINDOW_EXPAND);
  const { play: playWindowCollapse } = useSound(Sounds.WINDOW_COLLAPSE);
  // For dock minimize/restore
  const { play: playZoomMinimize } = useSound(Sounds.WINDOW_ZOOM_MINIMIZE);
  const { play: playZoomMaximize } = useSound(Sounds.WINDOW_ZOOM_MAXIMIZE);
  const { play: playWindowMoveStop } = useSound(Sounds.WINDOW_MOVE_STOP);
  const vibrateMaximize = useVibration(50, 100);
  const vibrateClose = useVibration(50, 50);
  const vibrateSwap = useVibration(30, 50);
  const [isFullHeight, setIsFullHeight] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const isClosingRef = useRef(false);
  const isMobile = useIsMobile();
  const isPhone = useIsPhone();
  const lastTapTimeRef = useRef<number>(0);
  const doubleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingTapRef = useRef(false);
  const lastToggleTimeRef = useRef<number>(0);
  // Keep track of window size before maximizing to restore it later
  const previousSizeRef = useRef({ width: 0, height: 0 });

  // Use shared window insets hook for theme-dependent constraints
  const {
    isXpTheme,
    isMacOSTheme,
    isSystem7Theme,
    isWinXp,
  } = useWindowInsets();

  
  // Derive material booleans for internal use
  const isTransparent = material === "transparent" || material === "notitlebar";
  const isNoTitlebar = material === "notitlebar";
  const isBrushedMetal = material === "brushedmetal";
  
  // Treat all macOS windows as using a transparent outer background so titlebar/content can be styled separately
  const effectiveTransparentBackground =
    isMacOSTheme ? true : isTransparent;
  
  // Hover state for notitlebar material (shows titlebar on hover/interaction)
  // If auto-hide is disabled, keep titlebar always visible
  const [isTitlebarHovered, setIsTitlebarHovered] = useState(disableTitlebarAutoHide && isNoTitlebar);
  const titlebarHideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Start auto-hide timer for notitlebar windows (only if auto-hide is enabled)
  const startTitlebarAutoHideTimer = useCallback(() => {
    if (titlebarHideTimeoutRef.current) {
      clearTimeout(titlebarHideTimeoutRef.current);
    }
    if (isNoTitlebar && !disableTitlebarAutoHide) {
      titlebarHideTimeoutRef.current = setTimeout(() => {
        setIsTitlebarHovered(false);
      }, 3000);
    }
  }, [isNoTitlebar, disableTitlebarAutoHide]);

  // Show titlebar and start auto-hide timer (only if auto-hide is enabled)
  const showTitlebarWithAutoHide = useCallback(() => {
    setIsTitlebarHovered(true);
    if (!disableTitlebarAutoHide) {
      startTitlebarAutoHideTimer();
    }
  }, [startTitlebarAutoHideTimer, disableTitlebarAutoHide]);

  // Cleanup timeouts on unmount (titlebar hide + double tap)
  useEffect(() => {
    return () => {
      if (titlebarHideTimeoutRef.current) {
        clearTimeout(titlebarHideTimeoutRef.current);
      }
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
    };
  }, []);

  // Theme-aware z-index for resizer layer:
  // - macOSX: above titlebar (no controls in top-right)
  // - XP/Win98: below titlebar controls (avoid occluding close button)
  // - Others: default above content
  const resizerZIndexClass =
    isMacOSTheme ? "z-[60]" : isXpTheme ? "z-40" : "z-50";

  // Setup swipe navigation for phones only
  const {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    isSwiping,
    swipeDirection,
  } = useSwipeNavigation({
    currentAppId: appId as AppId,
    isActive: isPhone && isForeground,
    onSwipeLeft: () => {
      playWindowMoveStop();
      vibrateSwap();
      onNavigateNext?.();
    },
    onSwipeRight: () => {
      playWindowMoveStop();
      vibrateSwap();
      onNavigatePrevious?.();
    },
    threshold: 100,
  });

  useEffect(() => {
    if (!skipInitialSound) {
      playWindowOpen();
    }
    // Remove initial mount state after animation
    const timer = setTimeout(() => setIsInitialMount(false), 200);
    return () => clearTimeout(timer);
  }, [playWindowOpen, skipInitialSound]); // Play sound when component mounts

  // Sync window title to the app store for the dock context menu
  useEffect(() => {
    if (instanceId && title) {
      updateInstanceTitle(instanceId, title);
    }
  }, [instanceId, title, updateInstanceTitle]);

  // Track previous minimized state to play sound on restore
  const wasMinimizedRef = useRef(isMinimized);
  const shouldAnimateRestore = wasMinimizedRef.current && !isMinimized;
  
  useEffect(() => {
    if (wasMinimizedRef.current && !isMinimized) {
      // Window was just restored from minimized state (from dock)
      playZoomMaximize();
    }
    wasMinimizedRef.current = isMinimized;
  }, [isMinimized, playZoomMaximize]);

  const handleClose = useCallback(() => {
    if (interceptClose) {
      // Call the parent's onClose handler for interception (like confirmation dialogs)
      onClose?.();
    } else {
      // Set exit animation ref BEFORE state change - this is read synchronously by Framer Motion
      exitAnimationRef.current = 'close';
      isClosingRef.current = true;
      vibrateClose();
      playWindowClose();
      setIsClosing(true);
    }
  }, [interceptClose, onClose, vibrateClose, playWindowClose]);

  // Called when close animation completes
  const handleCloseAnimationComplete = useCallback(() => {
    if (isClosing) {
      setIsOpen(false);
      isClosingRef.current = false;
      exitAnimationRef.current = 'minimize'; // Reset to default
      closeViaEventRef.current = false;
      
      // For instance-based windows, always use closeAppInstance directly
      // This handles both normal closes and interceptClose closes uniformly
      if (instanceId) {
        closeAppInstance(instanceId);
      } else {
        // Fallback for non-instance-based windows (legacy support)
        onClose?.();
      }
    }
  }, [isClosing, onClose, instanceId, closeAppInstance]);

  const handleMinimize = () => {
    if (instanceId) {
      playZoomMinimize();
      minimizeInstance(instanceId);
    }
  };

  // Function to actually perform the close operation
  // This should be called by the parent component after confirmation
  const performClose = useCallback(() => {
    isClosingRef.current = true;
    vibrateClose();
    playWindowClose();
    setIsClosing(true);
  }, [vibrateClose, playWindowClose]);

  // Expose performClose to parent component through a custom event (only for intercepted closes)
  // This allows apps like TextEdit to show confirmation dialogs before closing
  useEffect(() => {
    if (!interceptClose) return;

    const handlePerformClose = () => {
      // The actual cleanup (closeAppInstance) is handled in handleCloseAnimationComplete
      performClose();
    };

    // Listen for close confirmation from parent
    window.addEventListener(
      `closeWindow-${instanceId || appId}`,
      handlePerformClose as EventListener
    );

    return () => {
      window.removeEventListener(
        `closeWindow-${instanceId || appId}`,
        handlePerformClose as EventListener
      );
    };
  }, [instanceId, appId, performClose, interceptClose]);

  // Listen for close requests from external sources (menu bars, dock, etc.)
  // This allows them to trigger the animated close with sound instead of immediately closing
  useEffect(() => {
    if (!instanceId) return;

    const handleCloseRequest = () => {
      // Mark that this close was triggered externally so we use closeAppInstance directly
      closeViaEventRef.current = true;
      handleClose();
    };

    window.addEventListener(
      `requestCloseWindow-${instanceId}`,
      handleCloseRequest
    );

    return () => {
      window.removeEventListener(
        `requestCloseWindow-${instanceId}`,
        handleCloseRequest
      );
    };
  }, [instanceId, handleClose]);

  const {
    windowPosition,
    windowSize,
    isDragging,
    resizeType,
    handleMouseDown,
    handleResizeStart,
    setWindowSize,
    setWindowPosition,
    snapZone,
    computeInsets: computeWindowInsets,
  } = useWindowManager({ appId, instanceId });
  
  // Track if we should animate window transitions (maximize/restore/snap)
  // Don't animate during drag or resize operations
  const shouldAnimateWindowTransition = !isDragging && !resizeType;

  const dockIconCenter = useMemo(() => {
    const dockIcon = document.querySelector(`[data-dock-icon="${appId}"]`);
    if (dockIcon) {
      const rect = dockIcon.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    const taskbarItem = instanceId
      ? document.querySelector(`[data-taskbar-item="${instanceId}"]`)
      : null;
    if (taskbarItem) {
      const rect = taskbarItem.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    return null;
  }, [appId, instanceId]);

  // Calculate dock icon or taskbar item position relative to window center (used for both minimize and restore animations)
  const dockIconOffset = useMemo(() => {
    const windowCenterX = windowPosition.x + windowSize.width / 2;
    const windowCenterY = windowPosition.y + windowSize.height / 2;

    if (dockIconCenter) {
      return {
        x: dockIconCenter.x - windowCenterX,
        y: dockIconCenter.y - windowCenterY,
      };
    }

    return { x: 0, y: window.innerHeight - windowPosition.y }; // Fallback to bottom of screen
  }, [dockIconCenter, windowPosition, windowSize]);

  // Get launch origin from instance (position of icon that launched this window)
  const launchOrigin = useAppStore((state) =>
    instanceId ? state.instances[instanceId]?.launchOrigin : undefined
  );

  // Calculate launch origin offset relative to window center (used for initial open animation)
  const launchOriginOffset = useMemo(() => {
    if (!launchOrigin) return null;
    
    // Calculate offset from window center to launch icon center
    const windowCenterX = windowPosition.x + windowSize.width / 2;
    const windowCenterY = windowPosition.y + windowSize.height / 2;
    const iconCenterX = launchOrigin.x + launchOrigin.width / 2;
    const iconCenterY = launchOrigin.y + launchOrigin.height / 2;
    
    return {
      x: iconCenterX - windowCenterX,
      y: iconCenterY - windowCenterY,
    };
  }, [launchOrigin, windowPosition, windowSize]);

  // Calculate expose transform for Mission Control view.
  // Uses openInstanceCount as a reactive dependency to recompute when windows
  // open/close, and reads instance order imperatively to avoid infinite loops
  // from selectors that return new arrays.
  const exposeTransform = useMemo(() => {
    if (!exposeMode || !instanceId) return null;
    
    const allInstances = useAppStore.getState().instances;
    const openInstances = Object.values(allInstances)
      .filter(inst => inst.isOpen && !inst.isMinimized);
    const myIndex = openInstances.findIndex(inst => inst.instanceId === instanceId);
    
    if (myIndex === -1 || openInstances.length === 0) return null;
    
    const grid = calculateExposeGrid(
      openInstances.length,
      window.innerWidth,
      window.innerHeight,
      60, // padding
      24, // gap
      isMobile
    );
    
    const transform = getExposeTransform(
      windowPosition.x,
      windowPosition.y,
      windowSize.width,
      windowSize.height,
      myIndex,
      grid,
      window.innerWidth,
      window.innerHeight
    );
    
    return { ...transform, index: myIndex };
    // openInstanceCount triggers recomputation when windows open/close/minimize
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exposeMode, instanceId, openInstanceCount, windowPosition, windowSize, isMobile]);


  // No longer track maximized state based on window dimensions
  useEffect(() => {
    const { topInset, bottomInset } = computeWindowInsets();
    const maxPossibleHeight = window.innerHeight - topInset - bottomInset;
    // Consider window at full height if it's within 5px of max height (to account for rounding)
    setIsFullHeight(Math.abs(windowSize.height - maxPossibleHeight) < 5);
  }, [windowSize.height, computeWindowInsets]);

  const handleMouseDownWithForeground = (
    e: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>
  ) => {
    handleMouseDown(e);
    if (!isForeground) {
      if (instanceId) {
        bringInstanceToForeground(instanceId);
      }
    }
  };

  const handleResizeStartWithForeground = (
    e: React.MouseEvent | React.TouchEvent,
    type: ResizeType
  ) => {
    handleResizeStart(e, type);
    if (!isForeground) {
      if (instanceId) {
        bringInstanceToForeground(instanceId);
      }
    }
  };

  // This function only maximizes height (for bottom resize handle)
  const handleHeightOnlyMaximize = (e: React.MouseEvent | React.TouchEvent) => {
    if (isClosingRef.current) return;
    vibrateMaximize();
    e.stopPropagation();

    // If window is already fully maximized, do nothing - let handleFullMaximize handle the restoration
    if (isMaximized) return;

    if (isFullHeight) {
      // Play collapse sound when restoring height
      playWindowCollapse();

      // Restore to default height from app's configuration
      setIsFullHeight(false);
      const newSize = {
        ...windowSize,
        height: mergedConstraints.defaultSize.height,
      };
      setWindowSize(newSize);
      // Save the window state to global store
      if (instanceId) {
        updateInstanceWindowState(instanceId, windowPosition, newSize);
      }
    } else {
      // Play expand sound when maximizing height
      playWindowExpand();

      // Set to full height
      setIsFullHeight(true);
      const { topInset, bottomInset } = computeWindowInsets();
      const maxPossibleHeight = window.innerHeight - topInset - bottomInset;
      const maxHeight = mergedConstraints.maxHeight
        ? typeof mergedConstraints.maxHeight === "string"
          ? parseInt(mergedConstraints.maxHeight)
          : mergedConstraints.maxHeight
        : maxPossibleHeight;
      const newHeight = Math.min(maxPossibleHeight, maxHeight);
      const newSize = {
        ...windowSize,
        height: newHeight,
      };
      const newPosition = {
        ...windowPosition,
        y: topInset,
      };
      setWindowSize(newSize);
      setWindowPosition(newPosition);
      // Save the window state to global store
      if (instanceId) {
        updateInstanceWindowState(instanceId, newPosition, newSize);
      }
    }
  };

  // This function maximizes both width and height (for titlebar)
  const handleFullMaximize = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (isClosingRef.current) return;
      vibrateMaximize();
      e.stopPropagation();

      const now = Date.now();
      // Add cooldown to prevent rapid toggling (300ms)
      if (now - lastToggleTimeRef.current < 300) {
        return;
      }
      lastToggleTimeRef.current = now;

      // Toggle the maximized state directly
      const newMaximizedState = !isMaximized;
      setIsMaximized(newMaximizedState);

      if (!newMaximizedState) {
        // Play collapse sound when minimizing
        playWindowCollapse();

        // Restoring to default size
        const defaultSize = mergedConstraints.defaultSize;

        const newPosition = {
          x: Math.max(0, (window.innerWidth - defaultSize.width) / 2),
          y: Math.max(30, (window.innerHeight - defaultSize.height) / 2),
        };

        setWindowSize({
          width: defaultSize.width,
          height: defaultSize.height,
        });

        // Center the window if we're restoring from a maximized state
        if (window.innerWidth >= 768) {
          setWindowPosition(newPosition);
        }

        // Save the new window state to global store
        if (instanceId) {
          updateInstanceWindowState(
            instanceId,
            window.innerWidth >= 768 ? newPosition : windowPosition,
            defaultSize
          );
        }
      } else {
        // Play expand sound when maximizing
        playWindowExpand();

        // Maximizing the window
        // Save current size before maximizing
        previousSizeRef.current = {
          width: windowSize.width,
          height: windowSize.height,
        };

        // Set to full width and height
        const { topInset, bottomInset } = computeWindowInsets();
        const maxPossibleHeight = window.innerHeight - topInset - bottomInset;
        const maxHeight = mergedConstraints.maxHeight
          ? typeof mergedConstraints.maxHeight === "string"
            ? parseInt(mergedConstraints.maxHeight)
            : mergedConstraints.maxHeight
          : maxPossibleHeight;
        const newHeight = Math.min(maxPossibleHeight, maxHeight);

        // For width we use the full window width on mobile, otherwise respect constraints
        let newWidth = window.innerWidth;
        if (window.innerWidth >= 768) {
          const maxWidth = mergedConstraints.maxWidth
            ? typeof mergedConstraints.maxWidth === "string"
              ? parseInt(mergedConstraints.maxWidth)
              : mergedConstraints.maxWidth
            : window.innerWidth;
          newWidth = Math.min(window.innerWidth, maxWidth);
        }

        const newSize = {
          width: newWidth,
          height: newHeight,
        };

        const newPosition = {
          x: window.innerWidth >= 768 ? (window.innerWidth - newWidth) / 2 : 0,
          y: topInset,
        };

        setWindowSize(newSize);

        // Position at top of screen
        setWindowPosition(newPosition);

        // Save the new window state to global store
        if (instanceId) {
          updateInstanceWindowState(instanceId, newPosition, newSize);
        }
      }
    },
    [
      computeWindowInsets,
      instanceId,
      isMaximized,
      mergedConstraints,
      playWindowCollapse,
      playWindowExpand,
      setWindowPosition,
      setWindowSize,
      updateInstanceWindowState,
      vibrateMaximize,
      windowPosition,
      windowSize,
    ]
  );

  // Handle double tap for titlebar
  const handleTitleBarTap = useCallback(
    (e: React.TouchEvent) => {
      if (isClosingRef.current) return;
      // Don't stop propagation by default, only if we detect a double tap
      e.preventDefault();

      const now = Date.now();

      // If we're currently processing a tap or in cooldown, ignore this tap
      if (isProcessingTapRef.current || now - lastToggleTimeRef.current < 300) {
        return;
      }

      const timeSinceLastTap = now - lastTapTimeRef.current;

      // Clear any existing timeout
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
        doubleTapTimeoutRef.current = null;
      }

      // Check if this is a double tap (less than 300ms between taps)
      if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
        // Only stop propagation if we detect a double tap
        e.stopPropagation();
        isProcessingTapRef.current = true;
        handleFullMaximize(e);
        // Reset the last tap time
        lastTapTimeRef.current = 0;

        // Reset processing flag after a delay that matches our cooldown
        setTimeout(() => {
          isProcessingTapRef.current = false;
        }, 300);
      } else {
        // Set timeout to reset last tap time if no second tap occurs
        doubleTapTimeoutRef.current = setTimeout(() => {
          lastTapTimeRef.current = 0;
        }, 300);

        // Update last tap time
        lastTapTimeRef.current = now;
      }
    },
    [handleFullMaximize]
  );


  // For close: keep showing but animate to closed state, then unmount via onAnimationComplete
  // For minimize: by default unmount via AnimatePresence exit animation
  // If keepMountedWhenMinimized is true, keep content mounted but visually hidden (useful for audio/video apps)
  const shouldShow = keepMountedWhenMinimized ? isOpen : (!isMinimized && isOpen);

  // Calculate snap zone dimensions for the indicator
  const snapZoneStyle = useMemo(() => {
    if (!snapZone) return null;
    const { topInset, bottomInset } = computeWindowInsets();
    const height = window.innerHeight - topInset - bottomInset;
    const width = Math.floor(window.innerWidth / 2);
    return {
      top: topInset,
      height,
      width,
      left: snapZone === "left" ? 0 : width,
    };
  }, [snapZone, computeWindowInsets]);

  // Context exposed to the optional drawer slot so it can read window
  // bounds / constraints and request a reposition/resize when its preferred
  // expansion side would not fit the viewport.
  const drawerContextValue = useMemo<WindowFrameDrawerContextValue>(
    () => ({
      position: windowPosition,
      size: windowSize,
      constraints: mergedConstraints,
      isInteracting: isDragging || !!resizeType,
      computeInsets: computeWindowInsets,
      applyWindowFrame: (next) => {
        const nextPosition = { x: next.x, y: next.y };
        const nextSize = { width: next.width, height: next.height };
        setWindowPosition(nextPosition);
        setWindowSize(nextSize);
        if (instanceId) {
          updateInstanceWindowState(instanceId, nextPosition, nextSize);
        }
      },
    }),
    [
      windowPosition,
      windowSize,
      mergedConstraints,
      isDragging,
      resizeType,
      computeWindowInsets,
      setWindowPosition,
      setWindowSize,
      instanceId,
      updateInstanceWindowState,
    ]
  );

  return (
    <>
    <WindowFrameSnapZoneIndicator
      snapZone={snapZone}
      snapZoneStyle={snapZoneStyle}
      isForeground={isForeground}
      isMacOSTheme={isMacOSTheme}
    />
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          key={`pos-${instanceId || appId}`}
          className={cn(
            "absolute p-2 md:p-0",
            // For keepMountedWhenMinimized apps, disable pointer events on outer wrapper when minimized
            // so clicks can pass through to windows/desktop behind it
            (keepMountedWhenMinimized && isMinimized) && "pointer-events-none"
          )}
          initial={false}
          animate={{
            left: windowPosition.x,
            top: Math.max(0, windowPosition.y),
            width: window.innerWidth >= 768 ? windowSize.width : "100%",
            height: Math.max(windowSize.height, mergedConstraints.minHeight || 0),
            // Expose mode transform
            x: exposeTransform?.translateX ?? 0,
            y: exposeTransform?.translateY ?? 0,
            scale: exposeTransform?.scale ?? 1,
          }}
          transition={exposeMode ? {
            duration: 0.4,
            ease: [0.32, 0.72, 0, 1],
          } : shouldAnimateWindowTransition ? {
            duration: 0.15,
            ease: [0.25, 0.1, 0.25, 1], // cubic-bezier for snappy feel
          } : {
            duration: 0,
          }}
          style={{
            minWidth:
              window.innerWidth >= 768 ? mergedConstraints.minWidth : "100%",
            minHeight: mergedConstraints.minHeight,
            maxWidth: mergedConstraints.maxWidth || undefined,
            maxHeight: mergedConstraints.maxHeight || undefined,
            zIndex: exposeTransform ? 10000 + exposeTransform.index : undefined,
            cursor: exposeMode ? "pointer" : undefined,
            transformOrigin: "center center",
          }}
          whileHover={exposeMode && exposeTransform ? { 
            scale: exposeTransform.scale * 1.05,
            transition: { duration: 0.2 }
          } : undefined}
          onClick={(e) => {
            if (exposeMode && instanceId) {
              e.stopPropagation();
              selectExposeWindow({ instanceId });
              return;
            }
          }}
        >
        <motion.div
          key={instanceId || appId}
          initial={getInitialAnimation({
            shouldAnimateRestore,
            dockIconOffset,
            isInitialMount,
            launchOriginOffset,
          })}
          animate={getAnimateState({
            isClosing,
            keepMountedWhenMinimized,
            isMinimized,
            dockIconOffset,
            isShaking,
            shouldAnimateRestore,
            isInitialMount,
            launchOriginOffset,
          })}
          onAnimationComplete={() => {
            if (isClosing) {
              handleCloseAnimationComplete();
            }
          }}
          exit={getExitAnimation({
            keepMountedWhenMinimized,
            dockIconOffset,
          })}
          className={cn(
            "size-full select-none",
            // Disable all pointer events when window is closing
            isClosing && "pointer-events-none",
            // For keepMountedWhenMinimized apps, also disable pointer events when minimized
            (keepMountedWhenMinimized && isMinimized) && "pointer-events-none",
            // Disable pointer events on content in expose mode
            exposeMode && "pointer-events-none"
          )}
          onClick={() => {
            if (!isForeground) {
              if (instanceId) {
                bringInstanceToForeground(instanceId);
              }
            }
          }}
          style={{
            transformOrigin: "center",
          }}
        >
      <div className="relative size-full">
        {/* Drawer slot — rendered first so the window paints over it
            when collapsed. The drawer itself is responsible for sliding
            out from behind the right edge via transform. */}
        <WindowFrameDrawerContext.Provider value={drawerContextValue}>
          {drawer}
        </WindowFrameDrawerContext.Provider>

        <WindowFrameResizeHandles
          resizerZIndexClass={resizerZIndexClass}
          debugMode={debugMode}
          resizeType={resizeType}
          isMobile={isMobile}
          isXpTheme={isXpTheme}
          isMacOSTheme={isMacOSTheme}
          handleResizeStartWithForeground={handleResizeStartWithForeground}
          handleHeightOnlyMaximize={handleHeightOnlyMaximize}
        />

        <div
          className={cn(
            isXpTheme
              ? "window flex flex-col h-full" // Use xp.css window class with flex layout
              : isNoTitlebar && isMacOSTheme
              ? "window size-full flex flex-col rounded-os overflow-hidden relative" // No border for notitlebar
              : "window size-full flex flex-col border-[length:var(--os-metrics-border-width)] border-os-window rounded-os overflow-hidden relative",
            !effectiveTransparentBackground && !isXpTheme && "bg-os-window-bg",
            !isXpTheme && (!isSystem7Theme || isForeground)
              ? "shadow-os-window"
              : "",
            isForeground ? "is-foreground" : "",
            isBrushedMetal && isMacOSTheme && "window-material-brushedmetal"
          )}
          style={{
            ...(!isXpTheme ? getSwipeStyle(isPhone, isSwiping, swipeDirection) : undefined),
          }}
          onMouseEnter={isNoTitlebar && !disableTitlebarAutoHide ? (e: React.MouseEvent<HTMLElement>) => {
            // Skip autohide if mouse event originated from lyrics display
            // On mobile Safari, Framer Motion animations can trigger synthetic mouse events
            const target = e.target as HTMLElement;
            // Check multiple ways to detect lyrics elements
            let isFromLyrics = false;
            if (target) {
              // Check if target or any parent has data-lyrics attribute
              isFromLyrics = !!target.closest('[data-lyrics]');
              // Check for lyrics-specific classes
              if (!isFromLyrics) {
                isFromLyrics = !!(
                  target.closest('.lyrics-word-highlight') ||
                  target.closest('.lyrics-line-clickable') ||
                  target.classList.contains('lyrics-word-highlight') ||
                  target.classList.contains('lyrics-line-clickable') ||
                  target.classList.contains('lyrics-word-layer')
                );
              }
              // Check if SPAN element (likely a lyric word) - traverse up to find lyrics container
              if (!isFromLyrics && target.tagName === 'SPAN') {
                let parent = target.parentElement;
                let depth = 0;
                while (parent && depth < 10) {
                  if (parent.hasAttribute('data-lyrics') || 
                      parent.classList.contains('lyrics-word-highlight') ||
                      parent.classList.contains('lyrics-line-clickable')) {
                    isFromLyrics = true;
                    break;
                  }
                  parent = parent.parentElement;
                  depth++;
                }
              }
            }
            if (!isFromLyrics) {
              showTitlebarWithAutoHide();
            }
          } : undefined}
          onMouseMove={isNoTitlebar && !disableTitlebarAutoHide ? (e: React.MouseEvent<HTMLElement>) => {
            // Skip autohide if mouse event originated from lyrics display
            // On mobile Safari, Framer Motion animations can trigger synthetic mouse events
            const target = e.target as HTMLElement;
            // Check multiple ways to detect lyrics elements
            let isFromLyrics = false;
            if (target) {
              // Check if target or any parent has data-lyrics attribute
              isFromLyrics = !!target.closest('[data-lyrics]');
              // Check for lyrics-specific classes
              if (!isFromLyrics) {
                isFromLyrics = !!(
                  target.closest('.lyrics-word-highlight') ||
                  target.closest('.lyrics-line-clickable') ||
                  target.classList.contains('lyrics-word-highlight') ||
                  target.classList.contains('lyrics-line-clickable') ||
                  target.classList.contains('lyrics-word-layer')
                );
              }
              // Check if SPAN element (likely a lyric word) - traverse up to find lyrics container
              if (!isFromLyrics && target.tagName === 'SPAN') {
                let parent = target.parentElement;
                let depth = 0;
                while (parent && depth < 10) {
                  if (parent.hasAttribute('data-lyrics') || 
                      parent.classList.contains('lyrics-word-highlight') ||
                      parent.classList.contains('lyrics-line-clickable')) {
                    isFromLyrics = true;
                    break;
                  }
                  parent = parent.parentElement;
                  depth++;
                }
              }
            }
            if (!isFromLyrics) {
              showTitlebarWithAutoHide();
            }
          } : undefined}
          onMouseLeave={isNoTitlebar && !disableTitlebarAutoHide ? () => {
            setIsTitlebarHovered(false);
            if (titlebarHideTimeoutRef.current) {
              clearTimeout(titlebarHideTimeoutRef.current);
            }
          } : undefined}
        >
          <WindowFrameTitleBar
            isXpTheme={isXpTheme}
            isMacOSTheme={isMacOSTheme}
            isWinXp={isWinXp}
            isForeground={isForeground}
            isNoTitlebar={isNoTitlebar}
            disableTitlebarAutoHide={disableTitlebarAutoHide}
            isTitlebarHovered={isTitlebarHovered}
            effectiveTransparentBackground={effectiveTransparentBackground}
            isBrushedMetal={isBrushedMetal}
            isTransparent={isTransparent}
            debugMode={debugMode}
            appId={appId}
            title={title}
            isPhone={isPhone}
            titleBarRightContent={titleBarRightContent}
            onCoverFlowToggle={onCoverFlowToggle}
            isCoverFlowActive={isCoverFlowActive}
            onFullscreenToggle={onFullscreenToggle}
            handleMouseDownWithForeground={handleMouseDownWithForeground}
            handleFullMaximize={handleFullMaximize}
            handleTitleBarTap={handleTitleBarTap}
            handleTouchStart={handleTouchStart}
            handleTouchMove={handleTouchMove}
            handleTouchEnd={handleTouchEnd}
            handleClose={handleClose}
            handleMinimize={handleMinimize}
            showTitlebarWithAutoHide={showTitlebarWithAutoHide}
          />

          {/* For XP/98 themes, render the menuBar inside the window */}
          {isXpTheme && menuBar && (
            <div
              className="menubar-container"
              style={{
                background: "var(--button-face)",
                borderBottom: "1px solid var(--button-shadow)",
              }}
            >
              {menuBar}
            </div>
          )}

          {/* Window content */}
          <div
            className={cn(
              "window-body flex flex-1 min-h-0 flex-col md:flex-row relative",
              isBrushedMetal && isMacOSTheme && "ml-[8px] mr-[8px] mb-[8px] rounded-none overflow-hidden"
            )}
            style={
              isXpTheme
                ? { margin: isWinXp ? "0px 3px" : "0" }
                : isMacOSTheme
                ? isTransparent
                  ? undefined
                  : isBrushedMetal
                  ? undefined
                  : isForeground
                  ? {
                      backgroundColor: "var(--os-color-window-bg)",
                      backgroundImage: "var(--os-pinstripe-window)",
                    }
                  : {
                      backgroundColor: "rgba(255,255,255,0.6)",
                      backgroundImage: "var(--os-pinstripe-window)",
                    }
                : undefined
            }
          >
            {children}
          </div>
        </div>
      </div>
        </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
