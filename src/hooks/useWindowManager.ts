import { useState, useEffect, useCallback, useRef } from "react";
import {
  WindowPosition,
  WindowSize,
  ResizeType,
  ResizeStart,
} from "../types/types";
import { appIds, AppId } from "@/config/appIds";
import { useAppStore } from "@/stores/useAppStore";
import { useSound, Sounds } from "./useSound";
import { getWindowConfig } from "@/config/appRegistry";
import { useWindowInsets } from "./useWindowInsets";

interface UseWindowManagerProps {
  appId: AppId;
  instanceId?: string;
}

export const useWindowManager = ({
  appId,
  instanceId,
}: UseWindowManagerProps) => {
  // Fetch the persisted window state from the global app store
  const appStateFromStore = useAppStore((state) => state.apps[appId]);
  const instanceStateFromStore = useAppStore((state) =>
    instanceId ? state.instances[instanceId] : null
  );
  const config = getWindowConfig(appId);

  // Use shared window insets hook for theme-dependent constraints
  const { computeInsets, getSafeAreaBottomInset } = useWindowInsets();

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

  // Use instance state if available, otherwise fall back to app state
  const stateSource = instanceStateFromStore || appStateFromStore;

  const initialState = {
    position: stateSource?.position ?? computeDefaultWindowState().position,
    size: stateSource?.size ?? computeDefaultWindowState().size,
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
  const [resizeType, setResizeType] = useState<ResizeType>("");
  const [resizeStart, setResizeStart] = useState<ResizeStart>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    left: 0,
    top: 0,
  });
  
  // Snap to edge state
  const [snapZone, setSnapZone] = useState<"left" | "right" | null>(null);
  // Store pre-snap size/position for potential restore
  const preSnapStateRef = useRef<{ position: WindowPosition; size: WindowSize } | null>(null);

  const isMobile = window.innerWidth < 768;

  const { play: playMoveSound, stop: stopMoveMoving } = useSound(Sounds.WINDOW_MOVE_MOVING);
  const { play: playMoveStop } = useSound(Sounds.WINDOW_MOVE_STOP);
  const { play: playResizeSound, stop: stopResizeResizing } = useSound(Sounds.WINDOW_RESIZE_RESIZING);
  const { play: playResizeStop } = useSound(Sounds.WINDOW_RESIZE_STOP);

  // Track if sound is currently playing
  const isMovePlayingRef = useRef(false);
  const isResizePlayingRef = useRef(false);
  // Track the interval for playing sounds repeatedly
  const moveSoundIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const resizeSoundIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const updateWindowState = useAppStore((state) => state.updateWindowState);
  const updateInstanceWindowState = useAppStore(
    (state) => state.updateInstanceWindowState
  );

  const maximizeWindowHeight = useCallback(
    (maxHeightConstraint?: number | string) => {
      const { topInset, bottomInset } = computeInsets();
      const maxPossibleHeight = window.innerHeight - topInset - bottomInset;
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
        y: topInset,
      }));
      if (instanceId) {
        updateInstanceWindowState(instanceId, windowPosition, {
          width: windowSize.width,
          height: newHeight,
        });
      } else {
        updateWindowState(appId, windowPosition, {
          width: windowSize.width,
          height: newHeight,
        });
      }
    },
    [
      computeInsets,
      updateWindowState,
      updateInstanceWindowState,
      appId,
      instanceId,
      windowPosition,
      windowSize,
    ]
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
      setIsDragging(true);
    },
    []
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
    },
    [windowPosition]
  );

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (isDragging) {
        const clientX =
          "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
        const clientY =
          "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

        const newX = clientX - dragOffset.x;
        const newY = clientY - dragOffset.y;

        const { topInset: menuBarHeight } = computeInsets();

        // Start playing move sound when movement begins (non-looping, plays repeatedly)
        if (!isMobile && !isMovePlayingRef.current) {
          playMoveSound();
          isMovePlayingRef.current = true;
          // Play sound repeatedly while dragging (not looping the audio file)
          moveSoundIntervalRef.current = setInterval(() => {
            playMoveSound();
          }, 100); // Play every 100ms while dragging
        }

        if (isMobile) {
          // On mobile, only allow vertical dragging and keep window full width
          setWindowPosition({ x: 0, y: Math.max(menuBarHeight, newY) });
          setSnapZone(null);
        } else {
          // Allow dragging past edges, but keep at least 80px of window visible
          const minX = -(windowSize.width - 80); // Can drag left, keeping 80px visible on right
          const maxX = window.innerWidth - 80;    // Can drag right, keeping 80px visible on left
          const maxY = window.innerHeight - 80;   // Can drag down, keeping 80px visible at top
          const x = Math.min(Math.max(minX, newX), maxX);
          const y = Math.min(Math.max(menuBarHeight, newY), Math.max(0, maxY));
          setWindowPosition({ x, y });
          
          // Detect snap zones - trigger when cursor is within 20px of screen edge
          const SNAP_THRESHOLD = 20;
          if (clientX <= SNAP_THRESHOLD) {
            setSnapZone("left");
          } else if (clientX >= window.innerWidth - SNAP_THRESHOLD) {
            setSnapZone("right");
          } else {
            setSnapZone(null);
          }
        }
      }

      if (resizeType) {
        e.preventDefault();
        const clientX =
          "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
        const clientY =
          "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

        const deltaX = clientX - resizeStart.x;
        const deltaY = clientY - resizeStart.y;

        const minWidth = config.minSize?.width || 260;
        const minHeight = config.minSize?.height || 200;
        const maxWidth = window.innerWidth;
        const { bottomInset, topInset: menuBarHeight } = computeInsets();
        const maxHeight = window.innerHeight - bottomInset;

        let newWidth = resizeStart.width;
        let newHeight = resizeStart.height;
        let newLeft = resizeStart.left;
        let newTop = resizeStart.top;

        if (!isMobile) {
          if (resizeType.includes("e")) {
            const maxPossibleWidth = maxWidth - resizeStart.left;
            newWidth = Math.min(
              Math.max(resizeStart.width + deltaX, minWidth),
              maxPossibleWidth
            );
          } else if (resizeType.includes("w")) {
            const maxPossibleWidth = resizeStart.width + resizeStart.left;
            const potentialWidth = Math.min(
              Math.max(resizeStart.width - deltaX, minWidth),
              maxPossibleWidth
            );
            if (potentialWidth !== resizeStart.width) {
              newLeft = Math.max(
                0,
                resizeStart.left + (resizeStart.width - potentialWidth)
              );
              newWidth = potentialWidth;
            }
          }
        }

        if (resizeType.includes("s")) {
          const maxPossibleHeight = maxHeight - resizeStart.top;
          newHeight = Math.min(
            Math.max(resizeStart.height + deltaY, minHeight),
            maxPossibleHeight
          );
        } else if (resizeType.includes("n")) {
          const maxPossibleHeight =
            resizeStart.height + (resizeStart.top - menuBarHeight);
          const potentialHeight = Math.min(
            Math.max(resizeStart.height - deltaY, minHeight),
            maxPossibleHeight
          );
          if (potentialHeight !== resizeStart.height) {
            newTop = Math.max(
              menuBarHeight,
              Math.min(
                resizeStart.top + (resizeStart.height - potentialHeight),
                maxHeight - minHeight
              )
            );
            newHeight = potentialHeight;
          }
        }

        if (isMobile) {
          // Keep window full width on mobile
          newWidth = window.innerWidth;
          newLeft = 0;
        }

        setWindowSize({ width: newWidth, height: newHeight });
        setWindowPosition({ x: newLeft, y: Math.max(menuBarHeight, newTop) });

        // Start playing resize sound when movement begins (non-looping, plays repeatedly)
        if (!isResizePlayingRef.current && (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2)) {
          playResizeSound();
          isResizePlayingRef.current = true;
          // Play sound repeatedly while resizing (not looping the audio file)
          resizeSoundIntervalRef.current = setInterval(() => {
            playResizeSound();
          }, 100); // Play every 100ms while resizing
        }
      }
    };

    const handleEnd = () => {
      if (isDragging) {
        setIsDragging(false);
        
        // Handle snap to edge
        if (snapZone && !isMobile) {
          const { topInset, bottomInset } = computeInsets();
          const snapHeight = window.innerHeight - topInset - bottomInset;
          const snapWidth = Math.floor(window.innerWidth / 2);
          
          // Save current state before snapping (for potential restore later)
          preSnapStateRef.current = {
            position: { ...windowPosition },
            size: { ...windowSize },
          };
          
          const newSize = { width: snapWidth, height: snapHeight };
          const newPosition = {
            x: snapZone === "left" ? 0 : snapWidth,
            y: topInset,
          };
          
          setWindowSize(newSize);
          setWindowPosition(newPosition);
          
          if (instanceId) {
            updateInstanceWindowState(instanceId, newPosition, newSize);
          } else {
            updateWindowState(appId, newPosition, newSize);
          }
          
          setSnapZone(null);
        } else {
          if (instanceId) {
            updateInstanceWindowState(instanceId, windowPosition, windowSize);
          } else {
            updateWindowState(appId, windowPosition, windowSize);
          }
        }
        
        // Stop move sound immediately and play stop sound
        if (isMovePlayingRef.current) {
          // Clear the interval that was playing the sound repeatedly
          if (moveSoundIntervalRef.current) {
            clearInterval(moveSoundIntervalRef.current);
            moveSoundIntervalRef.current = null;
          }
          stopMoveMoving();
          isMovePlayingRef.current = false;
          playMoveStop();
        }
      }
      if (resizeType) {
        setResizeType("");
        if (instanceId) {
          updateInstanceWindowState(instanceId, windowPosition, windowSize);
        } else {
          updateWindowState(appId, windowPosition, windowSize);
        }
        // Stop resize sound immediately and play stop sound
        if (isResizePlayingRef.current) {
          // Clear the interval that was playing the sound repeatedly
          if (resizeSoundIntervalRef.current) {
            clearInterval(resizeSoundIntervalRef.current);
            resizeSoundIntervalRef.current = null;
          }
          stopResizeResizing();
          isResizePlayingRef.current = false;
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
      // Clean up intervals if they exist
      if (moveSoundIntervalRef.current) {
        clearInterval(moveSoundIntervalRef.current);
        moveSoundIntervalRef.current = null;
      }
      if (resizeSoundIntervalRef.current) {
        clearInterval(resizeSoundIntervalRef.current);
        resizeSoundIntervalRef.current = null;
      }
    };
  }, [
    isDragging,
    dragOffset,
    resizeType,
    resizeStart,
    windowPosition,
    windowSize,
    appId,
    isMobile,
    playMoveSound,
    playMoveStop,
    stopMoveMoving,
    playResizeSound,
    playResizeStop,
    stopResizeResizing,
    config,
    updateWindowState,
    updateInstanceWindowState,
    instanceId,
    computeInsets,
    snapZone,
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
    snapZone,
    computeInsets,
  };
};
