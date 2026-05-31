import { memo, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  MARQUEE_INITIAL,
  MARQUEE_TITLE_ANIMATE,
  MARQUEE_TITLE_ANIMATE_STATIC,
  MARQUEE_TITLE_TRANSITION,
  SPRING_TRANSITION,
  STATIC_OVERFLOW_MASK_STYLE,
  STATIC_TRANSITION,
  STATUS_TEXT_STROKE_STYLE,
} from "./videosMotionConstants";

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
