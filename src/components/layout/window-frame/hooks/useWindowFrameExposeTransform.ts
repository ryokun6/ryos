import { useMemo } from "react";
import { calculateExposeGrid, getExposeTransform } from "../../exposeUtils";
import { useAppStore } from "@/stores/useAppStore";

type ExposeParams = {
  exposeMode: boolean;
  instanceId?: string;
  openInstanceCount: number;
  windowPosition: { x: number; y: number };
  windowSize: { width: number; height: number };
  isMobile: boolean;
};

export function useWindowFrameExposeTransform({
  exposeMode,
  instanceId,
  openInstanceCount,
  windowPosition,
  windowSize,
  isMobile,
}: ExposeParams) {
  return useMemo(() => {
    if (!exposeMode || !instanceId) return null;

    const allInstances = useAppStore.getState().instances;
    const openInstances = Object.values(allInstances).filter(
      (inst) => inst.isOpen && !inst.isMinimized
    );
    const myIndex = openInstances.findIndex(
      (inst) => inst.instanceId === instanceId
    );

    if (myIndex === -1 || openInstances.length === 0) return null;

    const grid = calculateExposeGrid(
      openInstances.length,
      window.innerWidth,
      window.innerHeight,
      60,
      24,
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
  }, [
    exposeMode,
    instanceId,
    openInstanceCount,
    windowPosition,
    windowSize,
    isMobile,
  ]);
}
