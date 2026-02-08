import { useMemo, useLayoutEffect, useRef, useState, useEffect } from "react";
import { motion, MotionConfig } from "framer-motion";
import { cn } from "@/lib/utils";

type AquariumSize = "small" | "medium" | "large";
type AquariumDensity = "calm" | "default" | "crowded";

interface EmojiAquariumProps {
  size?: AquariumSize;
  density?: AquariumDensity;
  seed?: string;
  className?: string;
}

function createSeededRandom(seed?: string) {
  // Mulberry32 PRNG
  let a = 0;
  if (seed && seed.length > 0) {
    for (let i = 0; i < seed.length; i++) a = (a + seed.charCodeAt(i)) | 0;
  } else {
    a = Math.floor(Math.random() * 2 ** 31);
  }
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function EmojiAquarium({ seed, className }: EmojiAquariumProps) {
  const [resolvedSeed, setResolvedSeed] = useState<string>(
    () => seed || Math.floor(Math.random() * 2 ** 31).toString()
  );

  // If a seed prop is provided later, allow switching to it.
  useEffect(() => {
    if (seed && seed !== resolvedSeed) {
      setResolvedSeed(seed);
    }
  }, [seed, resolvedSeed]);

  const rand = useMemo(() => createSeededRandom(resolvedSeed), [resolvedSeed]);

  // Responsive: fill the container width and compute height via aspect ratio.
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(420);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth || 420);
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const aspect = 236 / 420; // ~16:9
  const width = containerWidth;
  const height = Math.max(120, Math.round(containerWidth * aspect));
  // Scale sand height with container for a larger, responsive base
  const sandHeight = Math.max(24, Math.round(height * 0.35));

  const { jellyCount, bubbleCount, floorCount } = useMemo(() => {
    return { jellyCount: 3, bubbleCount: 5, floorCount: 7 };
  }, []);

  const largeCount = 2;
  const smallCount = 6;

  const smallFishes = ["🐟", "🐠", "🐡"];
  const largeFishes = ["🦈", "🐬"];
  const decor = ["🪸", "⚓️", "🪨", "🌿", "🗿", "🐚", "🦑", "🦀"];

  const bubbles = "🫧"; // falls back to monochrome when unsupported

  const floorXs = useMemo(() => {
    const xs: number[] = [];
    if (floorCount <= 0) return xs;
    const leftPad = 8;
    const rightPad = 16;
    const usable = Math.max(0, width - leftPad - rightPad);
    const seg = usable / (floorCount + 1);
    for (let i = 0; i < floorCount; i++) {
      const base = leftPad + seg * (i + 1);
      const jitter = (rand() - 0.5) * seg * 0.5;
      let x = Math.max(leftPad, Math.min(width - rightPad, base + jitter));
      if (i > 0) {
        const minGap = Math.min(40, seg * 0.6);
        if (x - xs[i - 1] < minGap) {
          x = xs[i - 1] + minGap;
          if (x > width - rightPad) x = width - rightPad;
        }
      }
      xs.push(x);
    }
    return xs;
  }, [width, floorCount, rand]);

  return (
    <MotionConfig reducedMotion="never">
      <div
        className={cn(
          "chat-bubble bg-blue-300 text-black !p-0 mb-2 w-full max-w-[420px] rounded",
          className
        )}
      >
        <div
          ref={containerRef}
          className={cn("relative z-0 overflow-hidden rounded")}
          style={{ width: "100%", height }}
        >
          {/* small fish */}
          {Array.from({ length: smallCount }).map((_, i) => {
            const emoji = smallFishes[Math.floor(rand() * smallFishes.length)];
            const dirRight = rand() > 0.5;
            const sizePx = 24;
            const wiggle = 6 + rand() * 8;
            const yMin = 20;
            const yMax = Math.max(yMin, height - sizePx - wiggle);
            const y = yMin + rand() * (yMax - yMin);
            const duration = 14 + rand() * 16;
            const delay = rand() * 4;
            const xFrom = dirRight ? -60 : width + 60;
            const xTo = dirRight ? width + 60 : -60;
            return (
              <motion.span
                key={`fish-small-${i}`}
                initial={{ x: xFrom, y }}
                animate={{
                  x: [xFrom, xTo],
                  y: [y, y - wiggle, y, y + wiggle, y],
                }}
                transition={{
                  x: {
                    duration,
                    ease: "linear",
                    repeat: Infinity,
                    repeatType: "loop",
                    delay,
                  },
                  y: {
                    duration: duration / 2,
                    repeat: Infinity,
                    repeatType: "mirror",
                    ease: "easeInOut",
                  },
                }}
                style={{ position: "absolute", willChange: "transform" }}
                className="select-none z-30"
              >
                <span
                  style={{
                    display: "inline-block",
                    transform: dirRight ? "scaleX(-1)" : undefined,
                    fontSize: `${sizePx}px`,
                  }}
                >
                  {emoji}
                </span>
              </motion.span>
            );
          })}

          {/* large fish */}
          {Array.from({ length: largeCount }).map((_, i) => {
            const emoji = largeFishes[Math.floor(rand() * largeFishes.length)];
            const dirRight = rand() > 0.5;
            const sizePx = 40;
            const wiggle = 8 + rand() * 10;
            const clearance = 40; // 20 existing + 20 more
            const yMin = 20;
            const yMax = Math.max(
              yMin + 40,
              height - sandHeight - clearance - sizePx - wiggle
            );
            const y = yMin + rand() * (yMax - yMin);
            const duration = 18 + rand() * 18;
            const delay = rand() * 4;
            const xFrom = dirRight ? -80 : width + 80;
            const xTo = dirRight ? width + 80 : -80;
            return (
              <motion.span
                key={`fish-large-${i}`}
                initial={{ x: xFrom, y }}
                animate={{
                  x: [xFrom, xTo],
                  y: [y, y - wiggle, y, y + wiggle, y],
                }}
                transition={{
                  x: {
                    duration,
                    ease: "linear",
                    repeat: Infinity,
                    repeatType: "loop",
                    delay,
                  },
                  y: {
                    duration: duration / 2,
                    repeat: Infinity,
                    repeatType: "mirror",
                    ease: "easeInOut",
                  },
                }}
                style={{ position: "absolute", willChange: "transform" }}
                className="select-none z-30"
              >
                <span
                  style={{
                    display: "inline-block",
                    transform: dirRight ? "scaleX(-1)" : undefined,
                    fontSize: `${sizePx}px`,
                  }}
                >
                  {emoji}
                </span>
              </motion.span>
            );
          })}

          {/* jellyfish drifting */}
          {Array.from({ length: jellyCount }).map((_, i) => {
            const x = 40 + rand() * (width - 80);
            const startY = 20 + rand() * (height * 0.45);
            const float = 18 + rand() * 10;
            const delay = rand() * 3;
            const xDrift = 14 + rand() * 24;
            return (
              <motion.span
                key={`jelly-${i}`}
                initial={{ x, y: startY }}
                animate={{
                  x: [x - xDrift, x + xDrift, x - xDrift],
                  y: [startY, startY + 18, startY],
                  opacity: [0.85, 1, 0.85],
                }}
                transition={{
                  duration: float,
                  repeat: Infinity,
                  delay,
                  ease: "easeInOut",
                  x: {
                    duration: float * 1.4,
                    repeat: Infinity,
                    repeatType: "mirror",
                    ease: "easeInOut",
                    delay,
                  },
                }}
                style={{
                  position: "absolute",
                  willChange: "transform, opacity",
                }}
                className="text-[24px] select-none z-20"
              >
                {"🪼"}
              </motion.span>
            );
          })}

          {/* bubbles rising - back layer */}
          {Array.from({ length: Math.floor(bubbleCount / 2) }).map((_, i) => {
            const x = 10 + rand() * (width - 20);
            const start = rand() * (height * 0.65);
            const drift = (rand() - 0.5) * 20;
            const dur = 15 + rand() * 18;
            const delay = rand() * 6;
            return (
              <motion.span
                key={`bubble-back-${i}`}
                initial={{ x, y: height - start, opacity: 0, scale: 0.4 }}
                animate={{
                  x: [x, x + drift],
                  y: [height - start, -25],
                  opacity: [0, 0.25, 0.5, 0.3, 0],
                  scale: [0.4, 0.7, 1.0, 0.9, 0.5],
                }}
                transition={{
                  duration: dur,
                  ease: "easeOut",
                  repeat: Infinity,
                  delay,
                }}
                style={{
                  position: "absolute",
                  willChange: "transform, opacity",
                }}
                className="text-[24px] select-none z-25"
              >
                {bubbles}
              </motion.span>
            );
          })}

          {/* bubbles rising - front layer */}
          {Array.from({ length: Math.ceil(bubbleCount / 2) }).map((_, i) => {
            const x = 10 + rand() * (width - 20);
            const start = rand() * (height * 0.65);
            const drift = (rand() - 0.5) * 20;
            const dur = 15 + rand() * 18;
            const delay = rand() * 6;
            return (
              <motion.span
                key={`bubble-front-${i}`}
                initial={{ x, y: height - start, opacity: 0, scale: 0.4 }}
                animate={{
                  x: [x, x + drift],
                  y: [height - start, -25],
                  opacity: [0, 0.3, 0.7, 0.4, 0],
                  scale: [0.4, 0.8, 1.2, 1, 0.6],
                }}
                transition={{
                  duration: dur,
                  ease: "easeOut",
                  repeat: Infinity,
                  delay,
                }}
                style={{
                  position: "absolute",
                  willChange: "transform, opacity",
                }}
                className="text-[28px] select-none z-40"
              >
                {bubbles}
              </motion.span>
            );
          })}

          {/* sand base */}
          <div
            className="absolute left-0 right-0 bottom-0 z-0 bg-gradient-to-t from-yellow-200/80 via-yellow-100/40 to-transparent"
            style={{ height: sandHeight }}
          />

          {/* floor decorations */}
          {Array.from({ length: floorCount }).map((_, i) => {
            const emoji = decor[Math.floor(rand() * decor.length)];
            const x = floorXs[i] ?? 8 + rand() * (width - 16);
            const delay = 0.2 + i * 0.07 + rand() * 0.2;
            const rot = (rand() - 0.5) * 10;
            const size = 18 + rand() * 8;
            const bottomOffset = 8 + rand() * 4; // place items a few px from bottom edge
            const yPos = Math.max(0, height - size - bottomOffset);
            return (
              <motion.span
                key={`floor-${i}`}
                initial={{ x, y: -20, opacity: 0, rotate: rot }}
                animate={{ x, y: yPos, opacity: 1, rotate: rot }}
                transition={{
                  type: "spring",
                  stiffness: 380,
                  damping: 20,
                  delay,
                }}
                style={{ position: "absolute" }}
                className="select-none z-0"
              >
                <span style={{ fontSize: `${size}px` }}>{emoji}</span>
              </motion.span>
            );
          })}

          {/* life ring at corner */}
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="absolute right-4 top-1.5 select-none text-[24px]"
          >
            🛟
          </motion.span>
        </div>
      </div>
    </MotionConfig>
  );
}

export default EmojiAquarium;
