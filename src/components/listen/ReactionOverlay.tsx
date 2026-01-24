import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  useListenSessionStore,
  type ListenReactionPayload,
} from "@/stores/useListenSessionStore";
import {
  Smiley,
  Fire,
  HandsClapping,
  Heart,
  MusicNote,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

interface ReactionOverlayProps {
  className?: string;
}

type VisibleReaction = ListenReactionPayload & {
  xOffset: number;
  scale: number;
  floatHeight: number;
  wobble: number;
  duration: number;
};

const REACTION_LIFETIME_MS = 2500;

// Map reaction IDs to icons and colors
const REACTION_MAP: Record<string, { icon: Icon; color: string }> = {
  smile: { icon: Smiley, color: "text-yellow-400" },
  fire: { icon: Fire, color: "text-orange-500" },
  clap: { icon: HandsClapping, color: "text-amber-400" },
  heart: { icon: Heart, color: "text-red-500" },
  music: { icon: MusicNote, color: "text-purple-400" },
};

// Generate random values for each reaction to make them look organic
function generateReactionStyle(): Omit<VisibleReaction, keyof ListenReactionPayload> {
  return {
    xOffset: (Math.random() - 0.5) * 120,  // Spread horizontally
    scale: 0.8 + Math.random() * 0.6,       // Random size (0.8-1.4)
    floatHeight: 120 + Math.random() * 80,  // How high it floats (120-200px)
    wobble: (Math.random() - 0.5) * 30,     // Side wobble during animation
    duration: 1.8 + Math.random() * 0.8,    // Animation duration (1.8-2.6s)
  };
}

export function ReactionOverlay({ className }: ReactionOverlayProps) {
  const reactions = useListenSessionStore((state) => state.reactions);
  const [visible, setVisible] = useState<VisibleReaction[]>([]);
  const timeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Track all processed reaction IDs to prevent re-showing after animation completes
  const processedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Filter to only truly new reactions (not yet processed)
    const newReactions = reactions.filter(
      (reaction) => !processedIdsRef.current.has(reaction.id)
    );
    if (newReactions.length === 0) return;

    // Mark these as processed immediately
    newReactions.forEach((reaction) => {
      processedIdsRef.current.add(reaction.id);
    });

    // Limit processed IDs set size to prevent memory leak
    if (processedIdsRef.current.size > 100) {
      const idsArray = Array.from(processedIdsRef.current);
      processedIdsRef.current = new Set(idsArray.slice(-50));
    }

    setVisible((prev) => [
      ...prev,
      ...newReactions.map((reaction) => ({
        ...reaction,
        ...generateReactionStyle(),
      })),
    ]);

    newReactions.forEach((reaction) => {
      const timeout = setTimeout(() => {
        setVisible((prev) => prev.filter((item) => item.id !== reaction.id));
        delete timeoutsRef.current[reaction.id];
      }, REACTION_LIFETIME_MS);
      timeoutsRef.current[reaction.id] = timeout;
    });
  }, [reactions]);

  useEffect(() => {
    return () => {
      Object.values(timeoutsRef.current).forEach((timeout) => clearTimeout(timeout));
      timeoutsRef.current = {};
    };
  }, []);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className
      )}
    >
      <div className="absolute bottom-0 left-0 right-0 flex justify-center">
        <AnimatePresence>
          {visible.map((reaction) => {
            const reactionDef = REACTION_MAP[reaction.emoji];
            if (!reactionDef) return null;
            const IconComponent = reactionDef.icon;
            const iconSize = Math.round(24 * reaction.scale);
            
            return (
              <motion.div
                key={reaction.id}
                initial={{
                  opacity: 0,
                  y: 20,
                  x: reaction.xOffset,
                  scale: 0.5,
                }}
                animate={{
                  opacity: [0, 1, 1, 0],
                  y: [20, -reaction.floatHeight * 0.3, -reaction.floatHeight * 0.7, -reaction.floatHeight],
                  x: [reaction.xOffset, reaction.xOffset + reaction.wobble, reaction.xOffset - reaction.wobble * 0.5, reaction.xOffset + reaction.wobble * 0.3],
                  scale: [0.5, reaction.scale, reaction.scale * 0.9, reaction.scale * 0.7],
                }}
                exit={{
                  opacity: 0,
                  scale: 0,
                }}
                transition={{
                  duration: reaction.duration,
                  ease: "easeOut",
                  times: [0, 0.2, 0.6, 1],
                }}
                className="absolute select-none"
                style={{
                  filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.3))",
                }}
              >
                <IconComponent
                  weight="fill"
                  size={iconSize}
                  className={reactionDef.color}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
