import { useMemo } from "react";
import { useAppStore } from "@/stores/useAppStore";

type DockOffsetsParams = {
  appId: string;
  instanceId?: string;
  windowPosition: { x: number; y: number };
  windowSize: { width: number; height: number };
};

export function useWindowFrameDockOffsets({
  appId,
  instanceId,
  windowPosition,
  windowSize,
}: DockOffsetsParams) {
  const dockIconCenter = useMemo(() => {
    const dockIcon = document.querySelector(`[data-dock-icon="${appId}"]`);
    if (dockIcon) {
      const rect = dockIcon.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    const taskbarItem = instanceId
      ? document.querySelector(`[data-taskbar-item="${instanceId}"]`)
      : null;
    if (taskbarItem) {
      const rect = taskbarItem.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    return null;
  }, [appId, instanceId]);

  const dockIconOffset = useMemo(() => {
    const windowCenterX = windowPosition.x + windowSize.width / 2;
    const windowCenterY = windowPosition.y + windowSize.height / 2;

    if (dockIconCenter) {
      return {
        x: dockIconCenter.x - windowCenterX,
        y: dockIconCenter.y - windowCenterY,
      };
    }

    return { x: 0, y: window.innerHeight - windowPosition.y };
  }, [dockIconCenter, windowPosition, windowSize]);

  const launchOrigin = useAppStore((state) =>
    instanceId ? state.instances[instanceId]?.launchOrigin : undefined
  );

  const launchOriginOffset = useMemo(() => {
    if (!launchOrigin) return null;

    const windowCenterX = windowPosition.x + windowSize.width / 2;
    const windowCenterY = windowPosition.y + windowSize.height / 2;
    const iconCenterX = launchOrigin.x + launchOrigin.width / 2;
    const iconCenterY = launchOrigin.y + launchOrigin.height / 2;

    return {
      x: iconCenterX - windowCenterX,
      y: iconCenterY - windowCenterY,
    };
  }, [launchOrigin, windowPosition, windowSize]);

  return { dockIconOffset, launchOriginOffset };
}
