import { motion } from "framer-motion";
import type { Point, Selection } from "./types";

export interface PaintCanvasViewProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  textInputRef: React.RefObject<HTMLInputElement | null>;
  selectedTool: string;
  selection: Selection | null;
  canvasWidth: number;
  canvasHeight: number;
  isTyping: boolean;
  textPosition: Point | null;
  handlePointerDown: (
    event:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>
  ) => void;
  handlePointerMove: (
    event:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>
  ) => void;
  handlePointerUp: (
    event:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>
  ) => void;
  handleTextInput: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  handleTextBlur: (event: React.FocusEvent<HTMLInputElement>) => void;
}

export function PaintCanvasView({
  containerRef,
  canvasRef,
  textInputRef,
  selectedTool,
  selection,
  canvasWidth,
  canvasHeight,
  isTyping,
  textPosition,
  handlePointerDown,
  handlePointerMove,
  handlePointerUp,
  handleTextInput,
  handleTextBlur,
}: PaintCanvasViewProps) {
  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-auto"
      style={{
        cursor:
          selectedTool === "hand"
            ? "grab"
            : selectedTool === "rect-select"
              ? "crosshair"
              : selection
                ? "move"
                : "crosshair",
      }}
    >
      <motion.div
        className="bg-white"
        style={{
          minWidth: `${canvasWidth}px`,
          minHeight: `${canvasHeight}px`,
        }}
        drag={selectedTool === "hand"}
        dragConstraints={containerRef}
        dragElastic={0.2}
        dragMomentum={true}
        dragTransition={{
          bounceStiffness: 300,
          bounceDamping: 20,
          min: 0,
          max: 100,
        }}
      >
        <div
          className="relative"
          style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }}
        >
          <canvas
            ref={canvasRef}
            style={{
              imageRendering: "pixelated",
              width: "100%",
              height: "100%",
              touchAction: "none",
              cursor: selectedTool === "hand" ? "grab" : "crosshair",
            }}
            className={
              selectedTool === "rect-select"
                ? "cursor-crosshair"
                : selection
                  ? "cursor-move"
                  : "cursor-crosshair"
            }
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
          />
          {isTyping && textPosition && (
            <input
              ref={textInputRef}
              type="text"
              className="absolute bg-transparent border-none outline-none font-geneva-12 text-black pointer-events-auto"
              style={{
                left: `${textPosition.x}px`,
                top: `${textPosition.y}px`,
                fontSize: `16px`,
                minWidth: "100px",
                padding: 0,
                margin: 0,
                transform: "translateZ(0)",
              }}
              onKeyDown={handleTextInput}
              onBlur={handleTextBlur}
            />
          )}
        </div>
      </motion.div>
    </div>
  );
}
