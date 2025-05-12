import { useState, useEffect, useCallback, useRef } from "react";
import {
  WindowPosition,
  WindowSize,
  ResizeType,
  ResizeStart,
  SnapZone,
} from "../types/types";
import { appIds, AppId } from "@/config/appIds";
import { useAppStore } from "@/stores/useAppStore";
import { useSound, Sounds } from "./useSound";
import { getWindowConfig } from "@/config/appRegistry";

interface UseWindowManagerProps {
  appId: AppId;
}

export const useWindowManager = ({ appId }: UseWindowManagerProps) => {
  // Fetch the persisted window state from the global app store
  const appStateFromStore = useAppStore((state) => state.apps[appId]);

  const config = getWindowConfig(appId);

  // Helper to compute default window state (mirrors previous logic)
  const computeDefaultWindowState = (): {
    position: WindowPosition;
    size: WindowSize;
  } => {
    const isMobile = window.innerWidth < 768;
    const mobileY = 28; // Fixed Y position for mobile to account for menu bar

    const appIndex = appIds.indexOf(appId);
    const offsetIndex = appIndex >= 0 ? appIndex : 0;

    return {
      position: {
        x: isMobile ? 0 : 16 + offsetIndex * 32,
        y: isMobile ? mobileY : 40 + offsetIndex * 20,
      },
      size: isMobile
        ? {
            width: window.innerWidth,
            height: config.defaultSize.height,
          }
        : config.defaultSize,
    };
  };

  const initialState = {
    position: appStateFromStore?.position ?? computeDefaultWindowState().position,
    size: appStateFromStore?.size ?? computeDefaultWindowState().size,
  };

  const adjustedPosition = { ...initialState.position };

  // Ensure window is visible within viewport
  if (adjustedPosition.x + initialState.size.width > window.innerWidth) {
    adjustedPosition.x = Math.max(
      0,
      window.innerWidth - initialState.size.width
    );
  }

  const [windowPosition, setWindowPosition] =
    useState<WindowPosition>(adjustedPosition);
  const [windowSize, setWindowSize] = useState<WindowSize>(initialState.size);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragStartPosition, setDragStartPosition] = useState({ x: 0, y: 0 });
  const [resizeType, setResizeType] = useState<ResizeType>("");
  const [resizeStart, setResizeStart] = useState<ResizeStart>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    left: 0,
    top: 0,
  });

  // Snap zone related states
  const SNAP_THRESHOLD = 50; // px from screen edge to activate snap
  const RESTORE_THRESHOLD = 50; // px dragged down to restore from maximized
  const [snapZone, setSnapZone] = useState<SnapZone>("none");
  const [isSnapping, setIsSnapping] = useState(false);
  const [showSnapIndicator, setShowSnapIndicator] = useState(false);
  const preSnapStateRef = useRef<{position: WindowPosition, size: WindowSize} | null>(null);
  const [isSnapAnimating, setIsSnapAnimating] = useState(false);

  const isMobile = window.innerWidth < 768;

  // Function to get the safe area bottom inset for iOS devices
  const getSafeAreaBottomInset = useCallback(() => {
    // Get the env(safe-area-inset-bottom) value or fallback to 0
    const safeAreaInset = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--sat-safe-area-bottom"
      )
    );
    // On iPadOS, the home indicator height is typically 20px
    return !isNaN(safeAreaInset) ? safeAreaInset : isMobile ? 20 : 0;
  }, [isMobile]);

  const { play: playMoveMoving } = useSound(Sounds.WINDOW_MOVE_MOVING);
  const { play: playMoveStop } = useSound(Sounds.WINDOW_MOVE_STOP);
  const { play: playResizeResizing } = useSound(Sounds.WINDOW_RESIZE_RESIZING);
  const { play: playResizeStop } = useSound(Sounds.WINDOW_RESIZE_STOP);
  const { play: playWindowExpand } = useSound(Sounds.WINDOW_EXPAND);
  const { play: playWindowCollapse } = useSound(Sounds.WINDOW_COLLAPSE);

  const moveAudioRef = useRef<NodeJS.Timeout | null>(null);
  const resizeAudioRef = useRef<NodeJS.Timeout | null>(null);

  const updateWindowState = useAppStore((state) => state.updateWindowState);

  const maximizeWindowHeight = useCallback(
    (maxHeightConstraint?: number | string) => {
      const menuBarHeight = 30;
      const safeAreaBottom = getSafeAreaBottomInset();
      const maxPossibleHeight =
        window.innerHeight - menuBarHeight - safeAreaBottom;
      const maxHeight = maxHeightConstraint
        ? typeof maxHeightConstraint === "string"
          ? parseInt(maxHeightConstraint)
          : maxHeightConstraint
        : maxPossibleHeight;
      const newHeight = Math.min(maxPossibleHeight, maxHeight);

      setWindowSize((prev) => ({
        ...prev,
        height: newHeight,
      }));
      setWindowPosition((prev) => ({
        ...prev,
        y: menuBarHeight,
      }));
      updateWindowState(appId as any, windowPosition, windowSize);
    },
    [getSafeAreaBottomInset, updateWindowState, appId, windowPosition, windowSize]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clientX =
        "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY =
        "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

      setDragOffset({
        x: clientX - rect.left,
        y: clientY - rect.top,
      });
      setDragStartPosition({
        x: clientX,
        y: clientY,
      });
      setIsDragging(true);

      // Save the pre-snap state when we start dragging
      if (snapZone !== "none" && !preSnapStateRef.current) {
        // Create a default pre-snap state if we don't have one
        const menuBarHeight = 30;
        preSnapStateRef.current = {
          position: { 
            x: Math.max(0, (window.innerWidth - config.defaultSize.width) / 2),
            y: Math.max(menuBarHeight, (window.innerHeight - config.defaultSize.height) / 2)
          },
          size: { ...config.defaultSize }
        };
      }
    },
    [windowPosition, windowSize, snapZone, config.defaultSize, dragStartPosition]
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent, type: ResizeType) => {
      e.stopPropagation();
      e.preventDefault();

      // Find the actual window container element (two levels up from the resize handle)
      const windowElement = e.currentTarget.parentElement?.parentElement
        ?.parentElement as HTMLElement;
      const rect = windowElement.getBoundingClientRect();

      const clientX =
        "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY =
        "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

      setResizeStart({
        x: clientX,
        y: clientY,
        width: rect.width,
        height: rect.height,
        left: windowPosition.x,
        top: windowPosition.y,
      });
      setResizeType(type);

      // Reset snap when starting resize
      setSnapZone("none");
      setIsSnapping(false);
      setShowSnapIndicator(false);
    },
    [windowPosition]
  );

  // Function to apply snap when dropping window
  const applySnap = useCallback(() => {
    if (snapZone === "none" || !showSnapIndicator) return;

    // Save current state before snapping if we don't already have one
    if (!preSnapStateRef.current) {
      preSnapStateRef.current = {
        position: { ...windowPosition },
        size: { ...windowSize }
      };
    }

    setIsSnapAnimating(true);
    playWindowExpand();
    
    const menuBarHeight = 30;
    const safeAreaBottom = getSafeAreaBottomInset();
    
    let newPosition: WindowPosition = { ...windowPosition };
    let newSize: WindowSize = { ...windowSize };

    switch (snapZone) {
      case "top":
        // Full screen
        newPosition = { x: 0, y: menuBarHeight };
        newSize = { 
          width: window.innerWidth, 
          height: window.innerHeight - menuBarHeight - safeAreaBottom 
        };
        break;
      case "left":
        // Left half
        newPosition = { x: 0, y: menuBarHeight };
        newSize = { 
          width: Math.floor(window.innerWidth / 2), 
          height: window.innerHeight - menuBarHeight - safeAreaBottom 
        };
        break;
      case "right":
        // Right half
        newPosition = { 
          x: Math.floor(window.innerWidth / 2), 
          y: menuBarHeight 
        };
        newSize = { 
          width: Math.floor(window.innerWidth / 2), 
          height: window.innerHeight - menuBarHeight - safeAreaBottom 
        };
        break;
      default:
        break;
    }

    setWindowPosition(newPosition);
    setWindowSize(newSize);
    setIsSnapping(true);
    
    // Reset animation state after transition completes
    setTimeout(() => {
      setIsSnapAnimating(false);
      updateWindowState(appId as any, newPosition, newSize);
    }, 250);
  }, [snapZone, showSnapIndicator, windowPosition, windowSize, getSafeAreaBottomInset, appId, updateWindowState, playWindowExpand]);

  // Function to restore window to pre-snap state
  const restoreFromSnap = useCallback(() => {
    if (!preSnapStateRef.current) return;
    
    setWindowPosition(preSnapStateRef.current.position);
    setWindowSize(preSnapStateRef.current.size);
    setSnapZone("none");
    setIsSnapping(false);
    setIsSnapAnimating(true);
    playWindowCollapse();
    
    // Reset animation state after a short delay
    setTimeout(() => {
      setIsSnapAnimating(false);
    }, 300);
    
    preSnapStateRef.current = null;
  }, [appId, updateWindowState, playWindowCollapse]);

  useEffect(() => {
    const handleMove = (e: React.MouseEvent<HTMLElement> | MouseEvent) => {
      if (isDragging && !isSnapAnimating) {
        const { clientX, clientY } = e;
        
        // Calculate new position
        const newX = clientX - dragOffset.x;
        const newY = clientY - dragOffset.y;
        
        // Check if window is currently snapped and should be restored based on drag distance
        if (snapZone !== "none" && preSnapStateRef.current) {
          const dragDistanceY = clientY - dragStartPosition.y;
          
          if (dragDistanceY > RESTORE_THRESHOLD) {
            // Calculate mouse position relative to the restored window
            const restoredSize = { ...preSnapStateRef.current.size };
            
            // Calculate the restored position to be centered under the mouse
            const restoredPosition = {
              x: clientX - (restoredSize.width / 2),
              y: clientY - 15  // Position the titlebar under the cursor (approximating drag point)
            };
            
            // Ensure position is within screen bounds
            const maxX = window.innerWidth - restoredSize.width;
            const maxY = window.innerHeight - restoredSize.height;
            restoredPosition.x = Math.min(Math.max(0, restoredPosition.x), maxX);
            restoredPosition.y = Math.min(Math.max(30, restoredPosition.y), maxY);
            
            // Update window state
            setWindowPosition(restoredPosition);
            setWindowSize(restoredSize);
            setSnapZone("none");
            setIsSnapping(false);
            setShowSnapIndicator(false);
            playWindowCollapse();
            
            // Important: Update drag offset to allow continued dragging
            // This makes the window "stick" to the mouse at the titlebar center
            setDragOffset({
              x: restoredSize.width / 2,
              y: 15
            });
            
            // No longer need animation
            setIsSnapAnimating(false);
            
            // Clear the saved pre-snap state
            preSnapStateRef.current = null;
            
            // Continue with dragging - do not return
          }
        }
        
        // Check for snap zones (only in desktop mode)
        if (!isMobile) {
          // Changed: Check cursor position instead of window position
          // Check top edge for full-screen snap
          const isNearTopEdge = clientY < SNAP_THRESHOLD + 30; // 30 is menuBarHeight
          // Check left edge for left-half snap
          const isNearLeftEdge = clientX < SNAP_THRESHOLD;
          // Check right edge for right-half snap
          const isNearRightEdge = clientX > window.innerWidth - SNAP_THRESHOLD;

          // Determine the snap zone based on proximity to screen edges
          let newSnapZone: SnapZone = "none";
          
          if (isNearTopEdge) {
            newSnapZone = "top";
          } else if (isNearLeftEdge) {
            newSnapZone = "left";
          } else if (isNearRightEdge) {
            newSnapZone = "right";
          }
          
          // Update snap indicator
          if (newSnapZone !== snapZone) {
            setTimeout(() => {
              setSnapZone(newSnapZone);
              setShowSnapIndicator(newSnapZone !== "none");
            }, 500);
          }
        }

        if (isMobile) {
          // On mobile, only allow vertical dragging and keep window full width
          setWindowPosition({ x: 0, y: Math.max(30, newY) });
        } else {
          // 允许窗口部分超出屏幕边界，但确保至少有20%的窗口在屏幕内
          const minVisiblePortion = 0.2; // 至少20%的窗口必须可见
          
          // 计算允许的最小/最大坐标，确保有足够的窗口区域可见
          const minX = -windowSize.width * (1 - minVisiblePortion);
          const minY = 30; // 保持标题栏永远可见
          const maxX = window.innerWidth - windowSize.width * minVisiblePortion;
          const maxY = window.innerHeight - windowSize.height * minVisiblePortion;
          
          // 应用限制，但允许一定程度的超出
          const x = Math.min(Math.max(minX, newX), maxX);
          const y = Math.min(Math.max(minY, newY), maxY);
          
          setWindowPosition({ x, y });
        }
      }

      if (resizeType && (resizeType.match(/^[ns]$/) || !isMobile)) {
        e.preventDefault();
        const clientX =
          "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
        const clientY =
          "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

        const deltaX = clientX - resizeStart.x;
        const deltaY = clientY - resizeStart.y;

        const minWidth = config.minSize?.width || 260;
        const minHeight = config.minSize?.height || 200;
        const maxWidth = window.innerWidth * 1.5; // 允许窗口宽度超出屏幕50%
        const safeAreaBottom = getSafeAreaBottomInset();
        const maxHeight = window.innerHeight * 1.5 - safeAreaBottom; // 允许窗口高度超出屏幕50%
        const menuBarHeight = 30;

        let newWidth = resizeStart.width;
        let newHeight = resizeStart.height;
        let newLeft = resizeStart.left;
        let newTop = resizeStart.top;

        if (!isMobile) {
          if (resizeType.includes("e")) {
            // 允许向右扩展超出屏幕
            newWidth = Math.max(resizeStart.width + deltaX, minWidth);
            // 限制最大宽度为屏幕宽度的1.5倍
            newWidth = Math.min(newWidth, maxWidth);
          } else if (resizeType.includes("w")) {
            // 计算新宽度，但允许左边缘超出屏幕
            const potentialWidth = Math.max(resizeStart.width - deltaX, minWidth);
            // 限制最大宽度
            const limitedWidth = Math.min(potentialWidth, maxWidth);
            
            if (limitedWidth !== resizeStart.width) {
              // 计算新的左侧位置，允许为负值（超出屏幕左侧）
              newLeft = resizeStart.left + (resizeStart.width - limitedWidth);
              // 但确保标题栏的部分仍然可见
              if (newLeft + limitedWidth * 0.2 < 0) {
                newLeft = -limitedWidth * 0.8;
              }
              newWidth = limitedWidth;
            }
          }
        }

        if (resizeType.includes("s")) {
          // 允许向下扩展超出屏幕
          newHeight = Math.max(resizeStart.height + deltaY, minHeight);
          // 限制最大高度
          newHeight = Math.min(newHeight, maxHeight);
        } else if (resizeType.includes("n") && !isMobile) {
          // 计算新高度，但确保不小于最小高度
          const potentialHeight = Math.max(resizeStart.height - deltaY, minHeight);
          // 限制最大高度
          const limitedHeight = Math.min(potentialHeight, maxHeight);
          
          if (limitedHeight !== resizeStart.height) {
            // 计算新的顶部位置
            newTop = resizeStart.top + (resizeStart.height - limitedHeight);
            // 确保标题栏始终可见
            newTop = Math.max(menuBarHeight, newTop);
            newHeight = limitedHeight;
          }
        }

        // 如果是nw类型（左上角），需要同时调整宽度和高度
        if (resizeType === "nw" && !isMobile) {
          // 处理宽度调整 (同w类型)
          const potentialWidth = Math.max(resizeStart.width - deltaX, minWidth);
          const limitedWidth = Math.min(potentialWidth, maxWidth);
          
          if (limitedWidth !== resizeStart.width) {
            // 计算新的左侧位置，允许为负值（超出屏幕左侧）
            newLeft = resizeStart.left + (resizeStart.width - limitedWidth);
            // 但确保标题栏的部分仍然可见
            if (newLeft + limitedWidth * 0.2 < 0) {
              newLeft = -limitedWidth * 0.8;
            }
            newWidth = limitedWidth;
          }

          // 处理高度调整 (同n类型)
          const potentialHeight = Math.max(resizeStart.height - deltaY, minHeight);
          const limitedHeight = Math.min(potentialHeight, maxHeight);
          
          if (limitedHeight !== resizeStart.height) {
            // 计算新的顶部位置
            newTop = resizeStart.top + (resizeStart.height - limitedHeight);
            // 确保标题栏始终可见
            newTop = Math.max(menuBarHeight, newTop);
            newHeight = limitedHeight;
          }
        }

        if (isMobile) {
          // Keep window full width on mobile
          newWidth = window.innerWidth;
          newLeft = 0;
        }

        setWindowSize({ width: newWidth, height: newHeight });
        setWindowPosition({ x: newLeft, y: Math.max(menuBarHeight, newTop) });

        // Start playing resize sound when actual movement starts
        if (
          !resizeAudioRef.current &&
          (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2)
        ) {
          playResizeResizing();
          resizeAudioRef.current = setInterval(playResizeResizing, 300);
        }
      }
    };

    const handleEnd = () => {
      if (isDragging) {
        setIsDragging(false);
        
        // Apply snap if indicator is showing
        if (showSnapIndicator) {
          applySnap();
        } else {
          // Just update the state normally
          updateWindowState(appId as any, windowPosition, windowSize);
        }
        
        // Reset snap indicator
        setShowSnapIndicator(false);
        
        // Stop move sound loop and play stop sound
        if (moveAudioRef.current) {
          clearInterval(moveAudioRef.current);
          moveAudioRef.current = null;
          playMoveStop();
        }
      }
      
      if (resizeType) {
        setResizeType("");
        updateWindowState(appId as any, windowPosition, windowSize);
        // Stop resize sound loop and play stop sound
        if (resizeAudioRef.current) {
          clearInterval(resizeAudioRef.current);
          resizeAudioRef.current = null;
          playResizeStop();
        }
      }
    };

    if (isDragging || resizeType) {
      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleEnd);
      document.addEventListener("touchmove", handleMove);
      document.addEventListener("touchend", handleEnd);
    }

    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleEnd);
      document.removeEventListener("touchmove", handleMove);
      document.removeEventListener("touchend", handleEnd);
      // Clean up any ongoing sound loops
      if (moveAudioRef.current) {
        clearInterval(moveAudioRef.current);
      }
      if (resizeAudioRef.current) {
        clearInterval(resizeAudioRef.current);
      }
    };
  }, [
    isDragging,
    dragOffset,
    dragStartPosition,
    resizeType,
    resizeStart,
    windowPosition,
    windowSize,
    appId,
    isMobile,
    playMoveStop,
    playResizeStop,
    config,
    getSafeAreaBottomInset,
    updateWindowState,
    snapZone,
    showSnapIndicator,
    applySnap,
    isSnapping,
    restoreFromSnap,
    isSnapAnimating,
    playWindowCollapse
  ]);

  return {
    windowPosition,
    windowSize,
    isDragging,
    resizeType,
    handleMouseDown,
    handleResizeStart,
    setWindowSize,
    setWindowPosition,
    maximizeWindowHeight,
    getSafeAreaBottomInset,
    // New snap zone related properties
    snapZone,
    showSnapIndicator,
    isSnapping,
    isSnapAnimating,
    restoreFromSnap,
  };
};
