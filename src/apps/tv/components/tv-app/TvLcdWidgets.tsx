import {
  memo,
  useEffect,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  MARQUEE_INITIAL,
  MARQUEE_NAME_TRANSITION,
  MARQUEE_TITLE_ANIMATE,
  MARQUEE_TITLE_ANIMATE_STATIC,
  SPRING_TRANSITION,
  STATIC_OVERFLOW_MASK_STYLE,
  STATIC_TRANSITION,
} from "@/components/shared/lcd/lcdMotionConstants";

/**
 * NOW/NEXT label that swaps with the same vertical spring used by the Videos
 * `AnimatedTitle`. Structurally renders as a plain `<div>{text}</div>` (no
 * forced height, no flex centering) so it baseline-aligns with the CH/NET
 * labels — an invisible spacer locks the natural line height while the
 * animated copies are absolutely positioned and clipped by overflow-hidden.
 */
export const AnimatedScheduleLabel = memo(function AnimatedScheduleLabel({
  slotKey,
  text,
  direction,
}: {
  slotKey: string;
  text: string;
  direction: "next" | "prev";
}) {
  // Use a generous offset so the entering/exiting copy is always fully
  // outside the spacer height regardless of the rendered Geneva-12 line
  // metrics across themes; `overflow-hidden` on the wrapper clips anything
  // beyond the natural label height.
  const yOffset = direction === "next" ? 30 : -30;
  return (
    <div className="relative overflow-hidden">
      <div className="invisible" aria-hidden>
        {text}
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={slotKey}
          initial={{ y: yOffset, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: yOffset, opacity: 0 }}
          transition={SPRING_TRANSITION}
          className="absolute inset-0"
        >
          {text}
        </motion.div>
      </AnimatePresence>
    </div>
  );
});

/**
 * Channel name shown in the LCD's NET column. Truncates when it fits, but
 * marquee-scrolls (matching the NOW/NEXT title scroll) when the name is
 * longer than the available width so the viewer can read the whole thing.
 */
export const ScrollingChannelName = memo(function ScrollingChannelName({
  name,
  isPlaying,
}: {
  name: string;
  isPlaying: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    const check = () => {
      setOverflows(content.scrollWidth > container.clientWidth + 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(container);
    return () => ro.disconnect();
  }, [name]);

  const shouldAnimate = overflows && isPlaying;
  const marqueeAnimate = shouldAnimate
    ? MARQUEE_TITLE_ANIMATE
    : MARQUEE_TITLE_ANIMATE_STATIC;
  const marqueeTransition = shouldAnimate
    ? MARQUEE_NAME_TRANSITION
    : STATIC_TRANSITION;

  const showStaticFade = overflows && !isPlaying;

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden text-xl"
      style={showStaticFade ? STATIC_OVERFLOW_MASK_STYLE : undefined}
    >
      {/* Single copy establishes the column height; hidden once we scroll
          so it doesn't double up with the marquee copies below. */}
      <span
        ref={contentRef}
        className={cn(
          "block whitespace-nowrap",
          overflows ? "invisible" : "truncate"
        )}
      >
        {name}
      </span>
      {overflows && (
        <>
          <div className="absolute inset-0 flex whitespace-nowrap">
            <motion.span
              initial={MARQUEE_INITIAL}
              animate={marqueeAnimate}
              transition={marqueeTransition}
              className="shrink-0 pr-4"
            >
              {name}
            </motion.span>
            <motion.span
              initial={MARQUEE_INITIAL}
              animate={marqueeAnimate}
              transition={marqueeTransition}
              className="shrink-0 pr-4"
              aria-hidden
            >
              {name}
            </motion.span>
          </div>
          {shouldAnimate && (
            <>
              <div className="absolute left-0 top-0 h-full w-3 bg-gradient-to-r from-black to-transparent videos-lcd-fade-left pointer-events-none" />
              <div className="absolute right-0 top-0 h-full w-3 bg-gradient-to-l from-black to-transparent videos-lcd-fade-right pointer-events-none" />
            </>
          )}
        </>
      )}
    </div>
  );
});
