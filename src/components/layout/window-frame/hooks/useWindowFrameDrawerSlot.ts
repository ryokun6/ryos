import { useMemo } from "react";
import type { WindowFrameDrawerContextValue } from "@/components/shared/WindowFrameDrawerContext";
import type { WindowInsets } from "@/hooks/useWindowInsets";
import type { ResizeType } from "@/types/types";

type DrawerSlotParams = {
  windowPosition: { x: number; y: number };
  windowSize: { width: number; height: number };
  mergedConstraints: WindowFrameDrawerContextValue["constraints"];
  isDragging: boolean;
  resizeType: ResizeType | null;
  computeWindowInsets: () => WindowInsets;
  setWindowPosition: (position: { x: number; y: number }) => void;
  setWindowSize: (size: { width: number; height: number }) => void;
  instanceId?: string;
  updateInstanceWindowState: (
    instanceId: string,
    position: { x: number; y: number },
    size: { width: number; height: number }
  ) => void;
  snapZone: "left" | "right" | null;
};

export function useWindowFrameDrawerSlot({
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
  snapZone,
}: DrawerSlotParams) {
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

  return { drawerContextValue, snapZoneStyle };
}
