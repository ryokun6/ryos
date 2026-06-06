import React from "react";
import { motion } from "motion/react";
import type { DockDividerProps } from "./dockTypes";

export function DockDivider({
  ref,
  idKey,
  onDragOver,
  onDrop,
  onDragLeave,
  isDropTarget,
  height = 48,
  resizable,
  onResizeStart,
  onContextMenu,
  onTouchStart,
  onTouchEnd,
  onTouchMove,
  onTouchCancel,
}: DockDividerProps & {
  ref?: React.Ref<HTMLDivElement>;
}) {
  const baseWidth = 1;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    onContextMenu?.(e);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    onTouchStart?.(e);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    onTouchEnd?.(e);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    onTouchMove?.(e);
  };

  const handleTouchCancel = (e: React.TouchEvent) => {
    e.stopPropagation();
    onTouchCancel?.(e);
  };

  return (
    <motion.div
      ref={ref}
      layout
      layoutId={`dock-divider-${idKey}`}
      initial={{ opacity: 0, scaleY: 0.8 }}
      animate={{
        opacity: 0.9,
        scaleY: 1,
      }}
      exit={{ opacity: 0, scaleY: 0.8 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      onDragOver={onDragOver as React.DragEventHandler<HTMLDivElement>}
      onDrop={onDrop as React.DragEventHandler<HTMLDivElement>}
      onDragLeave={onDragLeave as React.DragEventHandler<HTMLDivElement>}
      onMouseDown={resizable ? onResizeStart : undefined}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onTouchCancel={handleTouchCancel}
      style={{
        height,
        padding: "0 10px",
        alignSelf: "center",
        cursor: resizable ? "ns-resize" : undefined,
        position: "relative",
        zIndex: 5,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: isDropTarget ? 4 : baseWidth,
          height: "100%",
          backgroundColor: isDropTarget
            ? "rgba(255, 255, 255, 0.5)"
            : "rgba(0, 0, 0, 0.2)",
          borderRadius: 2,
          transition: "width 0.15s ease, background-color 0.15s ease",
        }}
      />
    </motion.div>
  );
}
