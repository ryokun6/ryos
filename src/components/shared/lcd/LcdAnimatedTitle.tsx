import { memo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { useTextOverflow } from "@/hooks/useTextOverflow";
import {
  MARQUEE_INITIAL,
  MARQUEE_TITLE_ANIMATE,
  MARQUEE_TITLE_ANIMATE_STATIC,
  MARQUEE_TITLE_TRANSITION,
  SPRING_TRANSITION,
  STATIC_OVERFLOW_MASK_STYLE,
  STATIC_TRANSITION,
} from "./lcdMotionConstants";

export const LcdAnimatedTitle = memo(function LcdAnimatedTitle({
  title,
  direction,
  isPlaying,
}: {
  title: string;
  direction: "next" | "prev";
  isPlaying: boolean;
}) {
  const yOffset = direction === "next" ? 30 : -30;
  const marqueeAnimate = isPlaying
    ? MARQUEE_TITLE_ANIMATE
    : MARQUEE_TITLE_ANIMATE_STATIC;
  const marqueeTransition = isPlaying
    ? MARQUEE_TITLE_TRANSITION
    : STATIC_TRANSITION;
  const titleClass = cn(
    "shrink-0 font-geneva-12 text-xl px-2 transition-colors duration-300 -mt-1 animated-title-text",
    isPlaying ? "text-[#ff00ff]" : "text-neutral-600",
    !isPlaying && "opacity-50"
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const overflows = useTextOverflow(containerRef, measureRef, [title]);

  const showStaticFade = overflows && !isPlaying;

  return (
    <div
      ref={containerRef}
      className="relative h-[22px] mb-[3px] overflow-hidden"
      style={showStaticFade ? STATIC_OVERFLOW_MASK_STYLE : undefined}
    >
      <span
        ref={measureRef}
        aria-hidden
        className="invisible absolute font-geneva-12 text-xl px-2 whitespace-nowrap pointer-events-none"
      >
        {title}
      </span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={title}
          initial={{ y: yOffset, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: yOffset, opacity: 0 }}
          transition={SPRING_TRANSITION}
          className="absolute inset-0 flex whitespace-nowrap"
        >
          <motion.div
            initial={MARQUEE_INITIAL}
            animate={marqueeAnimate}
            transition={marqueeTransition}
            className={titleClass}
          >
            {title}
          </motion.div>
          <motion.div
            initial={MARQUEE_INITIAL}
            animate={marqueeAnimate}
            transition={marqueeTransition}
            className={titleClass}
            aria-hidden
          >
            {title}
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
});
