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

  const moveAudioRef = useRef<NodeJS.Timeout | null>(null);
  const resizeAudioRef = useRef<NodeJS.Timeout | null>(null);

  const updateWindowState = useAppStore((state) => state.updateWindowState);
  const updateInstanceWindowState = useAppStore(
    (state) => state.updateInstanceWindowState
  );

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
      getSafeAreaBottomInset,
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
        const menuBarHeight = 30;

        // Start playing move sound in a loop when actual movement starts
        if (!moveAudioRef.current && !isMobile) {
          playMoveMoving();
          moveAudioRef.current = setInterval(playMoveMoving, 300);
        }

        if (isMobile) {
          // On mobile, only allow vertical dragging and keep window full width
          setWindowPosition({ x: 0, y: Math.max(menuBarHeight, newY) });
        } else {
          const maxX = window.innerWidth - windowSize.width;
          const maxY = window.innerHeight - windowSize.height;
          const x = Math.min(Math.max(0, newX), maxX);
          const y = Math.min(Math.max(menuBarHeight, newY), maxY);
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
        const maxWidth = window.innerWidth;
        const safeAreaBottom = getSafeAreaBottomInset();
        const maxHeight = window.innerHeight - safeAreaBottom;
        const menuBarHeight = 30;

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
        } else if (resizeType.includes("n") && !isMobile) {
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
        if (instanceId) {
          updateInstanceWindowState(instanceId, windowPosition, windowSize);
        } else {
          updateWindowState(appId, windowPosition, windowSize);
        }
        // Stop move sound loop and play stop sound
        if (moveAudioRef.current) {
          clearInterval(moveAudioRef.current);
          moveAudioRef.current = null;
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
        moveAudioRef.current = null;
      }
      if (resizeAudioRef.current) {
        clearInterval(resizeAudioRef.current);
        resizeAudioRef.current = null;
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
    playMoveStop,
    playResizeStop,
    config,
    getSafeAreaBottomInset,
    updateWindowState,
    updateInstanceWindowState,
    instanceId,
  ]);

  // Additional cleanup effect to ensure intervals are cleared on unmount
  useEffect(() => {
    return () => {
      if (moveAudioRef.current) {
        clearInterval(moveAudioRef.current);
        moveAudioRef.current = null;
      }
      if (resizeAudioRef.current) {
        clearInterval(resizeAudioRef.current);
        resizeAudioRef.current = null;
      }
    };
  }, []);

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
  };
};
