import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ListenReactionPayload } from "@/shared/contracts/listen";
import {
  REACTION_LIFETIME_MS,
  generateSessionReactionPhysics,
  type ReactionFloaterPhysics,
} from "@/components/listen/reactionFloaterConstants";
import {
  ReactionFloaterLayer,
  type ReactionFloaterItem,
} from "@/components/listen/ReactionFloaterLayer";
import { useListenSessionStore } from "@/stores/useListenSessionStore";

interface ReactionOverlayProps {
  className?: string;
}

type VisibleReaction = ListenReactionPayload & ReactionFloaterPhysics;

export function ReactionOverlay({ className }: ReactionOverlayProps) {
  const reactions = useListenSessionStore((state) => state.reactions);
  const [visible, setVisible] = useState<VisibleReaction[]>([]);
  const timeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const processedIdsRef = useRef<Set<string>>(new Set());

  const scheduleReactionRemoval = useCallback((reactionId: string) => {
    const timeout = setTimeout(() => {
      setVisible((prev) => prev.filter((item) => item.id !== reactionId));
      delete timeoutsRef.current[reactionId];
    }, REACTION_LIFETIME_MS);
    timeoutsRef.current[reactionId] = timeout;
  }, []);

  useEffect(() => {
    const newReactions = reactions.filter((reaction) => !processedIdsRef.current.has(reaction.id));
    if (newReactions.length === 0) return;

    newReactions.forEach((reaction) => {
      processedIdsRef.current.add(reaction.id);
    });

    if (processedIdsRef.current.size > 100) {
      const idsArray = Array.from(processedIdsRef.current);
      processedIdsRef.current = new Set(idsArray.slice(-50));
    }

    setVisible((prev) => [
      ...prev,
      ...newReactions.map((reaction) => ({
        ...reaction,
        ...generateSessionReactionPhysics(),
      })),
    ]);

    newReactions.forEach((reaction) => {
      scheduleReactionRemoval(reaction.id);
    });
  }, [reactions, scheduleReactionRemoval]);

  useEffect(() => {
    return () => {
      Object.values(timeoutsRef.current).forEach((timeout) => clearTimeout(timeout));
      timeoutsRef.current = {};
    };
  }, []);

  const itemsForLayer: ReactionFloaterItem[] = visible.map((r) => ({
    id: r.id,
    emoji: r.emoji,
    xOffset: r.xOffset,
    scale: r.scale,
    floatHeight: r.floatHeight,
    wobble: r.wobble,
    duration: r.duration,
    peakOpacity: 0.93,
  }));

  return (
    <ReactionFloaterLayer
      className={cn(className)}
      position="absolute"
      items={itemsForLayer}
    />
  );
}
