import type { AppId } from "@/config/appRegistry";
import type { MotionValue } from "framer-motion";

export interface DockIconButtonProps {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  icon: string;
  idKey: string;
  showIndicator?: boolean;
  isEmoji?: boolean;
  onDragOver?: React.DragEventHandler;
  onDrop?: React.DragEventHandler;
  onDragLeave?: React.DragEventHandler;
  onContextMenu?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  mouseX: MotionValue<number>;
  magnifyEnabled: boolean;
  isNew: boolean;
  isHovered: boolean;
  isSwapping: boolean;
  onHover: () => void;
  onLeave: () => void;
  isLoading?: boolean;
  draggable?: boolean;
  onDragStart?: React.DragEventHandler<HTMLElement>;
  onDragEnd?: React.DragEventHandler<HTMLElement>;
  isDragging?: boolean;
  isDraggedOutside?: boolean;
  baseSize?: number;
  /** When set, warms the lazy app chunk on hover, focus, and primary pointer down. */
  intentPrefetchAppId?: AppId;
}

export interface DockDividerProps {
  idKey: string;
  onDragOver?: React.DragEventHandler;
  onDrop?: React.DragEventHandler;
  onDragLeave?: React.DragEventHandler;
  isDropTarget?: boolean;
  height?: number;
  resizable?: boolean;
  onResizeStart?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onTouchStart?: React.TouchEventHandler;
  onTouchEnd?: React.TouchEventHandler;
  onTouchMove?: React.TouchEventHandler;
  onTouchCancel?: React.TouchEventHandler;
}

export interface DockSpacerProps {
  idKey: string;
  mouseX: MotionValue<number>;
  magnifyEnabled: boolean;
  baseSize?: number;
}
