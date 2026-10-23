import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ListenReactionPayload } from "@/shared/contracts/listen";
import {
  FULLSCREEN_LYRICS_FONT_MIN_PX,
  fullscreenLyricsScale,
  fullscreenLyricsScaleFromFontSizePx,
} from "@/components/listen/fullscreenReactionScale";
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
  /**
   * Size glyphs and float distance with `.fullscreen-lyrics-text`.
   * Windowed overlays leave this off.
   */
  matchFullscreenLyrics?: boolean;
}

function readViewport(): { width: number; height: number } {
  if (typeof window === "undefined") return { width: 0, height: 0 };
  return { width: window.innerWidth, height: window.innerHeight };
}

function useFullscreenLyricsScale(enabled: boolean) {
  const probeRef = useRef<HTMLSpanElement>(null);
  const [viewport, setViewport] = useState(readViewport);
  const [scale, setScale] = useState(() => {
    const size = readViewport();
    return enabled ? fullscreenLyricsScale(size.width, size.height) : 1;
  });

  useLayoutEffect(() => {
    if (!enabled) return;
    const read = () => {
      const next = readViewport();
      const probePx = probeRef.current
        ? Number.parseFloat(getComputedStyle(probeRef.current).fontSize)
        : Number.NaN;
      // Trust the probe only when `.fullscreen-lyrics-text` actually applied.
      // The clamp never goes below 32px; a smaller used size is inherited text.
      const nextScale =
        Number.isFinite(probePx) && probePx + 0.5 >= FULLSCREEN_LYRICS_FONT_MIN_PX
          ? fullscreenLyricsScaleFromFontSizePx(probePx)
          : fullscreenLyricsScale(next.width, next.height);
      setViewport((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : next,
      );
      setScale((prev) => (prev === nextScale ? prev : nextScale));
    };
    read();
    window.addEventListener("resize", read);
    const observer = new ResizeObserver(read);
    observer.observe(document.documentElement);
    return () => {
      window.removeEventListener("resize", read);
      observer.disconnect();
    };
  }, [enabled]);

  return {
    scale: enabled ? scale : 1,
    viewport: enabled ? viewport : undefined,
    probeRef,
  };
}

type VisibleReaction = ListenReactionPayload & ReactionFloaterPhysics;

export function ReactionOverlay({
  className,
  matchFullscreenLyrics = false,
}: ReactionOverlayProps) {
  const reactions = useListenSessionStore((state) => state.reactions);
  const { scale, viewport, probeRef } = useFullscreenLyricsScale(matchFullscreenLyrics);
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
    <>
      {matchFullscreenLyrics ? (
        <span
          ref={probeRef}
          aria-hidden
          data-fullscreen-lyrics-probe=""
          data-reaction-viewport-scale={scale.toFixed(3)}
          className="fullscreen-lyrics-text pointer-events-none absolute"
          style={{
            left: 0,
            top: 0,
            width: 0,
            height: 0,
            overflow: "hidden",
            visibility: "hidden",
          }}
        >
          A
        </span>
      ) : null}
      <ReactionFloaterLayer
        className={cn(className)}
        position="absolute"
        items={itemsForLayer}
        viewportScale={scale}
        viewport={viewport}
      />
    </>
  );
}
