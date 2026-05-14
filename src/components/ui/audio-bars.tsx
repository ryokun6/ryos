import { motion } from "framer-motion";

interface AudioBarsProps {
  frequencies: number[];
  className?: string;
  color?: "white" | "black";
  isSilent?: boolean;
}

export function AudioBars({
  frequencies,
  className = "",
  color = "white",
  isSilent = false,
}: AudioBarsProps) {
  const MIN_SCALE = 0.4;
  const bars = frequencies.map((freq, position) => ({
    freq,
    barKey: `bar-${position + 1}`,
  }));

  return (
    <div
      className={`flex gap-[2px] items-center justify-center h-full ${className}`}
      style={{ opacity: isSilent ? 0.4 : 1 }}
    >
      {bars.map((bar) => (
        <motion.div
          key={bar.barKey}
          className={`w-[2px] rounded-full origin-center ${
            color === "white" ? "bg-white" : "bg-black"
          }`}
          initial={{ scaleY: MIN_SCALE }}
          animate={{
            scaleY: isSilent ? MIN_SCALE : Math.max(MIN_SCALE, bar.freq * 2),
          }}
          style={{
            height: 12,
          }}
          transition={{
            type: "spring",
            bounce: 0.45,
            duration: 0.15,
          }}
        />
      ))}
    </div>
  );
}
