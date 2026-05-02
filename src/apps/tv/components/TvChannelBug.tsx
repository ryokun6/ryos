import { memo, useEffect, type CSSProperties } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ChannelLogoCorner } from "@/apps/tv/data/channels";

type ChannelBugAnimationControls = ReturnType<typeof useAnimationControls>;

const CHANNEL_BUG_BASE_OPACITY = 0.9;
const CHANNEL_BUG_FIRST_BURST_MIN_MS = 1500;
const CHANNEL_BUG_FIRST_BURST_RANGE_MS = 3000;
const CHANNEL_BUG_BURST_MIN_MS = 15000;
const CHANNEL_BUG_BURST_RANGE_MS = 15000;

type ChannelBugBurst = {
  run: (
    main: ChannelBugAnimationControls,
    shine: ChannelBugAnimationControls
  ) => Promise<void>;
};

const CHANNEL_BUG_SPIN_BURST: ChannelBugBurst = {
  run: async (main) => {
    await main.start({
      rotateY: [0, 360, 720],
      transition: {
        duration: 2.4,
        times: [0, 0.5, 1],
        ease: "easeInOut",
      },
    });
    main.set({ rotateY: 0 });
  },
};

const CHANNEL_BUG_WATERMARK_BURST: ChannelBugBurst = {
  run: async (main) => {
    await main.start({
      opacity: [
        CHANNEL_BUG_BASE_OPACITY,
        0,
        0,
        CHANNEL_BUG_BASE_OPACITY,
      ],
      scale: [1, 0.92, 0.92, 1],
      transition: {
        duration: 8,
        times: [0, 0.15, 0.85, 1],
        ease: "easeInOut",
      },
    });
  },
};

const CHANNEL_BUG_SHIMMER_BURST: ChannelBugBurst = {
  run: async (_main, shine) => {
    await shine.start({
      x: ["-120%", "220%"],
      opacity: [0, 1, 1, 0],
      transition: {
        duration: 2.8,
        times: [0, 0.15, 0.85, 1],
        ease: "easeInOut",
      },
    });
    shine.set({ x: "-120%", opacity: 0 });
  },
};

const CHANNEL_BUG_BURSTS: readonly ChannelBugBurst[] = [
  CHANNEL_BUG_SPIN_BURST,
  CHANNEL_BUG_WATERMARK_BURST,
  CHANNEL_BUG_SHIMMER_BURST,
];

function pickChannelBugBurst(): ChannelBugBurst {
  const index = Math.floor(Math.random() * CHANNEL_BUG_BURSTS.length);
  return CHANNEL_BUG_BURSTS[index];
}

const CHANNEL_BUG_FADE_IN_TRANSITION = { duration: 0.25 } as const;
const CHANNEL_BUG_INITIAL = { opacity: 0 } as const;

const CHANNEL_BUG_CORNER_CLASS: Record<ChannelLogoCorner, string> = {
  "top-left": "top-[1.5%] left-[4%]",
  "top-right": "top-[1.5%] right-[4%]",
  "bottom-right": "bottom-[1.5%] right-[4%]",
};

export const TvChannelBug = memo(function TvChannelBug({
  src,
  corner,
}: {
  src: string;
  corner: ChannelLogoCorner;
}) {
  const controls = useAnimationControls();
  const shineControls = useAnimationControls();

  useEffect(() => {
    let timeoutId: number | null = null;
    let cancelled = false;

    void controls.start({
      opacity: CHANNEL_BUG_BASE_OPACITY,
      transition: CHANNEL_BUG_FADE_IN_TRANSITION,
    });

    const runBurst = async () => {
      if (cancelled) return;
      const burst = pickChannelBugBurst();
      try {
        await burst.run(controls, shineControls);
      } catch {
        // Animation cancelled by unmount.
      }
    };

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      timeoutId = window.setTimeout(async () => {
        await runBurst();
        if (cancelled) return;
        schedule(
          CHANNEL_BUG_BURST_MIN_MS +
            Math.random() * CHANNEL_BUG_BURST_RANGE_MS
        );
      }, delayMs);
    };

    schedule(
      CHANNEL_BUG_FIRST_BURST_MIN_MS +
        Math.random() * CHANNEL_BUG_FIRST_BURST_RANGE_MS
    );

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      controls.stop();
      shineControls.stop();
    };
  }, [controls, shineControls]);

  const maskStyle: CSSProperties = {
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
  };

  return (
    <motion.div
      initial={CHANNEL_BUG_INITIAL}
      animate={controls}
      style={{
        transformPerspective: 600,
        backfaceVisibility: "hidden",
      }}
      className={cn(
        "absolute z-[25] w-[20%] aspect-square min-w-[64px] max-w-[240px] pointer-events-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]",
        CHANNEL_BUG_CORNER_CLASS[corner]
      )}
    >
      <img
        src={src}
        alt=""
        aria-hidden
        draggable={false}
        className="w-full h-full object-contain select-none"
      />
      <div
        aria-hidden
        className="absolute inset-0 overflow-hidden pointer-events-none"
        style={maskStyle}
      >
        <motion.div
          initial={{ x: "-120%", skewX: -20, opacity: 0 }}
          animate={shineControls}
          className="absolute top-0 left-0 h-full w-[45%]"
          style={{
            background:
              "linear-gradient(to right, transparent 0%, rgba(255,255,255,0.95) 50%, transparent 100%)",
            mixBlendMode: "overlay",
            filter: "blur(2px)",
          }}
        />
      </div>
    </motion.div>
  );
});
