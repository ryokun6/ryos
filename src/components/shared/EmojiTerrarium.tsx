import { useMemo, useLayoutEffect, useRef, useState, useEffect } from "react";
import { motion, MotionConfig } from "motion/react";
import { cn } from "@/lib/utils";
import { Emoji } from "@/components/shared/Emoji";

interface EmojiTerrariumProps {
  seed?: string;
  className?: string;
}

interface TerrariumFireflyOverflowLayerProps {
  seed?: string;
  width: number;
  height: number;
  count?: number;
  className?: string;
}

const FIREFLY_EMOJI = "✨";

/** Smooth ease for looping foliage sway (avoids snappy easeInOut reversals). */
const FOLIAGE_SWAY_EASE = [0.42, 0.05, 0.58, 0.95] as const;

function foliageRotateKeyframes(base: number, amplitude: number) {
  const a = amplitude;
  return [base, base + a * 0.65, base + a, base + a * 0.65, base, base - a * 0.65, base - a, base - a * 0.65, base];
}

function createSeededRandom(seed?: string) {
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

/** Soft sparks that drift upward past the jar lip (paired with AquariumBubbleOverflow). */
export function TerrariumFireflyOverflowLayer({
  seed,
  width,
  height,
  count = 4,
  className,
}: TerrariumFireflyOverflowLayerProps) {
  const rand = createSeededRandom(seed);
  const lift = Math.max(24, Math.round(height * 0.16));
  const safeWidth = Math.max(1, width);

  return (
    <div
      className={cn("pointer-events-none overflow-visible", className)}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: safeWidth,
        height,
        zIndex: 60,
      }}
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => {
        const edgePad = 10;
        const x = edgePad + rand() * Math.max(0, safeWidth - edgePad * 2);
        const startFromSoil = i % 3 !== 1;
        const startY = startFromSoil
          ? height - rand() * Math.max(20, height * 0.22)
          : 16 + rand() * Math.max(12, height * 0.2);
        const drift = (rand() - 0.5) * 28;
        const dur = 9 + rand() * 10;
        const delay = i * 0.7 + rand() * 2;
        const dot = 14 + rand() * 8;
        const endY = -(8 + rand() * lift);

        return (
          <motion.span
            key={`terrarium-glow-overflow-${i}`}
            initial={{ x, y: startY, opacity: 0, scale: 0.55 }}
            animate={{
              x: [x, x + drift * 0.35, x + drift],
              y: [startY, startY - lift * 0.35, endY],
              opacity: [0, 0.75, 0.55, 0],
              scale: [0.55, 1, 0.85],
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
              filter:
                "drop-shadow(0 0 10px rgba(255,248,220,0.55)) drop-shadow(0 0 3px rgba(235,215,155,0.45))",
            }}
            className="select-none"
          >
            <Emoji emoji={FIREFLY_EMOJI} size={dot} />
          </motion.span>
        );
      })}
    </div>
  );
}

const PLANTS = ["🌿", "🌱", "🍀", "🌸", "🌼", "🌾", "🪴"];
const GRASS_TUFTS = ["🌿", "🌱", "☘️", "🍀"];
const ROCK_COUNT = 4;
const PLANT_COUNT = 7;
const MOTE_COUNT = 5;

/** Mini land biome: mossy soil, stones, plants, crawling critters, and soft glow (dashboard-first). */
export function EmojiTerrarium({ seed, className }: EmojiTerrariumProps) {
  const seedRef = useRef<string | undefined>(seed);
  if (seedRef.current === undefined) {
    seedRef.current = Math.floor(Math.random() * 2 ** 31).toString();
  }
  useEffect(() => {
    if (seed && seed !== seedRef.current) {
      seedRef.current = seed;
    }
  }, [seed]);

  const stableSeed = seedRef.current ?? "0";

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 420, height: 0 });
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setContainerSize({
        width: el.clientWidth || 420,
        height: el.clientHeight || 0,
      });
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const aspect = 200 / 420;
  const width = containerSize.width;
  const aspectHeight = Math.round(containerSize.width * aspect);
  const height = Math.max(120, containerSize.height || aspectHeight);

  const soilHeight = Math.max(28, Math.round(height * 0.34));
  const groundY = height - soilHeight;

  const floorXs = useMemo(() => {
    const rnd = createSeededRandom(`${stableSeed}:terrarium-floor-xs:${width}`);
    const xs: number[] = [];
    const n = Math.max(PLANT_COUNT, ROCK_COUNT);
    if (n <= 0) return xs;
    const leftPad = 10;
    const rightPad = 14;
    const usable = Math.max(0, width - leftPad - rightPad);
    const seg = usable / (n + 1);
    for (let i = 0; i < n; i++) {
      const base = leftPad + seg * (i + 1);
      const jitter = (rnd() - 0.5) * seg * 0.55;
      let x = Math.max(leftPad, Math.min(width - rightPad, base + jitter));
      if (i > 0) {
        const minGap = Math.min(36, seg * 0.55);
        if (x - xs[i - 1] < minGap) {
          x = xs[i - 1] + minGap;
          if (x > width - rightPad) x = width - rightPad;
        }
      }
      xs.push(x);
    }
    return xs;
  }, [stableSeed, width]);

  const grassTufts = useMemo(() => {
    const rnd = createSeededRandom(`${stableSeed}:terrarium-grass:${width}`);
    const count = Math.max(10, Math.min(20, Math.floor(width / 20)));
    const leftPad = 2;
    const rightPad = 6;
    const usable = Math.max(0, width - leftPad - rightPad);
    const seg = usable / Math.max(count, 1);
    return Array.from({ length: count }, (_, i) => {
      const base = leftPad + seg * (i + 0.5);
      const x = Math.max(leftPad, Math.min(width - rightPad - 18, base + (rnd() - 0.5) * seg * 0.65));
      const baseRotate = (rnd() - 0.5) * 10;
      return {
        x,
        emoji: GRASS_TUFTS[Math.floor(rnd() * GRASS_TUFTS.length)],
        size: 15 + Math.round(rnd() * 11),
        baseRotate,
        swayAmp: 1 + rnd() * 1.4,
        delay: rnd() * 2.5,
        swayDur: 7.5 + rnd() * 5.5,
        layer: rnd() > 0.72 ? 1 : 0,
      };
    });
  }, [stableSeed, width]);

  const plantSprites = useMemo(() => {
    const rnd = createSeededRandom(`${stableSeed}:terrarium-plants:${width}:${height}`);
    return Array.from({ length: PLANT_COUNT }, (_, i) => {
      const x = floorXs[i] ?? 12 + rnd() * Math.max(0, width - 24);
      const sizePx = 20 + Math.round(rnd() * 11);
      const top = Math.max(groundY - sizePx + 10 + rnd() * 12, 16);
      const baseRotate = (rnd() - 0.5) * 8;
      return {
        x,
        top,
        emoji: PLANTS[Math.floor(rnd() * PLANTS.length)],
        sizePx,
        baseRotate,
        swayAmp: 1.1 + rnd() * 1.6,
        delay: rnd() * 2.8,
        swayDur: 8.5 + rnd() * 6.5,
      };
    });
  }, [stableSeed, width, height, groundY, floorXs]);

  const meadowGradient = useMemo(() => {
    const horizonPct = Math.min(92, Math.max(48, Math.round((groundY / Math.max(height, 1)) * 100)));
    return `linear-gradient(180deg,
      #cdd85a 0%,
      #c0d052 14%,
      #b2c64a 30%,
      #9fbb42 48%,
      #8aad3c 64%,
      #7a9f38 ${horizonPct}%,
      #6b9234 100%)`;
  }, [groundY, height]);

  const decor = createSeededRandom(`${stableSeed}:terrarium-decor:${width}:${height}`);
  const moth = createSeededRandom(`${stableSeed}:terrarium-moth:${width}:${height}`);
  const bug = createSeededRandom(`${stableSeed}:terrarium-bug:${width}:${height}`);

  const mothStartX = moth() > 0.5 ? width * 0.14 + moth() * 30 : width * 0.48 + moth() * 48;

  const ladyPath = [
    width * (0.1 + bug() * 0.04),
    width * (0.35 + bug() * 0.04),
    width * (0.52 + bug() * 0.06),
    width * (0.14 + bug() * 0.04),
  ];

  const frogLeft = width * (0.38 + bug() * 0.22);
  const snailLaneY = Math.min(height - 18, groundY + soilHeight * 0.52);
  const bugBandY = Math.min(height - 12, groundY + soilHeight * 0.35);

  return (
    <MotionConfig reducedMotion="never">
      <div
        className={cn(
          "relative h-full min-h-[inherit] w-full overflow-visible rounded-[inherit] text-neutral-900",
          className
        )}
        style={{ background: meadowGradient }}
        ref={containerRef}
      >
        <div
          className="relative z-0 overflow-hidden rounded-[inherit]"
          style={{ width: "100%", height, background: meadowGradient }}
        >
          {Array.from({ length: MOTE_COUNT }).map((_, i) => {
            const x = 12 + decor() * (width - 24);
            const yBase = 10 + decor() * (height * 0.52);
            const driftX = (decor() - 0.5) * 30;
            const dur = 14 + decor() * 16;
            const delay = decor() * 5;
            return (
              <motion.span
                key={`mote-${i}`}
                initial={{ x, y: yBase, opacity: 0 }}
                animate={{
                  x: [x, x + driftX],
                  y: [yBase, yBase - height * 0.08],
                  opacity: [0, 0.2, 0.12, 0],
                }}
                transition={{
                  duration: dur,
                  repeat: Infinity,
                  delay,
                  ease: "linear",
                }}
                style={{
                  position: "absolute",
                  width: 3,
                  height: 3,
                  borderRadius: "50%",
                  backgroundColor: "rgba(255,255,255,0.72)",
                  willChange: "transform, opacity",
                }}
                className="pointer-events-none z-10 select-none"
                aria-hidden
              />
            );
          })}

          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[1]"
            style={{
              height: soilHeight,
              background:
                "linear-gradient(180deg, #6b5a48 0%, #5c4d40 18%, #4a3f36 100%)",
              boxShadow: "inset 0 10px 14px rgba(72,58,46,0.45)",
            }}
            aria-hidden
          />

          {grassTufts.map((tuft, i) => {
            const top = groundY - tuft.size * (tuft.layer === 1 ? 0.72 : 0.88);
            return (
              <motion.span
                key={`grass-${i}`}
                className="z-[12] select-none"
                initial={{ opacity: 0, rotate: tuft.baseRotate }}
                animate={{
                  opacity: 1,
                  rotate: foliageRotateKeyframes(tuft.baseRotate, tuft.swayAmp),
                }}
                transition={{
                  opacity: { duration: 0.45, ease: "easeOut" },
                  rotate: {
                    duration: tuft.swayDur,
                    repeat: Infinity,
                    ease: FOLIAGE_SWAY_EASE,
                    delay: tuft.delay,
                  },
                }}
                style={{
                  position: "absolute",
                  left: tuft.x,
                  top,
                  transformOrigin: "bottom center",
                  willChange: "transform",
                  filter: "drop-shadow(0 1px 1px rgba(40,55,35,0.25))",
                }}
              >
                <Emoji emoji={tuft.emoji} size={tuft.size} />
              </motion.span>
            );
          })}

          {Array.from({ length: ROCK_COUNT }).map((_, i) => {
            const x = floorXs[i] ?? 14 + decor() * (width - 28);
            const sizePx = 20 + Math.round(decor() * 13);
            const yPos =
              groundY + 4 + decor() * Math.max(2, soilHeight - sizePx - 16);
            const swaySeed = decor();
            const sway = (swaySeed - 0.5) * 3;
            const rotDur = 7 + decor() * 8;
            return (
              <motion.span
                key={`rock-${i}`}
                className="z-[15] select-none"
                initial={{ opacity: 0, y: yPos + 14 }}
                animate={{
                  opacity: 1,
                  y: yPos,
                  rotate: [sway - 2.5, sway + 2.5, sway - 2.5],
                }}
                transition={{
                  opacity: { duration: 0.45, delay: 0.05 * i },
                  y: { type: "spring", stiffness: 420, damping: 22 },
                  rotate: {
                    duration: rotDur,
                    repeat: Infinity,
                    ease: "easeInOut",
                  },
                }}
                style={{ position: "absolute", left: x }}
              >
                <Emoji emoji="🪨" size={sizePx} />
              </motion.span>
            );
          })}

          {plantSprites.map((plant, i) => (
            <motion.span
              key={`plant-${i}`}
              className="z-20 select-none"
              initial={{ opacity: 0, rotate: plant.baseRotate }}
              animate={{
                opacity: 1,
                rotate: foliageRotateKeyframes(plant.baseRotate, plant.swayAmp),
              }}
              transition={{
                opacity: { duration: 0.45, ease: "easeOut" },
                rotate: {
                  duration: plant.swayDur,
                  repeat: Infinity,
                  ease: FOLIAGE_SWAY_EASE,
                  delay: plant.delay,
                },
              }}
              style={{
                position: "absolute",
                left: plant.x,
                top: plant.top,
                transformOrigin: "bottom center",
                willChange: "transform",
              }}
            >
              <Emoji emoji={plant.emoji} size={plant.sizePx} />
            </motion.span>
          ))}

          <motion.span
            key="bfly"
            className="z-25 select-none"
            initial={{
              x: mothStartX,
              y: groundY - 62 - moth() * (height * 0.06),
              rotate: moth() > 0.5 ? 9 : -8,
              scaleX: 1,
            }}
            animate={{
              x: [
                mothStartX,
                mothStartX + width * 0.32,
                mothStartX - width * 0.05,
              ],
              y: [
                groundY - 54,
                groundY - height * 0.4,
                groundY - 48,
              ],
              rotate: [6, -7, 5, -6],
              scaleX: [1, -1, -1, 1],
            }}
            transition={{
              duration: 24 + moth() * 16,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            style={{ position: "absolute", left: 0 }}
          >
            <Emoji emoji="🦋" size={26} />
          </motion.span>

          <motion.span
            className="z-26 select-none"
            initial={{ x: -42 + bug() * 18 }}
            animate={{ x: [-42, width + 42] }}
            transition={{
              duration: 42 + bug() * 28,
              repeat: Infinity,
              ease: "linear",
              delay: bug() * 4,
            }}
            style={{
              position: "absolute",
              left: 0,
              top: snailLaneY,
              filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.25))",
            }}
          >
            <Emoji emoji="🐌" size={26} />
          </motion.span>

          <motion.span
            className="z-27 select-none"
            style={{
              position: "absolute",
              left: frogLeft,
              top: bugBandY + 10,
              filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.2))",
            }}
            animate={{
              y: [0, -8, 0],
              scale: [1, 1.05, 1],
            }}
            transition={{
              duration: 6 + bug() * 3,
              repeat: Infinity,
              ease: [0.45, 0, 0.55, 1],
              delay: bug() * 2,
            }}
          >
            <Emoji emoji="🐸" size={26} />
          </motion.span>

          <motion.span
            className="z-28 select-none"
            initial={{
              x: ladyPath[0],
              y: bugBandY,
              rotate: bug() > 0.5 ? 14 : -10,
            }}
            animate={{
              x: ladyPath,
              rotate: [10, -10, 8, -8],
              y: [bugBandY, bugBandY + 2, bugBandY, bugBandY + 1],
            }}
            transition={{
              duration: 54 + bug() * 30,
              repeat: Infinity,
              ease: "linear",
              delay: bug() * 8,
            }}
            style={{
              position: "absolute",
              left: 0,
              filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.2))",
            }}
          >
            <Emoji emoji="🐞" size={22} />
          </motion.span>

          {Array.from({ length: 6 }).map((_, i) => {
            const x = 16 + decor() * (width - 32);
            const yMin = 12;
            const yMax = Math.max(yMin + 28, groundY - 42);
            const y = yMin + decor() * (yMax - yMin);
            const roam = 22 + decor() * 36;
            const baseDur = 8 + decor() * 10;
            const blinkDur = 2.8 + decor() * 1.8;
            return (
              <motion.span
                key={`ffi-${i}`}
                initial={{ x, y }}
                animate={{
                  x: [x, x + roam * 0.4, x - roam * 0.32, x],
                  y: [y, y - roam * 0.16, y + roam * 0.06, y],
                  opacity: [0.22, 0.88, 0.5, 0.28],
                }}
                transition={{
                  duration: baseDur,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: i * 1.2 + decor() * 3,
                  opacity: { duration: blinkDur, repeat: Infinity },
                }}
                style={{
                  position: "absolute",
                  left: 0,
                  willChange: "transform, opacity",
                  filter:
                    "drop-shadow(0 0 8px rgba(255,246,205,0.45)) drop-shadow(0 0 2px rgba(255,220,140,0.35))",
                }}
                className="select-none z-[38]"
              >
                <Emoji emoji={FIREFLY_EMOJI} size={16 + Math.round(decor() * 10)} />
              </motion.span>
            );
          })}
        </div>
      </div>
    </MotionConfig>
  );
}

export default EmojiTerrarium;
