import { useState, useRef, useEffect, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ScrollingTextProps {
  text: string;
  className?: string;
  isPlaying?: boolean;
  align?: "center" | "left";
  fadeEdges?: boolean;
  style?: CSSProperties;
}

export function ScrollingText({
  text,
  className,
  isPlaying = true,
  align = "center",
  fadeEdges = false,
  style,
}: ScrollingTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [contentWidth, setContentWidth] = useState(0);
  const paddingWidth = 20; // Width of padding between text duplicates

  // Check if text needs to scroll (is wider than container)
  useEffect(() => {
    const container = containerRef.current;
    const textElement = textRef.current;
    if (!container || !textElement) return;

    const measure = () => {
      const newContainerWidth = container.clientWidth;
      const newContentWidth = textElement.scrollWidth;
      setContentWidth(newContentWidth);
      setShouldScroll(newContentWidth > newContainerWidth);
    };

    measure();

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);
    resizeObserver.observe(textElement);

    return () => resizeObserver.disconnect();
  }, [text, shouldScroll]);

  const maskImage =
    shouldScroll && fadeEdges
      ? "linear-gradient(to right, transparent 0, black 0.75em, black calc(100% - 0.75em), transparent 100%)"
      : undefined;
  const mergedStyle: CSSProperties = {
    ...style,
    maskImage,
    WebkitMaskImage: maskImage,
  };
  const alignClass = align === "left" ? "justify-start" : "justify-center";
  const textAlignClass = align === "left" ? "text-left" : "text-center";

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden",
        !shouldScroll && "flex",
        !shouldScroll && alignClass,
        className
      )}
      style={mergedStyle}
    >
      {shouldScroll ? (
        <div className="inline-block whitespace-nowrap">
          <motion.div
            animate={{
              x: isPlaying ? [0, -(contentWidth + paddingWidth)] : 0,
            }}
            transition={
              isPlaying
                ? {
                    duration: Math.max(text.length * 0.15, 8),
                    ease: "linear",
                    repeat: Infinity,
                  }
                : {
                    duration: 0.3,
                  }
            }
            style={{ display: "inline-flex" }}
          >
            <span ref={textRef} style={{ paddingRight: `${paddingWidth}px` }}>
              {text}
            </span>
            <span style={{ paddingRight: `${paddingWidth}px` }} aria-hidden>
              {text}
            </span>
          </motion.div>
        </div>
      ) : (
        <div ref={textRef} className={cn("whitespace-nowrap", textAlignClass)}>
          {text}
        </div>
      )}
    </div>
  );
}
