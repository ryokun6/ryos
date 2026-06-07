import type React from "react";
import type { Filter } from "../../types";

export interface PaintCanvasProps {
  selectedTool: string;
  selectedPattern: string;
  strokeWidth: number;
  onCanUndoChange: (canUndo: boolean) => void;
  onCanRedoChange: (canRedo: boolean) => void;
  onContentChange?: () => void;
  canvasWidth?: number;
  canvasHeight?: number;
  /** Whether the Paint window is currently foreground (active) */
  isForeground?: boolean;
}

export interface PaintCanvasRef {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  exportCanvas: () => Promise<Blob>;
  importImage: (source: string | HTMLImageElement) => void;
  cut: () => Promise<void>;
  copy: () => Promise<void>;
  paste: () => Promise<void>;
  applyFilter: (filter: Filter) => void;
}

export interface Point {
  x: number;
  y: number;
}

export interface Selection {
  type: "rectangle" | "lasso";
  startX: number;
  startY: number;
  width: number;
  height: number;
  imageData?: ImageData;
  path?: Point[];
}

export type PaintCanvasComponentProps = PaintCanvasProps & {
  ref?: React.Ref<PaintCanvasRef>;
};
