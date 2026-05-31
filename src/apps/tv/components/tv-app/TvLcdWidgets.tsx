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
  MARQUEE_TITLE_TRANSITION,
  SPRING_TRANSITION,
  STATIC_OVERFLOW_MASK_STYLE,
  STATIC_TRANSITION,
  STATUS_TEXT_STROKE_STYLE,
} from "./tvMotionConstants";

export const AnimatedDigit = memo(function AnimatedDigit({
  digit,
  direction,
}: {
  digit: string;
  direction: "next" | "prev";
}) {
  const yOffset = direction === "next" ? 30 : -30;

  return (
    <div className="relative w-[0.6em] h-[28px] overflow-hidden inline-block">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={digit}
          initial={{ y: yOffset, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: yOffset, opacity: 0 }}
          transition={SPRING_TRANSITION}
          className="absolute inset-0 flex justify-center"
        >
          {digit}
        </motion.div>
      </AnimatePresence>
    </div>
  );
});

export const AnimatedNumber = memo(function AnimatedNumber({
  number,
}: {
  number: number;
}) {
  const [prevNumber, setPrevNumber] = useState(number);
  const direction = number > prevNumber ? "next" : "prev";

  useEffect(() => {
    setPrevNumber(number);
  }, [number]);

  const digits = String(number).padStart(2, "0").split("");
  const digitEntries = digits.map((digit, position) => ({
    digit,
    slotKey: position === 0 ? "tens" : "ones",
  }));
  return (
    <div className="flex">
      {digitEntries.map((entry) => (
        <AnimatedDigit
          key={entry.slotKey}
          digit={entry.digit}
          direction={direction}
        />
      ))}
    </div>
  );
});

export const AnimatedTitle = memo(function AnimatedTitle({
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

  // Detect when the (paused) title is wider than its viewport so we can
  // soften the hard right-edge clip with a fade mask. We measure an
  // invisible, absolutely-positioned copy that mirrors the rendered
  // padding/font of the real marquee text.
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const check = () => {
      setOverflows(measure.scrollWidth > container.clientWidth + 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(container);
    return () => ro.disconnect();
  }, [title]);

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

export const StatusDisplay = memo(function StatusDisplay({
  message,
}: {
  message: string;
}) {
  return (
    <div className="relative videos-status">
      <div className="font-geneva-12 text-white text-xl relative z-10">
        {message}
      </div>
      <div
        className="font-geneva-12 text-black text-xl absolute inset-0"
        style={STATUS_TEXT_STROKE_STYLE}
      >
        {message}
      </div>
    </div>
  );
});
