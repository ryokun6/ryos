import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { REACTION_MAP, type ReactionFloaterPhysics } from "./reactionFloaterConstants";

export interface ReactionFloaterItem extends ReactionFloaterPhysics {
  id: string;
  emoji: string;
  /** Peak opacity in animation keyframes — session reactions read bolder than ambient */
  peakOpacity?: number;
}

interface ReactionFloaterLayerProps {
  className?: string;
  /** Render as fixed (fullscreen portal root) vs absolute stack child */
  position?: "absolute" | "fixed";
  items: ReactionFloaterItem[];
}

export function ReactionFloaterLayer({
  className,
  items,
  position = "absolute",
}: ReactionFloaterLayerProps) {
  const posCls = position === "fixed" ? "fixed inset-0" : "absolute inset-0";

  return (
    <div
      className={cn(
        "pointer-events-none overflow-hidden bg-transparent",
        posCls,
        className
      )}
    >
      <div className="absolute bottom-0 left-0 right-0 flex justify-center">
        <AnimatePresence initial={false}>
          {items.map((reaction) => {
            const reactionDef = REACTION_MAP[reaction.emoji];
            if (!reactionDef) return null;
            const IconComponent = reactionDef.icon;
            const iconSize = Math.round(22 * reaction.scale);
            const peak = reaction.peakOpacity ?? 0.92;

            return (
              <motion.div
                key={reaction.id}
                initial={{
                  opacity: 0,
                  y: 16,
                  x: reaction.xOffset,
                  scale: 0.42,
                }}
                animate={{
                  opacity: [0, peak * 0.9, peak * 0.72, 0],
                  y: [
                    14,
                    -reaction.floatHeight * 0.34,
                    -reaction.floatHeight * 0.68,
                    -reaction.floatHeight,
                  ],
                  x: [
                    reaction.xOffset,
                    reaction.xOffset + reaction.wobble,
                    reaction.xOffset - reaction.wobble * 0.55,
                    reaction.xOffset + reaction.wobble * 0.28,
                  ],
                  scale: [
                    0.45,
                    reaction.scale,
                    reaction.scale * 0.88,
                    reaction.scale * 0.66,
                  ],
                }}
                exit={{
                  opacity: 0,
                  scale: 0.35,
                }}
                transition={{
                  duration: reaction.duration,
                  ease: "easeOut",
                  times: [0, 0.18, 0.54, 1],
                }}
                className="absolute select-none will-change-[transform,opacity]"
                style={{
                  filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.28))",
                }}
              >
                <IconComponent weight="fill" size={iconSize} className={reactionDef.color} />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
