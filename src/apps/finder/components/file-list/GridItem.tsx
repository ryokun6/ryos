import { memo } from "react";
import { FileIcon } from "../FileIcon";
import { usePointerLongPress } from "@/hooks/usePointerLongPress";
import type { LaunchOriginRect } from "@/stores/useAppStore";
import { hasToggleModifier } from "@/utils/selection";
import type { GridItemProps } from "./types";

export const GridItem = memo(function GridItem({
  file,
  selectedFiles,
  dropTargetPath,
  viewType,
  onItemContextMenu,
  onFileOpen,
  onFileSelect,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  getDisplayName,
  shouldShowThumbnail,
  isImageFile,
}: GridItemProps) {
  const isSelected = selectedFiles.includes(file.path);

  const longPressHandlers = usePointerLongPress((event) => {
    if (onItemContextMenu) {
      onItemContextMenu(file, {
        preventDefault: () => {},
        stopPropagation: () => {},
        clientX: event.clientX,
        clientY: event.clientY,
      } as unknown as React.MouseEvent);
    }
  });

  return (
    <div
      onMouseDown={(e) => {
        longPressHandlers.onMouseDown(e);
        if (
          e.button === 0 &&
          !file.isDirectory &&
          (!isSelected || e.shiftKey || hasToggleModifier(e))
        ) {
          onFileSelect(file, e, { allowRename: false });
        }
      }}
      draggable={!file.isDirectory}
      onDragStart={(e) => onDragStart(e, file)}
      onDragOver={(e) => onDragOver(e, file)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, file)}
      onDragEnd={onDragEnd}
      onMouseMove={longPressHandlers.onMouseMove}
      onMouseUp={longPressHandlers.onMouseUp}
      onMouseLeave={longPressHandlers.onMouseLeave}
      onTouchStart={longPressHandlers.onTouchStart}
      onTouchMove={longPressHandlers.onTouchMove}
      onTouchEnd={longPressHandlers.onTouchEnd}
      onTouchCancel={longPressHandlers.onTouchCancel}
      className="transition-all duration-75"
      style={{
        // Skip layout/paint for icons scrolled out of view in large folders.
        contentVisibility: "auto",
        containIntrinsicSize: "auto 80px",
      }}
      onContextMenu={(e: React.MouseEvent) => {
        if (onItemContextMenu) {
          onItemContextMenu(file, e);
        }
      }}
      data-file-item="true"
      data-file-path={file.path}
    >
      <FileIcon
        name={getDisplayName(file)}
        isDirectory={file.isDirectory}
        icon={file.icon}
        content={isImageFile(file) ? file.content : undefined}
        contentUrl={shouldShowThumbnail(file) ? file.contentUrl : undefined}
        onDoubleClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const launchOrigin: LaunchOriginRect = {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          };
          onFileOpen(file, launchOrigin);
        }}
        onClick={(e) => onFileSelect(file, e)}
        isSelected={isSelected}
        isDropTarget={dropTargetPath === file.path}
        size={viewType === "large" ? "large" : "small"}
        context="finder"
      />
    </div>
  );
});
