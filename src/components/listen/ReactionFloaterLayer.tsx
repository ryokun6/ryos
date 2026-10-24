import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { scaleSessionReactionMotion } from "./fullscreenReactionScale";
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
  /**
   * Viewport multiplier for fullscreen listen reactions. 1 keeps the
   * windowed glyph size and float distance.
   */
  viewportScale?: number;
  /** Used above scale 1 so a grown glyph stays inside the screen. */
  viewport?: { width: number; height: number };
}

export function ReactionFloaterLayer({
  className,
  items,
  position = "absolute",
  viewportScale = 1,
  viewport,
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
            const motionScale = scaleSessionReactionMotion(
              reaction,
              viewportScale,
              viewport,
            );
            const iconSize = motionScale.iconSize;
            const peak = reaction.peakOpacity ?? 0.92;

            return (
              <motion.div
                key={reaction.id}
                initial={{
                  opacity: 0,
                  y: motionScale.enterOffset,
                  x: motionScale.xOffset,
                  scale: 0.42,
                }}
                animate={{
                  opacity: [0, peak * 0.9, peak * 0.72, 0],
                  y: [
                    motionScale.enterKeyframe,
                    -motionScale.floatHeight * 0.34,
                    -motionScale.floatHeight * 0.68,
                    -motionScale.floatHeight,
                  ],
                  x: [
                    motionScale.xOffset,
                    motionScale.xOffset + motionScale.wobble,
                    motionScale.xOffset - motionScale.wobble * 0.55,
                    motionScale.xOffset + motionScale.wobble * 0.28,
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
