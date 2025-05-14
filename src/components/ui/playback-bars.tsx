import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface PlaybackBarsProps {
  className?: string;
  color?: "white" | "black";
  /** Number of bars to render (default 5) */
  barCount?: number;
}

/**
 * Simple animated equalizer bars used to show audio playback.
 */
export function PlaybackBars({
  className = "",
  color = "white",
  barCount = 5,
}: PlaybackBarsProps) {
  const MIN_SCALE = 0.2;
  const [randomScales, setRandomScales] = useState<number[][]>([]);
  const [randomDurations, setRandomDurations] = useState<number[]>([]);

  // Generate random animation values on mount
  useEffect(() => {
    // Create random animation targets for each bar
    const scales = Array.from({ length: barCount }).map(() => {
      // Generate 3-5 random points for each bar animation
      const pointCount = Math.floor(Math.random() * 3) + 3;
      return Array.from({ length: pointCount }).map(
        () => MIN_SCALE + Math.random() * (1 - MIN_SCALE)
      );
    });

    // Create random durations for each bar
    const durations = Array.from({ length: barCount }).map(
      () => 0.7 + Math.random() * 0.6
    );

    setRandomScales(scales);
    setRandomDurations(durations);
  }, [barCount]);

  return (
    <div
      className={`flex gap-[2px] items-center justify-center h-full ${className}`}
    >
      {Array.from({ length: barCount }).map((_, index) => (
        <motion.div
          key={index}
          className={`w-[2px] rounded-full ${
            color === "white" ? "bg-white" : "bg-black"
          }`}
          initial={{ scaleY: MIN_SCALE }}
          animate={{
            scaleY: randomScales[index] || [MIN_SCALE, 0.7, MIN_SCALE],
          }}
          transition={{
            duration: randomDurations[index] || 0.9,
            repeat: Infinity,
            repeatType: "reverse",
            ease: "easeInOut",
            delay: Math.random() * 0.5,
          }}
          style={{ height: 12 }}
        />
      ))}
    </div>
  );
}
