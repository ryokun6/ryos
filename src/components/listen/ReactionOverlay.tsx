import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  useListenSessionStore,
  type ListenReactionPayload,
} from "@/stores/useListenSessionStore";

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

  const visibleIds = useMemo(() => new Set(visible.map((item) => item.id)), [visible]);

  useEffect(() => {
    const newReactions = reactions.filter((reaction) => !visibleIds.has(reaction.id));
    if (newReactions.length === 0) return;

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
  }, [reactions, visibleIds]);

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
          {visible.map((reaction) => (
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
              className="absolute select-none drop-shadow-lg"
              style={{
                fontSize: `${1.5 * reaction.scale}rem`,
                filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.2))",
              }}
            >
              {reaction.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
