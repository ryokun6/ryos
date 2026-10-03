import React, { useContext } from "react";
import { motion } from "motion/react";
import type { DockDividerProps } from "./dockTypes";
import { DockPlacementContext } from "./DockPlacementContext";

const DIVIDER_MOTION = {
  bottom: {
    hidden: { opacity: 0, scaleY: 0.8 },
    shown: { opacity: 0.9, scaleY: 1 },
  },
  side: {
    hidden: { opacity: 0, scaleX: 0.8 },
    shown: { opacity: 0.9, scaleX: 1 },
  },
};

export function DockDivider({
  ref,
  idKey,
  onDragOver,
  onDrop,
  onDragLeave,
  isDropTarget,
  length = 48,
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
  const baseThickness = 1;
  const isSideDock = useContext(DockPlacementContext) !== "bottom";
  const dividerMotion = DIVIDER_MOTION[isSideDock ? "side" : "bottom"];
  const lineThickness = isDropTarget ? 4 : baseThickness;

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
      initial={dividerMotion.hidden}
      animate={dividerMotion.shown}
      exit={dividerMotion.hidden}
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
        ...(isSideDock
          ? { width: length, padding: "10px 0" }
          : { height: length, padding: "0 10px" }),
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
          ...(isSideDock
            ? { width: "100%", height: lineThickness }
            : { width: lineThickness, height: "100%" }),
          backgroundColor: isDropTarget
            ? "rgba(255, 255, 255, 0.5)"
            : "rgba(0, 0, 0, 0.2)",
          borderRadius: 2,
          transition: `${isSideDock ? "height" : "width"} 0.15s ease, background-color 0.15s ease`,
        }}
      />
    </motion.div>
  );
}
