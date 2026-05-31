import { useCallback, useEffect, useRef, useState } from "react";
import { useSound, Sounds } from "@/hooks/useSound";
import { useVibration } from "@/hooks/useVibration";
import type { MutableRefObject } from "react";

type WindowSize = { width: number; height: number };
type WindowPosition = { x: number; y: number };

type MergedConstraints = {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number | string;
  maxHeight?: number | string;
  defaultSize: { width: number; height: number };
};

type MaximizeParams = {
  mergedConstraints: MergedConstraints;
  windowSize: WindowSize;
  windowPosition: WindowPosition;
  instanceId?: string;
  isClosingRef: MutableRefObject<boolean>;
  computeWindowInsets: () => { topInset: number; bottomInset: number };
  setWindowSize: (size: WindowSize) => void;
  setWindowPosition: (position: WindowPosition) => void;
  updateInstanceWindowState: (
    instanceId: string,
    position: WindowPosition,
    size: WindowSize
  ) => void;
};

export function useWindowFrameMaximize({
  mergedConstraints,
  windowSize,
  windowPosition,
  instanceId,
  isClosingRef,
  computeWindowInsets,
  setWindowSize,
  setWindowPosition,
  updateInstanceWindowState,
}: MaximizeParams) {
  const [isFullHeight, setIsFullHeight] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const previousSizeRef = useRef({ width: 0, height: 0 });
  const lastToggleTimeRef = useRef<number>(0);
  const lastTapTimeRef = useRef<number>(0);
  const doubleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingTapRef = useRef(false);

  const { play: playWindowExpand } = useSound(Sounds.WINDOW_EXPAND);
  const { play: playWindowCollapse } = useSound(Sounds.WINDOW_COLLAPSE);
  const vibrateMaximize = useVibration(50, 100);

  useEffect(() => {
    const { topInset, bottomInset } = computeWindowInsets();
    const maxPossibleHeight = window.innerHeight - topInset - bottomInset;
    setIsFullHeight(Math.abs(windowSize.height - maxPossibleHeight) < 5);
  }, [windowSize.height, computeWindowInsets]);

  useEffect(() => {
    return () => {
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
    };
  }, []);

  const handleHeightOnlyMaximize = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (isClosingRef.current) return;
      vibrateMaximize();
      e.stopPropagation();

      if (isMaximized) return;

      if (isFullHeight) {
        playWindowCollapse();
        setIsFullHeight(false);
        const newSize = {
          ...windowSize,
          height: mergedConstraints.defaultSize.height,
        };
        setWindowSize(newSize);
        if (instanceId) {
          updateInstanceWindowState(instanceId, windowPosition, newSize);
        }
      } else {
        playWindowExpand();
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
        if (instanceId) {
          updateInstanceWindowState(instanceId, newPosition, newSize);
        }
      }
    },
    [
      computeWindowInsets,
      instanceId,
      isClosingRef,
      isFullHeight,
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

  const handleFullMaximize = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (isClosingRef.current) return;
      vibrateMaximize();
      e.stopPropagation();

      const now = Date.now();
      if (now - lastToggleTimeRef.current < 300) {
        return;
      }
      lastToggleTimeRef.current = now;

      const newMaximizedState = !isMaximized;
      setIsMaximized(newMaximizedState);

      if (!newMaximizedState) {
        playWindowCollapse();
        const defaultSize = mergedConstraints.defaultSize;
        const newPosition = {
          x: Math.max(0, (window.innerWidth - defaultSize.width) / 2),
          y: Math.max(30, (window.innerHeight - defaultSize.height) / 2),
        };

        setWindowSize({
          width: defaultSize.width,
          height: defaultSize.height,
        });

        if (window.innerWidth >= 768) {
          setWindowPosition(newPosition);
        }

        if (instanceId) {
          updateInstanceWindowState(
            instanceId,
            window.innerWidth >= 768 ? newPosition : windowPosition,
            defaultSize
          );
        }
      } else {
        playWindowExpand();
        previousSizeRef.current = {
          width: windowSize.width,
          height: windowSize.height,
        };

        const { topInset, bottomInset } = computeWindowInsets();
        const maxPossibleHeight = window.innerHeight - topInset - bottomInset;
        const maxHeight = mergedConstraints.maxHeight
          ? typeof mergedConstraints.maxHeight === "string"
            ? parseInt(mergedConstraints.maxHeight)
            : mergedConstraints.maxHeight
          : maxPossibleHeight;
        const newHeight = Math.min(maxPossibleHeight, maxHeight);

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
        setWindowPosition(newPosition);

        if (instanceId) {
          updateInstanceWindowState(instanceId, newPosition, newSize);
        }
      }
    },
    [
      computeWindowInsets,
      instanceId,
      isClosingRef,
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

  const handleTitleBarTap = useCallback(
    (e: React.TouchEvent) => {
      if (isClosingRef.current) return;
      e.preventDefault();

      const now = Date.now();

      if (isProcessingTapRef.current || now - lastToggleTimeRef.current < 300) {
        return;
      }

      const timeSinceLastTap = now - lastTapTimeRef.current;

      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
        doubleTapTimeoutRef.current = null;
      }

      if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
        e.stopPropagation();
        isProcessingTapRef.current = true;
        handleFullMaximize(e);
        lastTapTimeRef.current = 0;

        setTimeout(() => {
          isProcessingTapRef.current = false;
        }, 300);
      } else {
        doubleTapTimeoutRef.current = setTimeout(() => {
          lastTapTimeRef.current = 0;
        }, 300);

        lastTapTimeRef.current = now;
      }
    },
    [handleFullMaximize, isClosingRef]
  );

  return {
    handleHeightOnlyMaximize,
    handleFullMaximize,
    handleTitleBarTap,
  };
}
