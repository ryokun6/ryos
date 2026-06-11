import { useWindowManager } from "@/hooks/useWindowManager";
import type { AppId } from "@/config/appIds";
import { ResizeType } from "@/types/types";
import { useCallback } from "react";

type DragResizeParams = {
  appId: AppId;
  instanceId?: string;
  isForeground: boolean;
  isMacOSTheme: boolean;
  isXpTheme: boolean;
  bringInstanceToForeground: (instanceId: string) => void;
};

export function useWindowFrameDragResize({
  appId,
  instanceId,
  isForeground,
  isMacOSTheme,
  isXpTheme,
  bringInstanceToForeground,
}: DragResizeParams) {
  const {
    windowPosition,
    windowSize,
    windowLeftMotionValue,
    windowTopMotionValue,
    windowWidthMotionValue,
    windowHeightMotionValue,
    isDragging,
    resizeType,
    handleMouseDown,
    handleResizeStart,
    setWindowSize,
    setWindowPosition,
    snapZone,
    computeInsets: computeWindowInsets,
  } = useWindowManager({ appId, instanceId });

  const shouldAnimateWindowTransition = !isDragging && !resizeType;

  const resizerZIndexClass = isMacOSTheme
    ? "z-[60]"
    : isXpTheme
      ? "z-40"
      : "z-50";

  const bringToForegroundIfNeeded = useCallback(() => {
    if (!isForeground && instanceId) {
      bringInstanceToForeground(instanceId);
    }
  }, [isForeground, instanceId, bringInstanceToForeground]);

  const handleMouseDownWithForeground = useCallback(
    (e: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>) => {
      handleMouseDown(e);
      bringToForegroundIfNeeded();
    },
    [handleMouseDown, bringToForegroundIfNeeded]
  );

  const handleResizeStartWithForeground = useCallback(
    (e: React.MouseEvent | React.TouchEvent, type: ResizeType) => {
      handleResizeStart(e, type);
      bringToForegroundIfNeeded();
    },
    [handleResizeStart, bringToForegroundIfNeeded]
  );

  return {
    windowPosition,
    windowSize,
    windowLeftMotionValue,
    windowTopMotionValue,
    windowWidthMotionValue,
    windowHeightMotionValue,
    isDragging,
    resizeType,
    setWindowSize,
    setWindowPosition,
    snapZone,
    computeWindowInsets,
    shouldAnimateWindowTransition,
    resizerZIndexClass,
    handleMouseDownWithForeground,
    handleResizeStartWithForeground,
  };
}
