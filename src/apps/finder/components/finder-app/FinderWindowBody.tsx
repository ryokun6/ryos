import type { RefObject, DragEvent, MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { FinderMacToolbar, type FinderMacToolbarProps } from "./FinderMacToolbar";
import { FinderLegacyToolbar, type FinderLegacyToolbarProps } from "./FinderLegacyToolbar";
import { FinderMacContentArea, type FinderMacContentAreaProps } from "./FinderMacContentArea";
import {
  FinderLegacyContentArea,
  type FinderLegacyContentAreaProps,
} from "./FinderLegacyContentArea";

export interface FinderWindowBodyProps {
  containerRef: RefObject<HTMLDivElement | null>;
  isMacOSXTheme: boolean;
  isDraggingOver: boolean;
  currentPath: string;
  handleDragOver: (e: DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  handleDragEnd: (e: DragEvent<HTMLDivElement>) => void;
  handleMouseLeave: (e: MouseEvent<HTMLDivElement>) => void;
  handleFileDrop: (e: DragEvent<HTMLDivElement>) => void;
  handleBlankContextMenu: (e: MouseEvent<HTMLDivElement>) => void;
  blankLongPressHandlers: Record<string, unknown>;
  macToolbarProps: FinderMacToolbarProps;
  legacyToolbarProps: FinderLegacyToolbarProps;
  macContentProps: FinderMacContentAreaProps;
  legacyContentProps: FinderLegacyContentAreaProps;
}

export function FinderWindowBody({
  containerRef,
  isMacOSXTheme,
  isDraggingOver,
  currentPath,
  handleDragOver,
  handleDragLeave,
  handleDragEnd,
  handleMouseLeave,
  handleFileDrop,
  handleBlankContextMenu,
  blankLongPressHandlers,
  macToolbarProps,
  legacyToolbarProps,
  macContentProps,
  legacyContentProps,
}: FinderWindowBodyProps) {
  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col size-full relative",
        isDraggingOver && currentPath === "/Documents"
          ? "after:absolute after:inset-0 after:bg-black/20"
          : "",
        isMacOSXTheme ? "bg-transparent" : ""
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDragEnd={handleDragEnd}
      onMouseLeave={handleMouseLeave}
      onDrop={handleFileDrop}
      onContextMenu={handleBlankContextMenu}
      {...blankLongPressHandlers}
    >
      {isMacOSXTheme ? (
        <FinderMacToolbar {...macToolbarProps} />
      ) : (
        <FinderLegacyToolbar {...legacyToolbarProps} />
      )}

      {isMacOSXTheme ? (
        <FinderMacContentArea {...macContentProps} />
      ) : (
        <FinderLegacyContentArea {...legacyContentProps} />
      )}
    </div>
  );
}
