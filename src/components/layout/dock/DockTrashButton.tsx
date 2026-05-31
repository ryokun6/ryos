import type { TFunction } from "i18next";
import { motion, type MotionValue } from "framer-motion";
import type { LaunchOriginRect } from "@/stores/useAppStore";
import { DockIconButton } from "./DockIconButton";

export interface DockTrashButtonProps {
  dockContainerRef: React.RefObject<HTMLDivElement | null>;
  setTrashContextMenuPos: React.Dispatch<
    React.SetStateAction<{ x: number; y: number } | null>
  >;
  focusFinderAtPathOrLaunch: (
    targetPath: string,
    initialData?: unknown,
    launchOrigin?: LaunchOriginRect,
  ) => void;
  trashIcon: string;
  handleTrashDragOver: React.DragEventHandler;
  handleTrashDrop: React.DragEventHandler;
  handleTrashDragLeave: React.DragEventHandler;
  isDraggingOverTrash: boolean;
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

export function DockTrashButton({
  dockContainerRef,
  setTrashContextMenuPos,
  focusFinderAtPathOrLaunch,
  trashIcon,
  handleTrashDragOver,
  handleTrashDrop,
  handleTrashDragLeave,
  isDraggingOverTrash,
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
}: DockTrashButtonProps) {
  const handleTrashContextMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const containerRect = dockContainerRef.current?.getBoundingClientRect();
    if (!containerRect) {
      setTrashContextMenuPos({ x: e.clientX, y: e.clientY });
      return;
    }

    setTrashContextMenuPos({
      x: e.clientX - containerRect.left,
      y: e.clientY - containerRect.top,
    });
  };

  return (
    <motion.div
      animate={{
        scale: isDraggingOverTrash ? 1.2 : 1,
        opacity: isDraggingOverTrash ? 0.7 : 1,
      }}
      transition={{ duration: 0.2 }}
    >
      <DockIconButton
        key="__trash__"
        label={t("common.dock.trash")}
        icon={trashIcon}
        idKey="__trash__"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const launchOrigin: LaunchOriginRect = {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          };
          focusFinderAtPathOrLaunch("/Trash", undefined, launchOrigin);
        }}
        onDragOver={handleTrashDragOver}
        onDrop={handleTrashDrop}
        onDragLeave={handleTrashDragLeave}
        onContextMenu={handleTrashContextMenu}
        mouseX={mouseX}
        magnifyEnabled={effectiveMagnifyEnabled}
        isNew={hasMounted && !seenIdsRef.current.has("__trash__")}
        isHovered={hoveredId === "__trash__"}
        isSwapping={isSwapping}
        onHover={() => handleIconHover("__trash__")}
        onLeave={handleIconLeave}
        baseSize={scaledButtonSize}
        intentPrefetchAppId="finder"
      />
    </motion.div>
  );
}
