import { memo, useRef } from "react";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import {
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { useSound, Sounds } from "@/hooks/useSound";
import { useLongPress } from "@/hooks/useLongPress";
import { isTouchDevice } from "@/utils/device";
import type { LaunchOriginRect } from "@/stores/useAppStore";
import { hasToggleModifier } from "@/utils/selection";
import type { ListRowItemProps } from "./types";

export const ListRowItem = memo(function ListRowItem({
  file,
  selectedFiles,
  dropTargetPath,
  onItemContextMenu,
  onFileOpen,
  onFileSelect,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  getIconPath,
  getDisplayName,
  getFileType,
  getListIconAlt,
  shouldShowThumbnail,
  isImageFile,
}: ListRowItemProps) {
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);
  const lastClickSoundRef = useRef(0);
  const CLICK_SOUND_COOLDOWN_MS = 400;

  const longPressHandlers = useLongPress((touchEvent) => {
    if (onItemContextMenu) {
      const touch = touchEvent.touches[0];
      onItemContextMenu(file, {
        preventDefault: () => {},
        stopPropagation: () => {},
        clientX: touch.clientX,
        clientY: touch.clientY,
      } as unknown as React.MouseEvent);
    }
  });

  const handleClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    const now = Date.now();
    if (now - lastClickSoundRef.current >= CLICK_SOUND_COOLDOWN_MS) {
      lastClickSoundRef.current = now;
      playClick();
    }
    if (isTouchDevice()) {
      const rect = e.currentTarget.getBoundingClientRect();
      const launchOrigin: LaunchOriginRect = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      };
      onFileOpen(file, launchOrigin);
    } else {
      onFileSelect(file, e);
    }
  };

  const isSelected = selectedFiles.includes(file.path);

  const handleDoubleClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    const now = Date.now();
    if (now - lastClickSoundRef.current >= CLICK_SOUND_COOLDOWN_MS) {
      lastClickSoundRef.current = now;
      playClick();
    }
    if (!isTouchDevice()) {
      const rect = e.currentTarget.getBoundingClientRect();
      const launchOrigin: LaunchOriginRect = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      };
      onFileOpen(file, launchOrigin);
    }
  };

  return (
    <TableRow
      className={`border-none cursor-default ${
        isSelected || dropTargetPath === file.path
          ? ""
          : "odd:bg-black/5 hover:bg-black/5 transition-colors"
      }`}
      data-selected={isSelected || dropTargetPath === file.path ? "true" : undefined}
      onClick={handleClick}
      onMouseDown={(e) => {
        if (
          e.button === 0 &&
          !file.isDirectory &&
          (!isSelected || e.shiftKey || hasToggleModifier(e))
        ) {
          onFileSelect(file, e, { allowRename: false });
        }
      }}
      onContextMenu={(e: React.MouseEvent) => {
        if (onItemContextMenu) {
          onItemContextMenu(file, e);
        }
      }}
      onDoubleClick={handleDoubleClick}
      draggable={!file.isDirectory}
      onDragStart={(e) => onDragStart(e, file)}
      onDragOver={(e) => onDragOver(e, file)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, file)}
      onDragEnd={onDragEnd}
      data-file-item="true"
      data-file-path={file.path}
      {...(isTouchDevice() ? longPressHandlers : {})}
    >
      <TableCell className="flex items-center gap-2">
        {file.icon &&
        !(file.icon.startsWith("/") || file.icon.startsWith("http")) ? (
          <span
            className="inline-flex items-center justify-center leading-none"
            style={{ fontSize: 14, lineHeight: 1, width: 16, height: 16 }}
            aria-hidden
          >
            {file.icon}
          </span>
        ) : file.contentUrl && shouldShowThumbnail(file) ? (
          <img
            src={file.contentUrl}
            alt={file.name}
            className="size-4 object-cover rounded-sm"
            style={{ imageRendering: isImageFile(file) ? "pixelated" : "auto" }}
            onError={(e) => {
              console.error(`Error loading thumbnail for ${file.name}`);
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <ThemedIcon
            name={getIconPath(file)}
            alt={getListIconAlt(file)}
            className="size-4"
            style={{ imageRendering: "pixelated" }}
            data-legacy-aware="true"
          />
        )}
        {getDisplayName(file)}
      </TableCell>
      <TableCell>{getFileType(file)}</TableCell>
      <TableCell className="whitespace-nowrap">
        {file.size
          ? file.size < 1024
            ? `${file.size} B`
            : file.size < 1024 * 1024
            ? `${(file.size / 1024).toFixed(1)} KB`
            : `${(file.size / (1024 * 1024)).toFixed(1)} MB`
          : "--"}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {file.modifiedAt
          ? new Date(file.modifiedAt).toLocaleDateString()
          : "--"}
      </TableCell>
    </TableRow>
  );
});
