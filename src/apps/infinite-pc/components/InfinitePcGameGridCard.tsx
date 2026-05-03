import { useState } from "react";
import { motion } from "framer-motion";
import type { Game } from "@/stores/usePcStore";
import { GAME_AVERAGE_COLORS } from "@/apps/pc/gameAverageColors.generated";

const FALLBACK_RGB = "169,175,190";

export function InfinitePcGameGridCard({
  game,
  onSelect,
}: {
  game: Game;
  onSelect: () => void;
}) {
  const [thumbError, setThumbError] = useState(false);
  const showThumb = !thumbError;
  const textShadow = "0 2px 6px rgba(0,0,0,1), 0 0 12px rgba(0,0,0,0.8)";
  const rgb = GAME_AVERAGE_COLORS[game.id] ?? FALLBACK_RGB;
  const bgColor = `rgb(${rgb})`;
  const overlayColor = `rgba(${rgb},0.5)`;

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      className="group relative rounded overflow-hidden bg-neutral-800 hover:bg-neutral-700 transition-all duration-200 w-full flex flex-col shrink-0 h-[100px] [box-shadow:0_4px_12px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05)] hover:[box-shadow:0_8px_24px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.12)]"
      whileTap={{
        scale: 0.97,
        y: 0,
        transition: { type: "spring", duration: 0.15 },
      }}
    >
      <div
        className="w-full flex-1 min-h-0 relative shrink-0 overflow-hidden"
        style={{ backgroundColor: bgColor }}
      >
        {showThumb ? (
          <img
            src={game.image}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-[800ms] ease-out group-hover:scale-105"
            onError={() => setThumbError(true)}
          />
        ) : null}
        <div
          className="absolute inset-0 pointer-events-none opacity-0 transition-opacity duration-200 group-hover:opacity-20"
          style={{ backgroundColor: overlayColor }}
          aria-hidden
        />
      </div>
      <div
        className="absolute inset-0 pointer-events-none z-[1]"
        style={{
          background: `linear-gradient(to top, ${bgColor} 0%, transparent 55%)`,
        }}
        aria-hidden
      />
      <div className="absolute bottom-0 left-2 right-2 pt-2 pb-2 flex flex-col items-start gap-0.5 @md:flex-row @md:justify-between @md:items-baseline z-10 pointer-events-none">
        <span
          className="text-white font-apple-garamond !text-[18px] leading-tight truncate max-w-full"
          style={{ textShadow }}
        >
          {game.name}
        </span>
        <span
          className="text-neutral-300 text-[10px] shrink-0 opacity-100 @md:opacity-0 transition-opacity duration-200 @md:group-hover:opacity-100"
          style={{ textShadow }}
        >
          {game.year}
        </span>
      </div>
    </motion.button>
  );
}
