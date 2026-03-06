import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { X, Info } from "@phosphor-icons/react";
import { useThemeStore } from "@/stores/useThemeStore";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";

interface WidgetChromeProps {
  children: ReactNode | ((isFlipped: boolean) => ReactNode);
  backContent?: ReactNode | ((onFlipBack: () => void) => ReactNode);
  overflowContent?: ReactNode;
  width: number;
  height: number;
  x: number;
  y: number;
  zIndex?: number;
  borderRadius?: string;
  hideDoneButton?: boolean;
  onRemove?: () => void;
  onMove?: (position: { x: number; y: number }) => void;
  onBringToFront?: () => void;
}

export function WidgetChrome({
  children,
  backContent,
  overflowContent,
  width,
  height,
  x,
  y,
  zIndex = 1,
  borderRadius: borderRadiusProp,
  hideDoneButton,
  onRemove,
  onMove,
  onBringToFront,
}: WidgetChromeProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const [isHovered, setIsHovered] = useState(false);
  const [isTouchActive, setIsTouchActive] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isFlipAnimating, setIsFlipAnimating] = useState(false);
  const flipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartRef = useRef<{ px: number; py: number; startX: number; startY: number } | null>(null);
  const didDragRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const showControls = isHovered || isTouchActive;

  useEffect(() => {
    if (!isTouchActive) return;
    const dismiss = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if (containerRef.current?.contains(e.target as Node)) return;
      setIsTouchActive(false);
    };
    window.addEventListener("pointerdown", dismiss, true);
    return () => window.removeEventListener("pointerdown", dismiss, true);
  }, [isTouchActive]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("[data-close-btn]")) return;
      if ((e.target as HTMLElement).closest("[data-flip-btn]")) return;
      if ((e.target as HTMLElement).closest("button, input, select, textarea, a")) return;
      if (isFlipped) return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      onBringToFront?.();
      containerRef.current?.setPointerCapture(e.pointerId);

      didDragRef.current = false;
      dragStartRef.current = { px: e.clientX, py: e.clientY, startX: x, startY: y };
      setIsDragging(true);
    },
    [x, y, onBringToFront, isFlipped]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current) return;
      e.preventDefault();
      const dx = e.clientX - dragStartRef.current.px;
      const dy = e.clientY - dragStartRef.current.py;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        didDragRef.current = true;
      }
      onMove?.({
        x: dragStartRef.current.startX + dx,
        y: dragStartRef.current.startY + dy,
      });
    },
    [onMove]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    containerRef.current?.releasePointerCapture(e.pointerId);
    const wasTap = !didDragRef.current;
    dragStartRef.current = null;
    setIsDragging(false);

    if (wasTap && e.pointerType === "touch") {
      setIsTouchActive((prev) => !prev);
    }
  }, []);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    containerRef.current?.releasePointerCapture(e.pointerId);
    dragStartRef.current = null;
    setIsDragging(false);
  }, []);

  const doFlip = useCallback((value: boolean) => {
    setIsFlipped(value);
    setIsFlipAnimating(true);
    setIsTouchActive(false);
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    flipTimerRef.current = setTimeout(() => setIsFlipAnimating(false), 650);
  }, []);

  useEffect(() => {
    return () => {
      if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    };
  }, []);

  const flipBack = useCallback(() => doFlip(false), [doFlip]);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!backContent) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, button, select, textarea, a, [data-close-btn], [data-flip-btn]")) return;
      doFlip(!isFlipped);
    },
    [backContent, doFlip, isFlipped]
  );

  const resolvedChildren = typeof children === "function" ? children(isFlipped) : children;
  const resolvedBackContent = typeof backContent === "function" ? backContent(flipBack) : backContent;
  const hasBack = !!backContent;

  const borderRadius = borderRadiusProp ?? (isXpTheme ? "4px" : "20px");

  const cardStyle = {
    width,
    minHeight: height,
    borderRadius,
    background: isXpTheme
      ? "rgba(255,255,255,0.92)"
      : "linear-gradient(to bottom, rgba(50,50,50,0.8), rgba(25,25,25,0.85))",
    border: isXpTheme
      ? "1px solid #ACA899"
      : "1px solid rgba(255,255,255,0.1)",
    boxShadow: isXpTheme
      ? "1px 1px 4px rgba(0,0,0,0.3)"
      : "0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)",
  };

  return (
    <div
      ref={containerRef}
      className="absolute select-none touch-none"
      style={{
        left: x,
        top: y,
        width,
        height: "auto",
        cursor: isDragging ? "grabbing" : isFlipped ? "default" : "grab",
        zIndex: isDragging ? 9999 : zIndex,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDoubleClick={handleDoubleClick}
    >
      {/* Close button */}
      {onRemove && (
        <motion.button
          data-close-btn
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute flex items-center justify-center"
          animate={{
            opacity: showControls ? 1 : 0,
            scale: showControls ? 1 : 0.5,
          }}
          transition={{ duration: 0.15 }}
          style={{
            top: -6, left: -6, width: 20, height: 20,
            borderRadius: "50%", zIndex: 20,
            pointerEvents: showControls ? "auto" : "none",
            background: isXpTheme ? "#CC0000" : "linear-gradient(180deg, #5a5a5a 0%, #333333 100%)",
            border: isXpTheme ? "1px solid #990000" : "1.5px solid rgba(255,255,255,0.3)",
            boxShadow: isXpTheme ? "0 1px 3px rgba(0,0,0,0.4)" : "0 2px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)",
            color: "#FFF",
          }}
        >
          <X size={10} weight="bold" />
        </motion.button>
      )}

      {/* Info/flip button */}
      {hasBack && !isFlipped && (
        <motion.button
          data-flip-btn
          type="button"
          onClick={(e) => { e.stopPropagation(); doFlip(true); }}
          className="absolute flex items-center justify-center"
          animate={{
            opacity: showControls && !isFlipAnimating ? 0.5 : 0,
          }}
          transition={{ duration: 0.15 }}
          style={{
            bottom: 4, right: 4, padding: 4, zIndex: 20,
            pointerEvents: showControls && !isFlipAnimating ? "auto" : "none",
            color: "#FFF",
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))",
          }}
        >
          <Info size={18} weight="fill" />
        </motion.button>
      )}

      {/* Overflow content — animates in/out with flip */}
      <AnimatePresence>
        {!isFlipped && overflowContent && (
          <motion.div
            key="overflow"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.3, delay: 0.3 } }}
            exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.1 } }}
            style={{ position: "relative", zIndex: 50 }}
          >
            {overflowContent}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3D flip container */}
      <div style={{ perspective: 800, WebkitPerspective: 800 }}>
        <motion.div
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.6, ease: [0.42, 0, 0.58, 1] }}
          style={{
            transformStyle: "preserve-3d",
            WebkitTransformStyle: "preserve-3d",
          }}
        >
          {/* Front face */}
          <div
            className="relative overflow-hidden"
            style={{
              ...cardStyle,
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "translateZ(0)",
              pointerEvents: isFlipped ? "none" : isDragging ? "none" : "auto",
            }}
          >
            <div className="flex flex-col" style={{ minHeight: "inherit" }}>
              {resolvedChildren}
            </div>
            {!isXpTheme && (
              <>
                <div className="absolute pointer-events-none" style={{ top: 2, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 6px)", height: "35%", maxHeight: 50, borderRadius: "18px 18px 50% 50%", background: "linear-gradient(rgba(255,255,255,0.3), rgba(255,255,255,0))", zIndex: 10 }} />
                <div className="absolute pointer-events-none" style={{ bottom: 2, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 10px)", height: "20%", maxHeight: 30, borderRadius: "50% 50% 16px 16px", background: "linear-gradient(rgba(255,255,255,0), rgba(255,255,255,0.08))", filter: "blur(1px)", zIndex: 10 }} />
              </>
            )}
          </div>

          {/* Back face */}
          {hasBack && (
            <div
              className="absolute top-0 left-0 overflow-hidden"
              style={{
                ...cardStyle,
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
                pointerEvents: isFlipped && !isFlipAnimating ? "auto" : "none",
              }}
            >
              <div className="flex flex-col" style={{ minHeight: "inherit", transform: "translateZ(1px)" }}>
                {!hideDoneButton && (
                  <div className="flex justify-end px-1 pt-1">
                    <motion.button
                      data-flip-btn
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); doFlip(false); }}
                      className="font-bold"
                      whileHover={{ opacity: 0.8 }}
                      style={{
                        fontSize: 12, padding: "4px 10px", cursor: "pointer",
                        color: isXpTheme ? "#0066CC" : "rgba(130,180,255,0.9)",
                        fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                      }}
                    >
                      {t("common.dialog.done", "Done")}
                    </motion.button>
                  </div>
                )}
                {resolvedBackContent}
              </div>
            </div>
          )}
        </motion.div>
      </div>

    </div>
  );
}
