import { useState, useCallback, useRef, useEffect } from "react";
import {
  WindowPosition,
  WindowSize,
  ResizeType,
  ResizeStart,
} from "../types/types";
import { appIds, AppId } from "@/config/appIds";
import { useAppStore } from "@/stores/useAppStore";
import { useSound, Sounds } from "./useSound";
import { getWindowConfig, getMobileWindowSize } from "@/config/appRegistry";
import { useWindowInsets } from "./useWindowInsets";
import { useEventListener } from "@/hooks/useEventListener";

interface UseWindowManagerProps {
  appId: AppId;
  instanceId?: string;
}

export const useWindowManager = ({
  appId,
  instanceId,
}: UseWindowManagerProps) => {
  // Fetch the persisted window state from the global app store
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
        ? getMobileWindowSize(appId)
        : config.defaultSize,
    };
  };

  // Use instance state if available, otherwise fall back to app state
  const stateSource = instanceStateFromStore;

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
  const latestWindowPositionRef = useRef(windowPosition);
  const latestWindowSizeRef = useRef(windowSize);
  const pendingWindowPositionRef = useRef<WindowPosition | null>(null);
  const pendingWindowSizeRef = useRef<WindowSize | null>(null);
  const moveRafRef = useRef<number | null>(null);

  const isMobile = window.innerWidth < 768;

  const flushPendingWindowFrame = useCallback(() => {
    if (moveRafRef.current !== null) {
      cancelAnimationFrame(moveRafRef.current);
      moveRafRef.current = null;
    }

    if (pendingWindowPositionRef.current) {
      setWindowPosition(pendingWindowPositionRef.current);
      pendingWindowPositionRef.current = null;
    }

    if (pendingWindowSizeRef.current) {
      setWindowSize(pendingWindowSizeRef.current);
      pendingWindowSizeRef.current = null;
    }
  }, []);

  const scheduleWindowFrame = useCallback(() => {
    if (moveRafRef.current !== null) return;
    moveRafRef.current = requestAnimationFrame(() => {
      moveRafRef.current = null;

      if (pendingWindowPositionRef.current) {
        setWindowPosition(pendingWindowPositionRef.current);
        pendingWindowPositionRef.current = null;
      }

      if (pendingWindowSizeRef.current) {
        setWindowSize(pendingWindowSizeRef.current);
        pendingWindowSizeRef.current = null;
      }
    });
  }, []);

  const queueWindowPosition = useCallback(
    (nextPosition: WindowPosition) => {
      latestWindowPositionRef.current = nextPosition;
      pendingWindowPositionRef.current = nextPosition;
      scheduleWindowFrame();
    },
    [scheduleWindowFrame]
  );

  const queueWindowSize = useCallback(
    (nextSize: WindowSize) => {
      latestWindowSizeRef.current = nextSize;
      pendingWindowSizeRef.current = nextSize;
      scheduleWindowFrame();
    },
    [scheduleWindowFrame]
  );

  // Sync local state with store when store changes (for programmatic updates)
  useEffect(() => {
    const storeSize = instanceStateFromStore?.size;
    if (
      storeSize &&
      !isDragging &&
      !resizeType &&
      (storeSize.width !== windowSize.width ||
        storeSize.height !== windowSize.height)
    ) {
      setWindowSize(storeSize);
    }
  }, [instanceStateFromStore?.size, isDragging, resizeType, windowSize]);

  useEffect(() => {
    latestWindowSizeRef.current = windowSize;
  }, [windowSize]);

  useEffect(() => {
    const storePosition = instanceStateFromStore?.position;
    if (
      storePosition &&
      !isDragging &&
      !resizeType &&
      (storePosition.x !== windowPosition.x ||
        storePosition.y !== windowPosition.y)
    ) {
      setWindowPosition(storePosition);
    }
  }, [instanceStateFromStore?.position, isDragging, resizeType, windowPosition]);

  useEffect(() => {
    latestWindowPositionRef.current = windowPosition;
  }, [windowPosition]);

  useEffect(() => {
    return () => {
      if (moveRafRef.current !== null) {
        cancelAnimationFrame(moveRafRef.current);
      }
    };
  }, []);

  const { play: playMoveSound, stop: stopMoveMoving } = useSound(Sounds.WINDOW_MOVE_MOVING);
  const { play: playMoveStop } = useSound(Sounds.WINDOW_MOVE_STOP);
  const { play: playResizeSound, stop: stopResizeResizing } = useSound(Sounds.WINDOW_RESIZE_RESIZING);
  const { play: playResizeStop } = useSound(Sounds.WINDOW_RESIZE_STOP);

  // Track if sound is currently playing
  const isMovePlayingRef = useRef(false);
  const isResizePlayingRef = useRef(false);

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
      const nextSize = {
        width: windowSize.width,
        height: newHeight,
      };
      const nextPosition = {
        x: windowPosition.x,
        y: topInset,
      };

      latestWindowSizeRef.current = nextSize;
      latestWindowPositionRef.current = nextPosition;
      setWindowSize(nextSize);
      setWindowPosition(nextPosition);
      if (instanceId) {
        updateInstanceWindowState(instanceId, nextPosition, nextSize);
      }
    },
    [
      computeInsets,
      updateInstanceWindowState,
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

  const handleMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (isDragging) {
        const clientX =
          "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
        const clientY =
          "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

        const newX = clientX - dragOffset.x;
        const newY = clientY - dragOffset.y;

        const { topInset: menuBarHeight } = computeInsets();

        // Play move sound once when movement begins
        if (!isMobile && !isMovePlayingRef.current) {
          playMoveSound();
          isMovePlayingRef.current = true;
        }

        if (isMobile) {
          // On mobile, only allow vertical dragging and keep window full width
          queueWindowPosition({ x: 0, y: Math.max(menuBarHeight, newY) });
          setSnapZone(null);
        } else {
          // Allow dragging past edges, but keep at least 80px of window visible
          const minX = -(windowSize.width - 80); // Can drag left, keeping 80px visible on right
          const maxX = window.innerWidth - 80; // Can drag right, keeping 80px visible on left
          const maxY = window.innerHeight - 80; // Can drag down, keeping 80px visible at top
          const x = Math.min(Math.max(minX, newX), maxX);
          const y = Math.min(Math.max(menuBarHeight, newY), Math.max(0, maxY));
          queueWindowPosition({ x, y });

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

        queueWindowSize({ width: newWidth, height: newHeight });
        queueWindowPosition({ x: newLeft, y: Math.max(menuBarHeight, newTop) });

        // Play resize sound once when movement begins
        if (
          !isResizePlayingRef.current &&
          (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2)
        ) {
          playResizeSound();
          isResizePlayingRef.current = true;
        }
      }
    },
    [
      isDragging,
      dragOffset,
      resizeType,
      resizeStart,
      windowSize,
      isMobile,
      playMoveSound,
      playResizeSound,
      config,
      computeInsets,
      queueWindowPosition,
      queueWindowSize,
      setSnapZone,
    ]
  );

  const handleEnd = useCallback(() => {
    flushPendingWindowFrame();
    const currentPosition = latestWindowPositionRef.current;
    const currentSize = latestWindowSizeRef.current;

    if (isDragging) {
      setIsDragging(false);

      // Handle snap to edge
      if (snapZone && !isMobile) {
        const { topInset, bottomInset } = computeInsets();
        const snapHeight = window.innerHeight - topInset - bottomInset;
        const snapWidth = Math.floor(window.innerWidth / 2);

        // Save current state before snapping (for potential restore later)
        preSnapStateRef.current = {
          position: { ...currentPosition },
          size: { ...currentSize },
        };

        const newSize = { width: snapWidth, height: snapHeight };
        const newPosition = {
          x: snapZone === "left" ? 0 : snapWidth,
          y: topInset,
        };

        latestWindowSizeRef.current = newSize;
        latestWindowPositionRef.current = newPosition;
        setWindowSize(newSize);
        setWindowPosition(newPosition);

        if (instanceId) {
          updateInstanceWindowState(instanceId, newPosition, newSize);
        }

        setSnapZone(null);
      } else {
        if (instanceId) {
          updateInstanceWindowState(instanceId, currentPosition, currentSize);
        }
      }

      // Stop move sound and play stop sound
      if (isMovePlayingRef.current) {
        stopMoveMoving();
        isMovePlayingRef.current = false;
        playMoveStop();
      }
    }
    if (resizeType) {
      setResizeType("");
      if (instanceId) {
        updateInstanceWindowState(instanceId, currentPosition, currentSize);
      }
      // Stop resize sound and play stop sound
      if (isResizePlayingRef.current) {
        stopResizeResizing();
        isResizePlayingRef.current = false;
        playResizeStop();
      }
    }
  }, [
    flushPendingWindowFrame,
    isDragging,
    snapZone,
    isMobile,
    computeInsets,
    instanceId,
    updateInstanceWindowState,
    stopMoveMoving,
    playMoveStop,
    resizeType,
    stopResizeResizing,
    playResizeStop,
  ]);

  const shouldListen = isDragging || resizeType;
  const eventTarget = shouldListen ? document : null;

  const handleMouseMove = useCallback(
    (event: MouseEvent) => handleMove(event),
    [handleMove]
  );
  const handleTouchMove = useCallback(
    (event: TouchEvent) => handleMove(event),
    [handleMove]
  );
  const handleMouseUp = useCallback(() => handleEnd(), [handleEnd]);
  const handleTouchEnd = useCallback(() => handleEnd(), [handleEnd]);

  useEventListener("mousemove", handleMouseMove, eventTarget);
  useEventListener("mouseup", handleMouseUp, eventTarget);
  useEventListener("touchmove", handleTouchMove, eventTarget);
  useEventListener("touchend", handleTouchEnd, eventTarget);

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
