import { useWindowManager } from "@/hooks/useWindowManager";
import { ResizeType } from "@/types/types";
import { useAppContext } from "@/contexts/AppContext";
import { useSound, Sounds } from "@/hooks/useSound";
import { useVibration } from "@/hooks/useVibration";
import { useEffect, useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { getWindowConfig, getAppIconPath } from "@/config/appRegistry";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";
import { AppId } from "@/config/appIds";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useIsPhone } from "@/hooks/useIsPhone";
import { useAppStoreShallow } from "@/stores/helpers";
import { useThemeStore } from "@/stores/useThemeStore";
import { getTheme } from "@/themes";

interface WindowFrameProps {
  children: React.ReactNode;
  title: string;
  onClose?: () => void;
  isForeground?: boolean;
  appId: AppId;
  isShaking?: boolean;
  transparentBackground?: boolean;
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
}

export function WindowFrame({
  children,
  title,
  onClose,
  isForeground = true,
  isShaking = false,
  appId,
  transparentBackground = false,
  skipInitialSound = false,
  windowConstraints = {},
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
  interceptClose = false,
  menuBar, // Add menuBar to destructured props
}: WindowFrameProps) {
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
  const [isVisible, setIsVisible] = useState(true);
  const [isInitialMount, setIsInitialMount] = useState(true);
  const { bringToForeground } = useAppContext();
  const {
    bringInstanceToForeground,
    debugMode,
    updateWindowState,
    updateInstanceWindowState,
  } = useAppStoreShallow((state) => ({
    bringInstanceToForeground: state.bringInstanceToForeground,
    debugMode: state.debugMode,
    updateWindowState: state.updateWindowState,
    updateInstanceWindowState: state.updateInstanceWindowState,
  }));
  const { play: playWindowOpen } = useSound(Sounds.WINDOW_OPEN);
  const { play: playWindowClose } = useSound(Sounds.WINDOW_CLOSE);
  const { play: playWindowExpand } = useSound(Sounds.WINDOW_EXPAND);
  const { play: playWindowCollapse } = useSound(Sounds.WINDOW_COLLAPSE);
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

  // Get current theme
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const theme = getTheme(currentTheme);

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

  const handleTransitionEnd = useCallback(
    (e: React.TransitionEvent) => {
      if (
        e.target === e.currentTarget &&
        !isOpen &&
        e.propertyName === "opacity"
      ) {
        setIsVisible(false);
        // For normal closes (non-intercepted), call onClose here
        if (!interceptClose) {
          onClose?.();
        }
        isClosingRef.current = false;
      }
    },
    [isOpen, interceptClose, onClose]
  );

  const handleClose = () => {
    if (interceptClose) {
      // Call the parent's onClose handler for interception (like confirmation dialogs)
      onClose?.();
    } else {
      // Normal close behavior with animation and sounds
      isClosingRef.current = true;
      vibrateClose();
      playWindowClose();
      setIsOpen(false);
    }
  };

  // Function to actually perform the close operation
  // This should be called by the parent component after confirmation
  const performClose = useCallback(() => {
    isClosingRef.current = true;
    vibrateClose();
    playWindowClose();
    setIsOpen(false);
  }, [vibrateClose, playWindowClose, setIsOpen]);

  // Expose performClose to parent component through a custom event (only for intercepted closes)
  useEffect(() => {
    if (!interceptClose) return;

    const handlePerformClose = (event: CustomEvent) => {
      const onComplete = event.detail?.onComplete;
      performClose();

      // Call the completion callback after the close animation finishes
      if (onComplete) {
        // Wait for the transition to complete (200ms as per the transition duration)
        setTimeout(() => {
          onComplete();
        }, 200);
      }
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
  } = useWindowManager({ appId, instanceId });

  // No longer track maximized state based on window dimensions
  useEffect(() => {
    const menuBarHeight = 30;
    const maxPossibleHeight = window.innerHeight - menuBarHeight;
    // Consider window at full height if it's within 5px of max height (to account for rounding)
    setIsFullHeight(Math.abs(windowSize.height - maxPossibleHeight) < 5);
  }, [windowSize.height]);

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
      const menuBarHeight = 30;
      const safeAreaBottom = getSafeAreaBottomInset();
      const maxPossibleHeight =
        window.innerHeight - menuBarHeight - safeAreaBottom;
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
        y: menuBarHeight,
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
        const menuBarHeight = 30;
        const safeAreaBottom = getSafeAreaBottomInset();
        const maxPossibleHeight =
          window.innerHeight - menuBarHeight - safeAreaBottom;
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
          y: menuBarHeight,
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

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
    };
  }, []);

  if (!isVisible) return null;

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

  return (
    <div
      className={cn(
        "absolute p-2 md:p-0 w-full h-full md:mt-0 select-none",
        "transition-all duration-200 ease-in-out",
        isInitialMount && "animate-in fade-in-0 zoom-in-95 duration-200",
        isShaking && "animate-shake",
        // Disable all pointer events when window is closing
        !isOpen && "pointer-events-none"
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
      onTransitionEnd={handleTransitionEnd}
      style={{
        left: windowPosition.x,
        top: Math.max(0, windowPosition.y),
        width: window.innerWidth >= 768 ? windowSize.width : "100%",
        height: Math.max(windowSize.height, mergedConstraints.minHeight || 0),
        minWidth:
          window.innerWidth >= 768 ? mergedConstraints.minWidth : "100%",
        minHeight: mergedConstraints.minHeight,
        maxWidth: mergedConstraints.maxWidth || undefined,
        maxHeight: mergedConstraints.maxHeight || undefined,
        transition: isDragging || resizeType ? "none" : undefined,
        transform: !isInitialMount && !isOpen ? "scale(0.95)" : undefined,
        opacity: !isInitialMount && !isOpen ? 0 : undefined,
        transformOrigin: "center",
      }}
    >
      <div className="relative w-full h-full">
        {/* Resize handles - positioned outside main content */}
        <div className="absolute -top-2 -left-2 -right-2 -bottom-2 pointer-events-none z-50 select-none">
          {/* Top resize handle */}
          <div
            className={cn(
              "absolute left-1 right-0 cursor-n-resize pointer-events-auto transition-[top,height] select-none resize-handle",
              debugMode && "bg-red-500/50",
              resizeType?.includes("n")
                ? "top-[-100px] h-[200px]"
                : isMobile
                ? isXpTheme
                  ? "top-0 h-4" // Start from top but be shorter for XP/98 themes
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
              "absolute left-0 right-0 cursor-s-resize pointer-events-auto transition-[bottom,height] select-none resize-handle",
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
              : "w-full h-full flex flex-col border-[length:var(--os-metrics-border-width)] border-os-window rounded-os overflow-hidden",
            !transparentBackground && !isXpTheme && "bg-os-window-bg",
            !isXpTheme ? "shadow-os-window" : "",
            isForeground ? "is-foreground" : ""
          )}
          style={{
            ...(!isXpTheme ? getSwipeStyle() : undefined),
            ...(currentTheme === "macosx" && !transparentBackground
              ? {
                  backgroundImage: `var(--os-pinstripe-window), var(--os-color-window-bg)`,
                }
              : {}),
          }}
        >
          {/* Title bar */}
          {isXpTheme ? (
            // XP/98 theme title bar structure
            <div
              className={cn(
                "title-bar",
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
              onTouchStart={(e: React.TouchEvent<HTMLElement>) => {
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
                onDoubleClick={handleFullMaximize}
                onTouchStart={(e) => {
                  handleTitleBarTap(e);
                  // Allow the event to bubble up to the titlebar for drag handling
                  handleMouseDownWithForeground(e);
                }}
                onTouchMove={(e) => e.preventDefault()}
              >
                <img
                  src={getAppIconPath(appId)}
                  alt=""
                  className="w-4 h-4 mr-1"
                  style={{
                    imageRendering: "pixelated",
                    filter: !isForeground ? "grayscale(100%)" : "none",
                  }}
                />
                {title}
              </div>
              <div className="title-bar-controls">
                <button
                  aria-label="Minimize"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Minimize functionality could be added here
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                />
                <button
                  aria-label="Maximize"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFullMaximize(e);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                />
                <button
                  aria-label="Close"
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
                "flex items-center shrink-0 h-6 min-h-[1.25rem] mx-0 mb-0 px-[0.1rem] py-[0.1rem] select-none cursor-move user-select-none z-50 draggable-area",
                transparentBackground && "mt-0",
                transparentBackground &&
                  isForeground &&
                  "bg-white/70 backdrop-blur-sm",
                transparentBackground &&
                  !isForeground &&
                  "bg-white/20 backdrop-blur-sm"
              )}
              style={{
                borderRadius: "8px 8px 0px 0px",
                background: !transparentBackground
                  ? isForeground
                    ? theme.colors.titleBar.activeBg
                    : theme.colors.titleBar.inactiveBg
                  : undefined,
                borderBottom: `1px solid ${
                  isForeground
                    ? theme.colors.titleBar.borderBottom ||
                      theme.colors.titleBar.border ||
                      "rgba(0, 0, 0, 0.1)"
                    : theme.colors.titleBar.borderInactive ||
                      "rgba(0, 0, 0, 0.05)"
                }`,
              }}
              onMouseDown={handleMouseDownWithForeground}
              onTouchStart={(e: React.TouchEvent<HTMLElement>) => {
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
              <div className="flex items-center gap-1.5 ml-1.5">
                {/* Close Button (Red) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClose();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="w-3 h-3 rounded-full relative transition-all duration-150"
                  style={
                    theme.id === "macosx"
                      ? undefined
                      : {
                          background: isForeground
                            ? theme.colors.trafficLights?.close ||
                              "rgba(255, 96, 87, 1)"
                            : "rgba(0, 0, 0, 0.14)",
                          border: `1px solid ${
                            isForeground
                              ? theme.colors.trafficLights?.closeHover ||
                                "rgba(225, 70, 64, 1)"
                              : "rgba(0, 0, 0, 0.2)"
                          }`,
                        }
                  }
                  aria-label="Close"
                />
                {/* Minimize Button (Yellow) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Minimize functionality could be added here
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="w-3 h-3 rounded-full relative transition-all duration-150"
                  style={
                    theme.id === "macosx"
                      ? undefined
                      : {
                          background: isForeground
                            ? theme.colors.trafficLights?.minimize ||
                              "rgba(255, 189, 46, 1)"
                            : "rgba(0, 0, 0, 0.14)",
                          border: `1px solid ${
                            isForeground
                              ? theme.colors.trafficLights?.minimizeHover ||
                                "rgba(223, 161, 35, 1)"
                              : "rgba(0, 0, 0, 0.2)"
                          }`,
                        }
                  }
                  aria-label="Minimize"
                />
                {/* Maximize Button (Green) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFullMaximize(e);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="w-3 h-3 rounded-full relative transition-all duration-150"
                  style={
                    theme.id === "macosx"
                      ? undefined
                      : {
                          background: isForeground
                            ? theme.colors.trafficLights?.maximize ||
                              "rgba(39, 201, 63, 1)"
                            : "rgba(0, 0, 0, 0.14)",
                          border: `1px solid ${
                            isForeground
                              ? theme.colors.trafficLights?.maximizeHover ||
                                "rgba(29, 173, 43, 1)"
                              : "rgba(0, 0, 0, 0.2)"
                          }`,
                        }
                  }
                  aria-label="Maximize"
                />
              </div>

              {/* Title - removed white background */}
              <span
                className={cn(
                  "select-none mx-auto px-2 py-0 h-full flex items-center whitespace-nowrap overflow-hidden text-ellipsis max-w-[80%] text-[12px]",
                  isForeground
                    ? "text-os-titlebar-active-text"
                    : "text-os-titlebar-inactive-text"
                )}
                style={{
                  textShadow: isForeground
                    ? "0 1px 0 rgba(255, 255, 255, 0.5)"
                    : "none",
                }}
                onDoubleClick={handleFullMaximize}
                onTouchStart={(e) => {
                  handleTitleBarTap(e);
                  // Allow the event to bubble up to the titlebar for drag handling
                  handleMouseDownWithForeground(e);
                }}
                onTouchMove={(e) => e.preventDefault()}
              >
                <span className="truncate">{title}</span>
              </span>

              {/* Spacer to balance the traffic lights */}
              <div className="mr-2 w-12 h-4" />
            </div>
          ) : (
            // Original Mac theme title bar (for System 7)
            <div
              className={cn(
                "flex items-center shrink-0 h-os-titlebar min-h-[1.5rem] mx-0 my-[0.1rem] mb-0 px-[0.1rem] py-[0.2rem] select-none cursor-move border-b-[1.5px] user-select-none z-50 draggable-area",
                transparentBackground && "mt-0",
                isForeground
                  ? transparentBackground
                    ? "bg-white/70 backdrop-blur-sm border-b-os-window"
                    : "bg-os-titlebar-active-bg bg-os-titlebar-pattern bg-clip-content bg-[length:6.6666666667%_13.3333333333%] border-b-os-window"
                  : transparentBackground
                  ? "bg-white/20 backdrop-blur-sm border-b-os-window"
                  : "bg-os-titlebar-inactive-bg border-b-gray-400"
              )}
              onMouseDown={handleMouseDownWithForeground}
              onTouchStart={(e: React.TouchEvent<HTMLElement>) => {
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
              >
                <div className="absolute inset-0 -m-2" />{" "}
                {/* Larger click area */}
                <div
                  className={`w-4 h-4 ${
                    !transparentBackground &&
                    "bg-os-button-face shadow-[0_0_0_1px_var(--os-color-button-face)]"
                  } border-2 border-os-window hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center ${
                    !isForeground && "invisible"
                  }`}
                />
              </div>
              <span
                className={cn(
                  "select-none mx-auto px-2 py-0 h-full flex items-center whitespace-nowrap overflow-hidden text-ellipsis max-w-[80%]",
                  !transparentBackground && "bg-os-button-face",
                  isForeground
                    ? "text-os-titlebar-active-text"
                    : "text-os-titlebar-inactive-text"
                )}
                onDoubleClick={handleFullMaximize}
                onTouchStart={(e) => {
                  handleTitleBarTap(e);
                  // Allow the event to bubble up to the titlebar for drag handling
                  handleMouseDownWithForeground(e);
                }}
                onTouchMove={(e) => e.preventDefault()}
              >
                <span className="truncate">{title}</span>
              </span>
              <div className="mr-2 w-4 h-4" />
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
              "flex flex-1 min-h-0 flex-col md:flex-row",
              isXpTheme && "window-body flex-1"
            )}
            style={
              isXpTheme
                ? { margin: currentTheme === "xp" ? "0px 3px" : "0" }
                : undefined
            }
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
