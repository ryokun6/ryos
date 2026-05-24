import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useReducedMotion } from "framer-motion";
import {
  REACTION_LIFETIME_MS,
  generateAmbientReactionPhysics,
  randomAmbientReactionId,
} from "@/components/listen/reactionFloaterConstants";
import {
  ReactionFloaterLayer,
  type ReactionFloaterItem,
} from "@/components/listen/ReactionFloaterLayer";

const MAX_VISIBLE = 11;
const IDLE_CLEAR_MS = 120;

interface KtvAmbientReactionsProps {
  enabled: boolean;
  isPlaying: boolean;
}

/**
 * Subtle simulated “room” reactions for solo fullscreen karaoke – complements
 * real {@link ReactionOverlay} when in a listen session.
 */
export function KtvAmbientReactions({ enabled, isPlaying }: KtvAmbientReactionsProps) {
  const reduceMotion = useReducedMotion();
  const [items, setItems] = useState<ReactionFloaterItem[]>([]);
  const timeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const scheduleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSchedule = useCallback(() => {
    if (scheduleRef.current !== null) {
      clearTimeout(scheduleRef.current);
      scheduleRef.current = null;
    }
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
    const t = timeoutsRef.current[id];
    if (t) {
      clearTimeout(t);
      delete timeoutsRef.current[id];
    }
  }, []);

  const spawnBurst = useCallback(() => {
    if (!enabled || !isPlaying || reduceMotion) return;

    const roll = Math.random();
    const count = roll < 0.74 ? 1 : roll < 0.96 ? 2 : 3;
    let toRegister: ReactionFloaterItem[] = [];

    setItems((prev) => {
      const headroom = Math.min(count, 3);
      const trimmed =
        prev.length >= MAX_VISIBLE ? prev.slice(-(MAX_VISIBLE - headroom)) : prev;
      const toAdd: ReactionFloaterItem[] = [];

      const makeId = () =>
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? `ktv-amb-${crypto.randomUUID()}`
          : `ktv-amb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      for (
        let i = 0;
        i < count && trimmed.length + toAdd.length < MAX_VISIBLE + 2;
        i++
      ) {
        const id = makeId();
        toAdd.push({
          id,
          emoji: randomAmbientReactionId(),
          peakOpacity: 0.34 + Math.random() * 0.26,
          ...generateAmbientReactionPhysics(),
        });
      }

      toRegister = toAdd;
      return [...trimmed, ...toAdd].slice(-MAX_VISIBLE - 2);
    });

    for (const item of toRegister) {
      timeoutsRef.current[item.id] = setTimeout(
        () => removeItem(item.id),
        REACTION_LIFETIME_MS
      );
    }
  }, [enabled, isPlaying, reduceMotion, removeItem]);

  useEffect(() => {
    if (!enabled || !isPlaying || reduceMotion) {
      clearSchedule();
      timeoutsRef.current = {};
      setItems([]);
      return;
    }

    const kickoff = window.setTimeout(() => {
      spawnBurst();
    }, 600 + Math.random() * 1600);

    const loop = () => {
      clearSchedule();
      const delay = 3200 + Math.random() * 5400;
      scheduleRef.current = setTimeout(() => {
        spawnBurst();
        loop();
      }, delay);
    };
    loop();

    return () => {
      clearTimeout(kickoff);
      clearSchedule();
    };
  }, [enabled, isPlaying, reduceMotion, spawnBurst, clearSchedule]);

  // When toggled off, release timers quickly without waiting for exits
  useEffect(() => {
    if (!enabled) {
      clearSchedule();
      Object.values(timeoutsRef.current).forEach(clearTimeout);
      timeoutsRef.current = {};
      const t = window.setTimeout(() => setItems([]), IDLE_CLEAR_MS);
      return () => clearTimeout(t);
    }
  }, [enabled, clearSchedule]);

  useEffect(() => {
    return () => {
      clearSchedule();
      Object.values(timeoutsRef.current).forEach(clearTimeout);
    };
  }, [clearSchedule]);

  if (!enabled || reduceMotion || items.length === 0) {
    return null;
  }

  return (
    <ReactionFloaterLayer items={items} position="absolute" className="z-[15]" />
  );
}
