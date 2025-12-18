import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ScrollingTextProps {
  text: string;
  className?: string;
  isPlaying?: boolean;
}

export function ScrollingText({
  text,
  className,
  isPlaying = true,
}: ScrollingTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [contentWidth, setContentWidth] = useState(0);
  const paddingWidth = 20; // Width of padding between text duplicates

  // Check if text needs to scroll (is wider than container)
  useEffect(() => {
    if (containerRef.current && textRef.current) {
      const newContainerWidth = containerRef.current.clientWidth;
      const newContentWidth = textRef.current.scrollWidth;

      setContentWidth(newContentWidth);
      setShouldScroll(newContentWidth > newContainerWidth);
    }
  }, [text]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden",
        !shouldScroll && "flex justify-center",
        className
      )}
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
        <div ref={textRef} className="whitespace-nowrap text-center">
          {text}
        </div>
      )}
    </div>
  );
}
