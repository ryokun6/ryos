import * as React from "react";
import { cn } from "@/lib/utils";

interface DialProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  size?: "sm" | "md" | "lg";
  color?: string;
  label?: string;
  showValue?: boolean;
  valueFormatter?: (value: number) => string;
  className?: string;
}

interface DialDragState {
  isDragging: boolean;
  isDraggingValue: boolean;
  startX: number;
  startValue: number;
}

const initialState: DialDragState = {
  isDragging: false,
  isDraggingValue: false,
  startX: 0,
  startValue: 0,
};

type DialDragAction =
  | { type: "startDialDrag"; startX: number; startValue: number }
  | { type: "startValueDrag"; startX: number; startValue: number }
  | { type: "stopDragging" };

function reducer(state: DialDragState, action: DialDragAction): DialDragState {
  switch (action.type) {
    case "startDialDrag":
      return {
        ...state,
        isDragging: true,
        isDraggingValue: false,
        startX: action.startX,
        startValue: action.startValue,
      };
    case "startValueDrag":
      return {
        ...state,
        isDragging: false,
        isDraggingValue: true,
        startX: action.startX,
        startValue: action.startValue,
      };
    case "stopDragging":
      return {
        ...state,
        isDragging: false,
        isDraggingValue: false,
      };
    default:
      return state;
  }
}

const Dial = React.forwardRef<HTMLDivElement, DialProps>(
  (
    {
      className,
      value,
      min,
      max,
      step = 0.01,
      onChange,
      size = "md",
      color = "#ff8800",
      label,
      showValue = true,
      valueFormatter = (value) => value.toFixed(2),
    },
    ref
  ) => {
    const dialRef = React.useRef<HTMLDivElement>(null);
    const valueRef = React.useRef<HTMLDivElement>(null);
    const [dragState, dispatch] = React.useReducer(reducer, initialState);
    const { isDragging, isDraggingValue, startX, startValue } = dragState;

    const handleMouseDown = (e: React.MouseEvent) => {
      e.preventDefault();
      dispatch({
        type: "startDialDrag",
        startX: e.clientX,
        startValue: value,
      });
    };

    const handleValueMouseDown = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dispatch({
        type: "startValueDrag",
        startX: e.clientX,
        startValue: value,
      });
    };

    const handleTouchStart = (e: React.TouchEvent) => {
      e.preventDefault();
      dispatch({
        type: "startDialDrag",
        startX: e.touches[0].clientX,
        startValue: value,
      });
    };

    const handleValueTouchStart = (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dispatch({
        type: "startValueDrag",
        startX: e.touches[0].clientX,
        startValue: value,
      });
    };

    const handleMove = React.useCallback(
      (clientX: number, isDraggingTarget: boolean) => {
        if (!isDraggingTarget) return;

        // Calculate horizontal movement (positive = right, negative = left)
        const deltaX = clientX - startX;

        // Sensitivity factor - higher means more movement per pixel
        const sensitivity = 2;

        // Calculate new value based on movement
        const range = max - min;
        const valueChange = (deltaX * sensitivity * range) / 200;
        let newValue = startValue + valueChange;

        // Clamp value to min/max
        newValue = Math.max(min, Math.min(max, newValue));

        // Round to nearest step
        if (step) {
          newValue = Math.round(newValue / step) * step;
        }

        onChange(newValue);
      },
      [max, min, onChange, startValue, startX, step]
    );

    // Add and remove event listeners
    React.useEffect(() => {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        handleMove(e.clientX, isDragging);
        handleMove(e.clientX, isDraggingValue);
      };

      const handleGlobalTouchMove = (e: TouchEvent) => {
        handleMove(e.touches[0].clientX, isDragging);
        handleMove(e.touches[0].clientX, isDraggingValue);
      };

      const handleGlobalMouseUp = () => {
        dispatch({ type: "stopDragging" });
      };

      const handleGlobalTouchEnd = () => {
        dispatch({ type: "stopDragging" });
      };

      if (isDragging || isDraggingValue) {
        document.addEventListener("mousemove", handleGlobalMouseMove);
        document.addEventListener("touchmove", handleGlobalTouchMove);
        document.addEventListener("mouseup", handleGlobalMouseUp);
        document.addEventListener("touchend", handleGlobalTouchEnd);
      }

      return () => {
        document.removeEventListener("mousemove", handleGlobalMouseMove);
        document.removeEventListener("touchmove", handleGlobalTouchMove);
        document.removeEventListener("mouseup", handleGlobalMouseUp);
        document.removeEventListener("touchend", handleGlobalTouchEnd);
      };
    }, [isDragging, isDraggingValue, startX, startValue, min, max, step, handleMove]);

    // Size classes
    const sizeClasses = {
      sm: "w-8 h-8",
      md: "w-12 h-12",
      lg: "w-14 h-14",
    };

    // Calculate the percentage for the background fill
    const percentage = ((value - min) / (max - min)) * 100;

    return (
      <div className={cn("flex flex-col items-center no-select-gesture", className)} ref={ref}>
        {label && (
          <div
            ref={valueRef}
            className={cn(
              "mb-1 font-geneva-12 text-center cursor-ew-resize select-none no-select-gesture",
              isDraggingValue && "text-[#ff00ff]"
            )}
            style={{
              touchAction: "none",
              WebkitUserSelect: "none",
              WebkitTouchCallout: "none",
            }}
            onMouseDown={handleValueMouseDown}
            onTouchStart={handleValueTouchStart}
          >
            <div className="text-[10px] text-gray-400">{label}</div>
            {showValue && (
              <div className="text-xs">{valueFormatter(value)}</div>
            )}
          </div>
        )}
        <div
          ref={dialRef}
          className={cn(
            "relative rounded-full bg-[#333] cursor-ew-resize select-none no-select-gesture",
            sizeClasses[size],
            isDragging && "ring-1 ring-[#ff00ff]"
          )}
          style={{
            background: `conic-gradient(${color} 0% ${percentage}%, #333 ${percentage}% 100%)`,
            touchAction: "none",
            WebkitUserSelect: "none",
            WebkitTouchCallout: "none",
          }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          {/* Center circle */}
          <div className="absolute top-1/2 left-1/2 w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#222]"></div>
        </div>
      </div>
    );
  }
);

Dial.displayName = "Dial";

export { Dial };
