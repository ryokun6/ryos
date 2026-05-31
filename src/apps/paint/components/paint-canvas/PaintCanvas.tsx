import { PaintCanvasView } from "./PaintCanvasView";
import type { PaintCanvasComponentProps } from "./types";
import { usePaintCanvas } from "./usePaintCanvas";

export type { PaintCanvasProps, PaintCanvasRef } from "./types";

export const PaintCanvas = (props: PaintCanvasComponentProps) => {
  const viewProps = usePaintCanvas(props);
  return <PaintCanvasView {...viewProps} />;
};
