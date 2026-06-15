import { ResizeType } from "@/types/types";
import { cn } from "@/lib/utils";
import type { MouseEvent, TouchEvent } from "react";

export interface WindowFrameResizeHandlesProps {
  resizerZIndexClass: string;
  showResizers: boolean;
  isMobile: boolean;
  isXpTheme: boolean;
  isMacOSTheme: boolean;
  resizeType: ResizeType | null;
  handleResizeStartWithForeground: (
    e: MouseEvent | TouchEvent,
    type: ResizeType
  ) => void;
  handleHeightOnlyMaximize: (e: React.MouseEvent | React.TouchEvent) => void;
}

export function WindowFrameResizeHandles({
  resizerZIndexClass,
  showResizers,
  isMobile,
  isXpTheme,
  isMacOSTheme,
  resizeType,
  handleResizeStartWithForeground,
  handleHeightOnlyMaximize,
}: WindowFrameResizeHandlesProps) {
  return (
    <div
      className={cn(
        "absolute -top-2 -left-2 -right-2 -bottom-2 pointer-events-none select-none",
        resizerZIndexClass
      )}
    >
      {/* Top resize handle */}
      <div
        className={cn(
          "absolute cursor-n-resize pointer-events-auto transition-[top,height] select-none resize-handle",
          "left-1 right-0", // Full width for all cases
          showResizers && "bg-red-500/50",
          resizeType?.includes("n")
            ? "top-[-100px] h-[200px]"
            : isMobile
            ? isXpTheme
              ? "top-0 h-4" // Start from top but be shorter for XP/98 themes
              : isMacOSTheme
              ? "top-1 h-2" // Extend above window for macOS to avoid traffic lights
              : "top-0 h-8"
            : "top-1 h-2"
        )}
        onMouseDown={(e) =>
          handleResizeStartWithForeground(e, "n" as ResizeType)
        }
        onTouchStart={(e) =>
          handleResizeStartWithForeground(e, "n" as ResizeType)
        }
        onDoubleClick={handleHeightOnlyMaximize}
      />

      {/* Bottom resize handle */}
      <div
        className={cn(
          "absolute left-1 right-1 cursor-s-resize pointer-events-auto transition-[bottom,height] select-none resize-handle",
          showResizers && "bg-red-500/50",
          resizeType?.includes("s")
            ? "bottom-[-100px] h-[200px]"
            : isMobile
            ? "bottom-0 h-6"
            : "bottom-1 h-2"
        )}
        onMouseDown={(e) =>
          handleResizeStartWithForeground(e, "s" as ResizeType)
        }
        onTouchStart={(e) =>
          handleResizeStartWithForeground(e, "s" as ResizeType)
        }
        onDoubleClick={handleHeightOnlyMaximize}
      />

      {/* Left resize handle */}
      <div
        className={cn(
          "absolute top-3 cursor-w-resize pointer-events-auto transition-[left,width] select-none resize-handle",
          showResizers && "bg-red-500/50",
          resizeType?.includes("w")
            ? "left-[-100px] w-[200px]"
            : "left-1 w-2"
        )}
        style={{ bottom: resizeType?.includes("s") ? "32px" : "24px" }}
        onMouseDown={(e) =>
          handleResizeStartWithForeground(e, "w" as ResizeType)
        }
        onTouchStart={(e) =>
          handleResizeStartWithForeground(e, "w" as ResizeType)
        }
      />

      {/* Right resize handle */}
      <div
        className={cn(
          "absolute top-6 cursor-e-resize pointer-events-auto transition-[right,width] select-none resize-handle",
          showResizers && "bg-red-500/50",
          resizeType?.includes("e")
            ? "right-[-100px] w-[200px]"
            : "right-1 w-2"
        )}
        style={{ bottom: resizeType?.includes("s") ? "32px" : "24px" }}
        onMouseDown={(e) =>
          handleResizeStartWithForeground(e, "e" as ResizeType)
        }
        onTouchStart={(e) =>
          handleResizeStartWithForeground(e, "e" as ResizeType)
        }
      />

      {/* Corner resize handles */}
      <div
        className={cn(
          "absolute cursor-ne-resize pointer-events-auto transition-all select-none resize-handle",
          showResizers && "bg-red-500/50",
          isMobile && "hidden",
          resizeType === "ne"
            ? "top-[-100px] right-[-100px] size-[200px]"
            : "top-0 right-0 size-6"
        )}
        onMouseDown={(e) =>
          handleResizeStartWithForeground(e, "ne" as ResizeType)
        }
        onTouchStart={(e) =>
          handleResizeStartWithForeground(e, "ne" as ResizeType)
        }
      />

      <div
        className={cn(
          "absolute cursor-sw-resize pointer-events-auto transition-all select-none resize-handle",
          showResizers && "bg-red-500/50",
          isMobile && "hidden",
          resizeType === "sw"
            ? "bottom-[-100px] left-[-100px] size-[200px]"
            : "bottom-0 left-0 size-6"
        )}
        onMouseDown={(e) =>
          handleResizeStartWithForeground(e, "sw" as ResizeType)
        }
        onTouchStart={(e) =>
          handleResizeStartWithForeground(e, "sw" as ResizeType)
        }
      />

      <div
        className={cn(
          "absolute cursor-se-resize pointer-events-auto transition-all select-none resize-handle",
          showResizers && "bg-red-500/50",
          isMobile && "hidden",
          resizeType === "se"
            ? "bottom-[-100px] right-[-100px] size-[200px]"
            : "bottom-0 right-0 size-6"
        )}
        onMouseDown={(e) =>
          handleResizeStartWithForeground(e, "se" as ResizeType)
        }
        onTouchStart={(e) =>
          handleResizeStartWithForeground(e, "se" as ResizeType)
        }
      />
    </div>
  );
}
