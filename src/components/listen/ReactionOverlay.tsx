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

type VisibleReaction = ListenReactionPayload & { xOffset: number };

const REACTION_LIFETIME_MS = 2000;

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
        xOffset: (Math.random() - 0.5) * 80,
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
    <div className={cn("pointer-events-none absolute inset-0 flex items-end justify-center", className)}>
      <AnimatePresence>
        {visible.map((reaction) => (
          <motion.div
            key={reaction.id}
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: -40 }}
            exit={{ opacity: 0, y: -80 }}
            transition={{ duration: 0.6 }}
            style={{ transform: `translateX(${reaction.xOffset}px)` }}
            className="text-2xl mb-8 select-none"
          >
            {reaction.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
