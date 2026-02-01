import { useWindowManager } from "@/hooks/useWindowManager";
import { ResizeType } from "@/types/types";
import { useSound, Sounds } from "@/hooks/useSound";
import { useVibration } from "@/hooks/useVibration";
import { useWindowInsets } from "@/hooks/useWindowInsets";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { getWindowConfig, getAppIconPath } from "@/config/appRegistry";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";
import { AppId } from "@/config/appIds";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useIsPhone } from "@/hooks/useIsPhone";
import { useAppStoreShallow } from "@/stores/helpers";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { getTheme } from "@/themes";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { TrafficLightButton } from "@/components/shared/TrafficLightButton";
import { motion, AnimatePresence } from "framer-motion";
import { calculateExposeGrid, getExposeTransform } from "./exposeUtils";
import { useTranslation } from "react-i18next";
import { ArrowsOutSimple } from "@phosphor-icons/react";

interface WindowFrameProps {
  children: React.ReactNode;
  title: string;
  onClose?: () => void;
  isForeground?: boolean;
  appId: AppId;
  isShaking?: boolean;
  /** Window material style: "default" (opaque), "transparent" (translucent bg), "notitlebar" (immersive, titlebar on hover) */
  material?: "default" | "transparent" | "notitlebar";
  skipInitialSound?: boolean;
  windowConstraints?: {
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number | string;
    maxHeight?: number | string;
  };
  // Instance support
  instanceId?: string;
  onNavigateNext?: () => void;
  onNavigatePrevious?: () => void;
  // Close interception support
  interceptClose?: boolean;
  menuBar?: React.ReactNode; // Add menuBar prop
  // Keep content mounted when minimized (useful for audio/video apps)
  keepMountedWhenMinimized?: boolean;
  // Fullscreen toggle callback (for apps like iPod and Karaoke that support fullscreen)
  onFullscreenToggle?: () => void;
  // Disable auto-hide for notitlebar material (keeps titlebar always visible)
  disableTitlebarAutoHide?: boolean;
  // Custom content for the right side of the titlebar (replaces fullscreen button if provided)
  titleBarRightContent?: React.ReactNode;
}

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
  disableTitlebarAutoHide = false,
  titleBarRightContent,
}: WindowFrameProps) {
  const { t } = useTranslation();
  const config = getWindowConfig(appId);
  const defaultConstraints = {
    minWidth: config.minSize?.width,
    minHeight: config.minSize?.height,
    maxWidth: config.maxSize?.width,
    maxHeight: config.maxSize?.height,
    defaultSize: config.defaultSize,
  };

  // Merge provided constraints with defaults from config
  const mergedConstraints = {
    ...defaultConstraints,
    ...windowConstraints,
  };

  const [isOpen, setIsOpen] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [isInitialMount, setIsInitialMount] = useState(true);
  // Ref to store the exit animation - updated synchronously before state changes
  const exitAnimationRef = useRef<'close' | 'minimize'>('minimize');
  // Track if close was triggered via external event (menu bar, dock, etc.)
  const closeViaEventRef = useRef(false);
  const {
    bringToForeground,
    bringInstanceToForeground,
    updateWindowState,
    updateInstanceWindowState,
    minimizeInstance,
    instances,
    closeAppInstance,
    updateInstanceTitle,
    exposeMode,
  } = useAppStoreShallow((state) => ({
    bringToForeground: state.bringToForeground,
    bringInstanceToForeground: state.bringInstanceToForeground,
    updateWindowState: state.updateWindowState,
    updateInstanceWindowState: state.updateInstanceWindowState,
    minimizeInstance: state.minimizeInstance,
    instances: state.instances,
    closeAppInstance: state.closeAppInstance,
    updateInstanceTitle: state.updateInstanceTitle,
    exposeMode: state.exposeMode,
  }));
  
  // Debug mode from display settings store
  const debugMode = useDisplaySettingsStore((s) => s.debugMode);
  
  // Check if this instance is minimized
  const isMinimized = instanceId ? instances[instanceId]?.isMinimized ?? false : false;
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
    currentTheme,
  } = useWindowInsets();
  const theme = getTheme(currentTheme);
  
  // Derive material booleans for internal use
  const isTransparent = material === "transparent" || material === "notitlebar";
  const isNoTitlebar = material === "notitlebar";
  
  // Treat all macOS windows as using a transparent outer background so titlebar/content can be styled separately
  const effectiveTransparentBackground =
    currentTheme === "macosx" ? true : isTransparent;
  
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
    currentTheme === "macosx" ? "z-[60]" : isXpTheme ? "z-40" : "z-50";

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
  }, []); // Play sound when component mounts

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

  const handleClose = () => {
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
  };

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
  }, [instanceId]);

  const {
    windowPosition,
    windowSize,
    isDragging,
    resizeType,
    handleMouseDown,
    handleResizeStart,
    setWindowSize,
    setWindowPosition,
    getSafeAreaBottomInset,
    snapZone,
    computeInsets: computeWindowInsets,
  } = useWindowManager({ appId, instanceId });
  
  // Track if we should animate window transitions (maximize/restore/snap)
  // Don't animate during drag or resize operations
  const shouldAnimateWindowTransition = !isDragging && !resizeType;

  // Calculate dock icon or taskbar item position relative to window center (used for both minimize and restore animations)
  const dockIconOffset = useMemo(() => {
    // First try to find the dock icon (macOS theme)
    const dockIcon = document.querySelector(`[data-dock-icon="${appId}"]`);
    if (dockIcon) {
      const rect = dockIcon.getBoundingClientRect();
      // Calculate offset from window center to dock icon center
      const windowCenterX = windowPosition.x + windowSize.width / 2;
      const windowCenterY = windowPosition.y + windowSize.height / 2;
      return {
        x: rect.left + rect.width / 2 - windowCenterX,
        y: rect.top + rect.height / 2 - windowCenterY,
      };
    }
    
    // Try to find the taskbar item (Windows XP/98 theme)
    const taskbarItem = instanceId 
      ? document.querySelector(`[data-taskbar-item="${instanceId}"]`)
      : null;
    if (taskbarItem) {
      const rect = taskbarItem.getBoundingClientRect();
      // Calculate offset from window center to taskbar item center
      const windowCenterX = windowPosition.x + windowSize.width / 2;
      const windowCenterY = windowPosition.y + windowSize.height / 2;
      return {
        x: rect.left + rect.width / 2 - windowCenterX,
        y: rect.top + rect.height / 2 - windowCenterY,
      };
    }
    
    return { x: 0, y: window.innerHeight - windowPosition.y }; // Fallback to bottom of screen
  }, [appId, instanceId, windowPosition, windowSize, currentTheme]);

  // Get launch origin from instance (position of icon that launched this window)
  const launchOrigin = instanceId ? instances[instanceId]?.launchOrigin : undefined;

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

  // Calculate expose transform for Mission Control view
  const exposeTransform = useMemo(() => {
    if (!exposeMode || !instanceId) return null;
    
    // Get all open instances (excluding minimized) and find this instance's index
    const openInstances = Object.values(instances).filter(inst => inst.isOpen && !inst.isMinimized);
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
  }, [exposeMode, instanceId, instances, windowPosition, windowSize, isMobile]);


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
      } else {
        bringToForeground(appId);
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
      } else {
        bringToForeground(appId);
      }
    }
  };

  // Guard: avoid maximizing when the event originates from titlebar control areas
  const isFromTitlebarControls = (target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    if (!el) return false;
    if (el.closest("[data-titlebar-controls]")) return true;
    if (el.closest(".title-bar-controls")) return true; // XP/98
    if (el.closest('button,[role="button"]')) return true;
    return false;
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
      } else {
        updateWindowState(appId, windowPosition, newSize);
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
      } else {
        updateWindowState(appId, newPosition, newSize);
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
        } else {
          updateWindowState(
            appId,
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
        } else {
          updateWindowState(appId, newPosition, newSize);
        }
      }
    },
    [
      isMaximized,
      mergedConstraints,
      windowPosition,
      windowSize,
      appId,
      getSafeAreaBottomInset,
      updateInstanceWindowState,
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


  // Calculate dynamic style for swipe animation feedback
  const getSwipeStyle = () => {
    if (!isPhone || !isSwiping || !swipeDirection) {
      return {};
    }

    // Apply a slight translation effect during swipe
    const translateAmount = swipeDirection === "left" ? -10 : 10;
    return {
      transform: `translateX(${translateAmount}px)`,
      transition: "transform 0.1s ease",
    };
  };

  // For close: keep showing but animate to closed state, then unmount via onAnimationComplete
  // For minimize: by default unmount via AnimatePresence exit animation
  // If keepMountedWhenMinimized is true, keep content mounted but visually hidden (useful for audio/video apps)
  const shouldShow = keepMountedWhenMinimized ? isOpen : (!isMinimized && isOpen);

  // Shake/nudge animation using Framer Motion
  const shakeTransition = {
    duration: 0.4,
    ease: "easeInOut" as const,
  };

  // Determine animation variants
  const getInitialAnimation = () => {
    if (shouldAnimateRestore) {
      // Restoring from minimized - animate from dock icon position
      return { 
        scale: 0.1, 
        opacity: 0, 
        x: dockIconOffset.x,
        y: dockIconOffset.y 
      };
    }
    if (isInitialMount) {
      // Initial window open - animate from launch origin if available
      if (launchOriginOffset) {
        return { 
          scale: 0.1, 
          opacity: 0,
          x: launchOriginOffset.x,
          y: launchOriginOffset.y,
        };
      }
      // Fallback to simple scale/opacity animation
      return { scale: 0.95, opacity: 0 };
    }
    return false;
  };

  const getExitAnimation = () => {
    // For apps with keepMountedWhenMinimized, exit is only for close
    // For other apps, exit handles both close and minimize (minimize animates to dock)
    if (keepMountedWhenMinimized) {
      // Only close animation - minimize is handled via animate prop
      return { 
        scale: 0.95, 
        opacity: 0,
        x: 0,
        y: 0,
        transition: { duration: 0.2, ease: [0.32, 0, 0.67, 0] as const }
      };
    }
    // Default behavior: minimize animation - shrink to dock icon position
    return { 
      scale: 0.1, 
      opacity: 0,
      x: dockIconOffset.x,
      y: dockIconOffset.y,
      transition: { duration: 0.25, ease: [0.32, 0, 0.67, 0] as const }
    };
  };

  // Get the animate state based on current conditions
  const getAnimateState = () => {
    if (isClosing) {
      return { 
        scale: 0.95, 
        opacity: 0,
        x: 0,
        y: 0,
        transition: { duration: 0.2, ease: [0.32, 0, 0.67, 0] as const }
      };
    }
    // Only apply minimize animation via animate prop when keepMountedWhenMinimized is true
    // Otherwise, the exit animation handles minimize
    if (keepMountedWhenMinimized && isMinimized) {
      // Minimize animation - shrink to dock icon position
      return { 
        scale: 0.1, 
        opacity: 0,
        x: dockIconOffset.x,
        y: dockIconOffset.y,
        transition: { duration: 0.25, ease: [0.32, 0, 0.67, 0] as const }
      };
    }
    
    if (isShaking) {
      return {
        scale: 1,
        opacity: 1,
        x: [0, -5, 5, -5, 5, -3, 3, 0],
        y: 0,
        transition: {
          scale: { duration: 0 },
          opacity: { duration: 0 },
          y: { duration: 0 },
          x: shakeTransition,
        }
      };
    }
    
    // Normal visible state
    // Use longer transition for restore or launch from icon animation
    const shouldUseLongerTransition = shouldAnimateRestore || (isInitialMount && launchOriginOffset);
    return { 
      scale: 1, 
      opacity: 1,
      x: 0,
      y: 0,
      transition: shouldUseLongerTransition 
        ? { duration: 0.25, ease: [0.33, 1, 0.68, 1] as const }
        : { duration: 0.2, ease: [0.33, 1, 0.68, 1] as const }
    };
  };

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

  // Render snap zone indicator as a portal
  const snapZoneIndicator = snapZone && snapZoneStyle && isForeground && createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed pointer-events-none z-[9999]"
      style={{
        top: snapZoneStyle.top,
        left: snapZoneStyle.left,
        width: snapZoneStyle.width,
        height: snapZoneStyle.height,
        padding: 8,
      }}
    >
      <div
        className="w-full h-full"
        style={{
          border: "3px solid rgba(255, 255, 255, 0.8)",
          backgroundColor: "rgba(255, 255, 255, 0.1)",
          boxShadow: "0 0 20px rgba(255, 255, 255, 0.3), inset 0 0 20px rgba(255, 255, 255, 0.1)",
          borderRadius: currentTheme === "macosx" ? 12 : 4,
        }}
      />
    </motion.div>,
    document.body
  );

  return (
    <>
    {snapZoneIndicator}
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
              window.dispatchEvent(
                new CustomEvent("exposeWindowSelect", {
                  detail: { instanceId },
                })
              );
              return;
            }
          }}
        >
        <motion.div
          key={instanceId || appId}
          initial={getInitialAnimation()}
          animate={getAnimateState()}
          onAnimationComplete={() => {
            if (isClosing) {
              handleCloseAnimationComplete();
            }
          }}
          exit={getExitAnimation()}
          className={cn(
            "w-full h-full select-none",
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
              } else {
                bringToForeground(appId);
              }
            }
          }}
          style={{
            transformOrigin: "center",
          }}
        >
      <div className="relative w-full h-full">
        {/* Resize handles - positioned outside main content */}
        <div
          className={cn(
            "absolute -top-2 -left-2 -right-2 -bottom-2 pointer-events-none select-none",
            resizerZIndexClass
          )}
        >
          {/* Top resize handle */}
          <div
            className={cn(
              "absolute cursor-n-resize pointer-events-auto transition-[top,height] select-none resize-handle",
              "left-1 right-0", // Full width for all cases
              debugMode && "bg-red-500/50",
              resizeType?.includes("n")
                ? "top-[-100px] h-[200px]"
                : isMobile
                ? isXpTheme
                  ? "top-0 h-4" // Start from top but be shorter for XP/98 themes
                  : currentTheme === "macosx"
                  ? "top-1 h-2" // Extend above window for macOS to avoid traffic lights
                  : "top-0 h-8"
                : "top-1 h-2"
            )}
            onMouseDown={(e) =>
              handleResizeStartWithForeground(e, "n" as ResizeType)
            }
            onTouchStart={(e) =>
              handleResizeStartWithForeground(e, "n" as ResizeType)
            }
            onDoubleClick={handleHeightOnlyMaximize}
          />

          {/* Bottom resize handle */}
          <div
            className={cn(
              "absolute left-1 right-1 cursor-s-resize pointer-events-auto transition-[bottom,height] select-none resize-handle",
              debugMode && "bg-red-500/50",
              resizeType?.includes("s")
                ? "bottom-[-100px] h-[200px]"
                : isMobile
                ? "bottom-0 h-6"
                : "bottom-1 h-2"
            )}
            onMouseDown={(e) =>
              handleResizeStartWithForeground(e, "s" as ResizeType)
            }
            onTouchStart={(e) =>
              handleResizeStartWithForeground(e, "s" as ResizeType)
            }
            onDoubleClick={handleHeightOnlyMaximize}
          />

          {/* Left resize handle */}
          <div
            className={cn(
              "absolute top-3 cursor-w-resize pointer-events-auto transition-[left,width] select-none resize-handle",
              debugMode && "bg-red-500/50",
              resizeType?.includes("w")
                ? "left-[-100px] w-[200px]"
                : "left-1 w-2"
            )}
            style={{ bottom: resizeType?.includes("s") ? "32px" : "24px" }}
            onMouseDown={(e) =>
              handleResizeStartWithForeground(e, "w" as ResizeType)
            }
            onTouchStart={(e) =>
              handleResizeStartWithForeground(e, "w" as ResizeType)
            }
          />

          {/* Right resize handle */}
          <div
            className={cn(
              "absolute top-6 cursor-e-resize pointer-events-auto transition-[right,width] select-none resize-handle",
              debugMode && "bg-red-500/50",
              resizeType?.includes("e")
                ? "right-[-100px] w-[200px]"
                : "right-1 w-2"
            )}
            style={{ bottom: resizeType?.includes("s") ? "32px" : "24px" }}
            onMouseDown={(e) =>
              handleResizeStartWithForeground(e, "e" as ResizeType)
            }
            onTouchStart={(e) =>
              handleResizeStartWithForeground(e, "e" as ResizeType)
            }
          />

          {/* Corner resize handles */}
          <div
            className={cn(
              "absolute cursor-ne-resize pointer-events-auto transition-all select-none resize-handle",
              debugMode && "bg-red-500/50",
              isMobile && "hidden",
              resizeType === "ne"
                ? "top-[-100px] right-[-100px] w-[200px] h-[200px]"
                : "top-0 right-0 w-6 h-6"
            )}
            onMouseDown={(e) =>
              handleResizeStartWithForeground(e, "ne" as ResizeType)
            }
            onTouchStart={(e) =>
              handleResizeStartWithForeground(e, "ne" as ResizeType)
            }
          />

          <div
            className={cn(
              "absolute cursor-sw-resize pointer-events-auto transition-all select-none resize-handle",
              debugMode && "bg-red-500/50",
              isMobile && "hidden",
              resizeType === "sw"
                ? "bottom-[-100px] left-[-100px] w-[200px] h-[200px]"
                : "bottom-0 left-0 w-6 h-6"
            )}
            onMouseDown={(e) =>
              handleResizeStartWithForeground(e, "sw" as ResizeType)
            }
            onTouchStart={(e) =>
              handleResizeStartWithForeground(e, "sw" as ResizeType)
            }
          />

          <div
            className={cn(
              "absolute cursor-se-resize pointer-events-auto transition-all select-none resize-handle",
              debugMode && "bg-red-500/50",
              isMobile && "hidden",
              resizeType === "se"
                ? "bottom-[-100px] right-[-100px] w-[200px] h-[200px]"
                : "bottom-0 right-0 w-6 h-6"
            )}
            onMouseDown={(e) =>
              handleResizeStartWithForeground(e, "se" as ResizeType)
            }
            onTouchStart={(e) =>
              handleResizeStartWithForeground(e, "se" as ResizeType)
            }
          />
        </div>

        <div
          className={cn(
            isXpTheme
              ? "window flex flex-col h-full" // Use xp.css window class with flex layout
              : isNoTitlebar && currentTheme === "macosx"
              ? "window w-full h-full flex flex-col rounded-os overflow-hidden relative" // No border for notitlebar
              : "window w-full h-full flex flex-col border-[length:var(--os-metrics-border-width)] border-os-window rounded-os overflow-hidden",
            !effectiveTransparentBackground && !isXpTheme && "bg-os-window-bg",
            !isXpTheme && (currentTheme !== "system7" || isForeground)
              ? "shadow-os-window"
              : "",
            isForeground ? "is-foreground" : ""
          )}
          style={{
            ...(!isXpTheme ? getSwipeStyle() : undefined),
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
          {/* Title bar */}
          {isXpTheme ? (
            // XP/98 theme title bar structure
            <div
              className={cn(
                "title-bar relative z-50",
                !isForeground && "inactive" // Add inactive class when not in foreground
              )}
              style={{
                ...(currentTheme === "xp" ? { minHeight: "30px" } : undefined),
                ...(!isForeground
                  ? {
                      background: theme.colors.titleBar.inactiveBg,
                    }
                  : undefined),
              }}
              onMouseDown={handleMouseDownWithForeground}
              onDoubleClick={(e) => {
                if (isFromTitlebarControls(e.target)) return;
                handleFullMaximize(e);
              }}
              onTouchStart={(e: React.TouchEvent<HTMLElement>) => {
                if (isFromTitlebarControls(e.target)) {
                  e.stopPropagation();
                  return;
                }
                handleTitleBarTap(e);
                handleMouseDownWithForeground(e);
                if (isPhone) {
                  handleTouchStart(e);
                }
              }}
              onTouchMove={(e: React.TouchEvent<HTMLElement>) => {
                if (isPhone) {
                  handleTouchMove(e);
                }
              }}
              onTouchEnd={() => {
                if (isPhone) {
                  handleTouchEnd();
                }
              }}
            >
              <div
                className={cn(
                  "title-bar-text",
                  !isForeground && "inactive" // Add inactive class for text too
                )}
                style={{
                  display: "flex",
                  alignItems: "center",
                  ...(!isForeground
                    ? {
                        color: theme.colors.titleBar.inactiveText,
                      }
                    : {}),
                }}
                onTouchMove={(e) => e.preventDefault()}
              >
                <ThemedIcon
                  name={getAppIconPath(appId)}
                  alt={title}
                  className="w-4 h-4 mr-1 [image-rendering:pixelated]"
                  style={{
                    filter: !isForeground ? "grayscale(100%)" : "none",
                  }}
                />
                {title}
              </div>
              <div className="title-bar-controls" data-titlebar-controls>
                {(titleBarRightContent || onFullscreenToggle) &&
                  (titleBarRightContent ?? (
                    <button
                      aria-label={t("common.window.fullscreen")}
                      data-action="fullscreen"
                      onClick={(e) => {
                        e.stopPropagation();
                        onFullscreenToggle!();
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                    />
                  ))}
                <button
                  aria-label={t("common.window.minimize")}
                  data-action="minimize"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMinimize();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                />
                <button
                  aria-label={t("common.window.maximize")}
                  data-action="maximize"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFullMaximize(e);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                />
                <button
                  aria-label={t("common.window.close")}
                  data-action="close"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClose();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          ) : currentTheme === "macosx" ? (
            // Mac OS X theme title bar with traffic light buttons
            <div
              className={cn(
                "title-bar relative flex items-center h-6 min-h-[1.25rem] mx-0 mb-0 px-[0.1rem] py-[0.1rem] select-none cursor-move user-select-none z-50 draggable-area",
                // For notitlebar: absolute positioning, no shrink, transition opacity
                isNoTitlebar 
                  ? "absolute top-0 left-0 right-0 transition-opacity duration-200" 
                  : "shrink-0",
                effectiveTransparentBackground && !isNoTitlebar && "mt-0"
              )}
              style={{
                borderRadius: isNoTitlebar ? "8px 8px 0px 0px" : "8px 8px 0px 0px",
                // For notitlebar: gradient background for visibility, opacity based on hover
                ...(isNoTitlebar
                  ? {
                      background: "linear-gradient(180deg, rgba(0, 0, 0, 0.2) 0%, rgba(0, 0, 0, 0) 100%)",
                      borderBottom: "none",
                      opacity: isTitlebarHovered ? 1 : 0,
                    }
                  : isForeground
                  ? {
                      backgroundColor: "var(--os-color-window-bg)",
                      backgroundImage:
                        "var(--os-pinstripe-titlebar), var(--os-pinstripe-window)",
                    }
                  : {
                      backgroundColor: "rgba(255, 255, 255, 0.6)",
                      backgroundImage: "var(--os-pinstripe-window)",
                      opacity: "0.85",
                    }),
                // No border for notitlebar
                ...(!isNoTitlebar && {
                  borderBottom: `1px solid ${
                    isForeground
                      ? theme.colors.titleBar.borderBottom ||
                        theme.colors.titleBar.border ||
                        "rgba(0, 0, 0, 0.1)"
                      : theme.colors.titleBar.borderInactive ||
                        "rgba(0, 0, 0, 0.05)"
                  }`,
                }),
              }}
              onMouseDown={handleMouseDownWithForeground}
              onDoubleClick={(e) => {
                if (isFromTitlebarControls(e.target)) return;
                handleFullMaximize(e);
              }}
              onTouchStart={(e: React.TouchEvent<HTMLElement>) => {
                // For notitlebar: show title bar when tapping the top area (only if auto-hide is enabled)
                if (isNoTitlebar && !disableTitlebarAutoHide) {
                  showTitlebarWithAutoHide();
                }
                if (isFromTitlebarControls(e.target)) {
                  e.stopPropagation();
                  return;
                }
                handleTitleBarTap(e);
                handleMouseDownWithForeground(e);
                if (isPhone) {
                  handleTouchStart(e);
                }
              }}
              onTouchMove={(e: React.TouchEvent<HTMLElement>) => {
                if (isPhone) {
                  handleTouchMove(e);
                }
              }}
              onTouchEnd={() => {
                if (isPhone) {
                  handleTouchEnd();
                }
              }}
            >
              {/* Traffic Light Buttons */}
              <div
                className="flex items-center gap-2 ml-1.5 relative"
                data-titlebar-controls
              >
                <TrafficLightButton
                  color="red"
                  onClick={handleClose}
                  isForeground={isForeground}
                  debugMode={debugMode}
                  ariaLabel={t("common.window.close")}
                />
                <TrafficLightButton
                  color="yellow"
                  onClick={handleMinimize}
                  isForeground={isForeground}
                  debugMode={debugMode}
                  ariaLabel={t("common.window.minimize")}
                />
                <TrafficLightButton
                  color="green"
                  onClick={handleFullMaximize}
                  isForeground={isForeground}
                  debugMode={debugMode}
                  ariaLabel={t("common.window.maximize")}
                />
              </div>

              {/* Title - absolutely centered so it stays centered regardless of left/right content width */}
              <span
                className={cn(
                  "select-none absolute left-1/2 -translate-x-1/2 px-2 py-0 h-full flex items-center justify-center whitespace-nowrap overflow-hidden text-ellipsis max-w-[80%] text-[13px] pointer-events-none",
                  isNoTitlebar
                    ? "text-white"
                    : isForeground
                    ? "text-os-titlebar-active-text"
                    : "text-os-titlebar-inactive-text"
                )}
                style={{
                  textShadow: isNoTitlebar
                    ? "0 1px 3px rgba(0, 0, 0, 0.8)"
                    : isForeground
                    ? "0 2px 3px rgba(0, 0, 0, 0.25)"
                    : "none",
                  fontWeight: 500,
                }}
                onTouchMove={(e) => e.preventDefault()}
              >
                <span className="truncate">{title}</span>
              </span>

{/* Titlebar right content, fullscreen button, or spacer to balance the traffic lights */}
                              <div className="flex items-center justify-end ml-auto mr-1" data-titlebar-controls>
                                {titleBarRightContent ? (
                                  titleBarRightContent
                                ) : onFullscreenToggle ? (
                                  <button
                                    aria-label={t("common.window.fullscreen")}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onFullscreenToggle();
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onTouchStart={(e) => e.stopPropagation()}
                                    data-titlebar-controls
                                    className={cn(
                                      "w-5 h-5 flex items-center justify-center",
                                      isNoTitlebar
                                        ? "text-white/80"
                                        : isForeground
                                        ? "text-gray-500"
                                        : "text-gray-400"
                                    )}
                                    style={{
                                      filter: isNoTitlebar
                                        ? "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6))"
                                        : isForeground
                                        ? "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2))"
                                        : "none",
                                    }}
                                  >
                                    <ArrowsOutSimple size={14} weight="bold" />
                                  </button>
                                ) : (
                                  <div style={{ width: 52 }} />
                                )}
                              </div>
            </div>
          ) : (
            // Original Mac theme title bar (for System 7)
            <div
              className={cn(
                "flex items-center shrink-0 h-os-titlebar min-h-[1.5rem] mx-0 my-[0.1rem] mb-0 px-[0.1rem] py-[0.2rem] select-none cursor-move border-b-[1.5px] user-select-none z-50 draggable-area",
                isTransparent && "mt-0",
                isForeground
                  ? isTransparent
                    ? "bg-white/70 backdrop-blur-sm border-b-os-window"
                    : "bg-os-titlebar-active-bg bg-os-titlebar-pattern bg-clip-content bg-[length:6.6666666667%_13.3333333333%] border-b-os-window"
                  : isTransparent
                  ? "bg-white/20 backdrop-blur-sm border-b-os-window"
                  : "bg-os-titlebar-inactive-bg border-b-gray-400"
              )}
              onMouseDown={handleMouseDownWithForeground}
              onDoubleClick={(e) => {
                if (isFromTitlebarControls(e.target)) return;
                handleFullMaximize(e);
              }}
              onTouchStart={(e: React.TouchEvent<HTMLElement>) => {
                if (isFromTitlebarControls(e.target)) {
                  e.stopPropagation();
                  return;
                }
                handleTitleBarTap(e);
                handleMouseDownWithForeground(e);
                if (isPhone) {
                  handleTouchStart(e);
                }
              }}
              onTouchMove={(e: React.TouchEvent<HTMLElement>) => {
                if (isPhone) {
                  handleTouchMove(e);
                }
              }}
              onTouchEnd={() => {
                if (isPhone) {
                  handleTouchEnd();
                }
              }}
            >
              <div
                onClick={handleClose}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                className="relative ml-2 w-4 h-4 cursor-default select-none"
                data-titlebar-controls
              >
                <div className="absolute inset-0 -m-2" />{" "}
                {/* Larger click area */}
                <div
                  className={`w-4 h-4 ${
                    !isTransparent &&
                    "bg-os-button-face shadow-[0_0_0_1px_var(--os-color-button-face)]"
                  } border-2 border-os-window hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center ${
                    !isForeground && "invisible"
                  }`}
                />
              </div>
              <span
                className={cn(
                  "select-none mx-auto px-2 py-0 h-full flex items-center whitespace-nowrap overflow-hidden text-ellipsis max-w-[80%]",
                  !isTransparent && "bg-os-button-face",
                  isForeground
                    ? "text-os-titlebar-active-text"
                    : "text-os-titlebar-inactive-text"
                )}
                onTouchMove={(e) => e.preventDefault()}
              >
<span className="truncate">{title}</span>
                              </span>
                              {titleBarRightContent ? (
                                <span className="mr-2 flex items-center shrink-0">{titleBarRightContent}</span>
                              ) : onFullscreenToggle ? (
                                <button
                                  aria-label={t("common.window.fullscreen")}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onFullscreenToggle();
                                  }}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onTouchStart={(e) => e.stopPropagation()}
                                  data-titlebar-controls
                                  className={cn(
                                    "mr-2 w-5 h-5 flex items-center justify-center",
                                    isForeground
                                      ? "text-gray-600"
                                      : "text-gray-400"
                                  )}
                                >
                                  <ArrowsOutSimple size={12} weight="bold" />
                                </button>
                              ) : (
                                <div className="mr-2 w-4 h-4" />
                              )}
                            </div>
          )}

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
              "flex flex-1 min-h-0 flex-col md:flex-row relative",
              isXpTheme && "window-body flex-1"
            )}
            style={
              isXpTheme
                ? { margin: currentTheme === "xp" ? "0px 3px" : "0" }
                : currentTheme === "macosx"
                ? isTransparent
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
