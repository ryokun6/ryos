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
}

export function WidgetChrome({
  children,
  width,
  height,
  x,
  y,
  onRemove,
  onMove,
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
      {/* Close button — Tiger ⊗ style, top-left, only visible on hover */}
      {onRemove && (
        <button
          data-close-btn
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute flex items-center justify-center transition-all"
          style={{
            top: -6,
            left: -6,
            width: 20,
            height: 20,
            borderRadius: "50%",
            zIndex: 20,
            opacity: isHovered ? 1 : 0,
            transform: isHovered ? "scale(1)" : "scale(0.5)",
            background: isXpTheme
              ? "#CC0000"
              : "linear-gradient(180deg, #5a5a5a 0%, #333333 100%)",
            border: isXpTheme
              ? "1px solid #990000"
              : "1.5px solid rgba(255,255,255,0.3)",
            boxShadow: isXpTheme
              ? "0 1px 3px rgba(0,0,0,0.4)"
              : "0 2px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)",
            color: "#FFF",
          }}
        >
          <X size={10} weight="bold" />
        </button>
      )}

      {/* Widget card */}
      <div
        className="relative overflow-hidden"
        style={{
          width,
          minHeight: height,
          borderRadius: isXpTheme ? "4px" : "14px",
          background: isXpTheme
            ? "rgba(255,255,255,0.92)"
            : "rgba(30,30,30,0.75)",
          backdropFilter: isXpTheme ? "none" : "blur(20px) saturate(1.6)",
          WebkitBackdropFilter: isXpTheme ? "none" : "blur(20px) saturate(1.6)",
          border: isXpTheme
            ? "1px solid #ACA899"
            : "1px solid rgba(255,255,255,0.12)",
          boxShadow: isXpTheme
            ? "1px 1px 4px rgba(0,0,0,0.3)"
            : "0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        {/* Widget content */}
        <div style={{ pointerEvents: isDragging ? "none" : "auto" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
