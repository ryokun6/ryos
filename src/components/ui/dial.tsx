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
    const [isDragging, setIsDragging] = React.useState(false);
    const [isDraggingValue, setIsDraggingValue] = React.useState(false);
    const [startX, setStartX] = React.useState(0);
    const [startValue, setStartValue] = React.useState(0);

    const handleMouseDown = (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      setStartX(e.clientX);
      setStartValue(value);
    };

    const handleValueMouseDown = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingValue(true);
      setStartX(e.clientX);
      setStartValue(value);
    };

    const handleTouchStart = (e: React.TouchEvent) => {
      e.preventDefault();
      setIsDragging(true);
      setStartX(e.touches[0].clientX);
      setStartValue(value);
    };

    const handleValueTouchStart = (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingValue(true);
      setStartX(e.touches[0].clientX);
      setStartValue(value);
    };

    const handleMove = (clientX: number, isDraggingTarget: boolean) => {
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
    };

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
        setIsDragging(false);
        setIsDraggingValue(false);
      };

      const handleGlobalTouchEnd = () => {
        setIsDragging(false);
        setIsDraggingValue(false);
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
    }, [isDragging, isDraggingValue, startX, startValue, min, max, step]);

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
