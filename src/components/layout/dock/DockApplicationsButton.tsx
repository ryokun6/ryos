import type { TFunction } from "i18next";
import type { MotionValue } from "framer-motion";
import type { LaunchOriginRect } from "@/stores/useAppStore";
import { DockIconButton } from "./DockIconButton";

export interface DockApplicationsButtonProps {
  dockContainerRef: React.RefObject<HTMLDivElement | null>;
  setApplicationsContextMenuPos: React.Dispatch<
    React.SetStateAction<{ x: number; y: number } | null>
  >;
  focusFinderAtPathOrLaunch: (
    targetPath: string,
    initialData?: unknown,
    launchOrigin?: LaunchOriginRect,
  ) => void;
  mouseX: MotionValue<number>;
  effectiveMagnifyEnabled: boolean;
  scaledButtonSize: number;
  hasMounted: boolean;
  seenIdsRef: React.MutableRefObject<Set<string>>;
  hoveredId: string | null;
  isSwapping: boolean;
  handleIconHover: (id: string) => void;
  handleIconLeave: () => void;
  t: TFunction;
}

export function DockApplicationsButton({
  dockContainerRef,
  setApplicationsContextMenuPos,
  focusFinderAtPathOrLaunch,
  mouseX,
  effectiveMagnifyEnabled,
  scaledButtonSize,
  hasMounted,
  seenIdsRef,
  hoveredId,
  isSwapping,
  handleIconHover,
  handleIconLeave,
  t,
}: DockApplicationsButtonProps) {
  const handleApplicationsContextMenu = (
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const containerRect = dockContainerRef.current?.getBoundingClientRect();
    if (!containerRect) {
      setApplicationsContextMenuPos({ x: e.clientX, y: e.clientY });
      return;
    }

    setApplicationsContextMenuPos({
      x: e.clientX - containerRect.left,
      y: e.clientY - containerRect.top,
    });
  };

  return (
    <DockIconButton
      key="__applications__"
      label={t("common.dock.applications")}
      icon="/icons/default/applications.png"
      idKey="__applications__"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const launchOrigin: LaunchOriginRect = {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        };
        focusFinderAtPathOrLaunch(
          "/Applications",
          {
            path: "/Applications",
            viewType: "large",
          },
          launchOrigin,
        );
      }}
      onContextMenu={handleApplicationsContextMenu}
      mouseX={mouseX}
      magnifyEnabled={effectiveMagnifyEnabled}
      isNew={hasMounted && !seenIdsRef.current.has("__applications__")}
      isHovered={hoveredId === "__applications__"}
      isSwapping={isSwapping}
      onHover={() => handleIconHover("__applications__")}
      onLeave={handleIconLeave}
      baseSize={scaledButtonSize}
      intentPrefetchAppId="finder"
    />
  );
}
