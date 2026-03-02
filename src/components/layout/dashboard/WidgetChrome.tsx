import { useState, useRef, useCallback, type ReactNode } from "react";
import { X } from "@phosphor-icons/react";
import { useThemeStore } from "@/stores/useThemeStore";

interface WidgetChromeProps {
  children: ReactNode;
  width: number;
  height: number;
  x: number;
  y: number;
  onRemove?: () => void;
  onMove?: (position: { x: number; y: number }) => void;
  title?: string;
}

export function WidgetChrome({
  children,
  width,
  height,
  x,
  y,
  onRemove,
  onMove,
  title,
}: WidgetChromeProps) {
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-close-btn]")) return;
      e.preventDefault();
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startX: x,
        startY: y,
      };
      setIsDragging(true);

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragStartRef.current) return;
        const dx = ev.clientX - dragStartRef.current.x;
        const dy = ev.clientY - dragStartRef.current.y;
        onMove?.({
          x: dragStartRef.current.startX + dx,
          y: dragStartRef.current.startY + dy,
        });
      };

      const handleMouseUp = () => {
        dragStartRef.current = null;
        setIsDragging(false);
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [x, y, onMove]
  );

  return (
    <div
      className="absolute select-none"
      style={{
        left: x,
        top: y,
        width,
        height: "auto",
        cursor: isDragging ? "grabbing" : "grab",
        zIndex: isDragging ? 100 : 1,
      }}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Widget card */}
      <div
        className="relative overflow-hidden"
        style={{
          width,
          minHeight: height,
          borderRadius: isXpTheme ? "4px" : "12px",
          background: isXpTheme
            ? "rgba(255,255,255,0.92)"
            : "rgba(255,255,255,0.2)",
          backdropFilter: isXpTheme ? "none" : "blur(20px) saturate(1.8)",
          WebkitBackdropFilter: isXpTheme ? "none" : "blur(20px) saturate(1.8)",
          border: isXpTheme
            ? "1px solid #ACA899"
            : "1px solid rgba(255,255,255,0.3)",
          boxShadow: isXpTheme
            ? "1px 1px 4px rgba(0,0,0,0.3)"
            : "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
        }}
      >
        {/* Optional title */}
        {title && (
          <div
            className="text-xs font-medium text-center py-1"
            style={{
              color: isXpTheme ? "#000" : "rgba(255,255,255,0.8)",
              borderBottom: isXpTheme
                ? "1px solid #ACA899"
                : "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {title}
          </div>
        )}

        {/* Close button (Apple Dashboard style - top-left on hover) */}
        {onRemove && isHovered && (
          <button
            data-close-btn
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute z-10 flex items-center justify-center transition-opacity"
            style={{
              top: 4,
              left: 4,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: isXpTheme ? "#CC0000" : "rgba(255,255,255,0.3)",
              border: isXpTheme ? "1px solid #990000" : "1px solid rgba(255,255,255,0.4)",
              color: isXpTheme ? "#FFF" : "rgba(255,255,255,0.9)",
            }}
          >
            <X size={10} weight="bold" />
          </button>
        )}

        {/* Widget content */}
        <div style={{ pointerEvents: isDragging ? "none" : "auto" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
