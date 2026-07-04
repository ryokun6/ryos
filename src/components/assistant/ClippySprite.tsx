import { useEffect, useRef, useState } from "react";
import type { AssistantCharacterId } from "./characters";
import { AssistantSoundPlayer } from "./assistantSounds";

/**
 * Minimal player for Microsoft Agent animation data (clippy.js format).
 * Frames reference ordered [x, y] tiles in one sprite sheet. The first tile is
 * the base pose and later transparent tiles are stacked overlays. Frames also
 * carry a duration in ms and optional probabilistic branching, which gives the
 * original idle animations their variety.
 */

interface AgentFrameBranch {
  frameIndex: number;
  weight: number;
}

interface AgentFrame {
  duration: number;
  images?: Array<[number, number]>;
  exitBranch?: number;
  branching?: { branches: AgentFrameBranch[] };
  sound?: string;
}

interface AgentAnimation {
  useExitBranching?: boolean;
  frames: AgentFrame[];
}

export interface AgentData {
  framesize: [number, number];
  overlayCount?: number;
  animations: Record<string, AgentAnimation>;
}

function resolveFrameImages(
  current: Array<[number, number]>,
  frame: AgentFrame
): Array<[number, number]> {
  return frame.images && frame.images.length > 0 ? frame.images : current;
}

const agentDataCache = new Map<string, Promise<AgentData>>();

export function loadAgentData(url: string): Promise<AgentData> {
  let cached = agentDataCache.get(url);
  if (!cached) {
    cached = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`Failed to load agent data: ${res.status}`);
      return res.json() as Promise<AgentData>;
    });
    agentDataCache.set(url, cached);
  }
  return cached;
}

export function useAgentData(url: string | undefined): AgentData | null {
  const [data, setData] = useState<AgentData | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    loadAgentData(url)
      .then((loaded) => {
        if (!cancelled) setData(loaded);
      })
      .catch((err) => {
        console.warn("[Assistant] Failed to load sprite agent data:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return data;
}

interface ClippySpriteProps {
  mapUrl: string;
  data: AgentData;
  characterId: AssistantCharacterId;
  /** Animation name from the agent data (e.g. "Greeting", "Thinking"). */
  animation: string;
  /** Re-trigger token: bump to replay the same animation name. */
  playToken?: number;
  onAnimationEnd?: (animation: string) => void;
}

export function ClippySprite({
  mapUrl,
  data,
  characterId,
  animation,
  playToken = 0,
  onAnimationEnd,
}: ClippySpriteProps) {
  const [frameImages, setFrameImages] = useState<Array<[number, number]>>([
    [0, 0],
  ]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundPlayerRef = useRef<AssistantSoundPlayer | null>(null);
  const onEndRef = useRef(onAnimationEnd);
  onEndRef.current = onAnimationEnd;

  useEffect(() => {
    const player = new AssistantSoundPlayer();
    soundPlayerRef.current = player;
    player.loadCharacter(characterId);
    return () => {
      player.dispose();
      if (soundPlayerRef.current === player) {
        soundPlayerRef.current = null;
      }
    };
  }, [characterId]);

  const [frameWidth, frameHeight] = data.framesize;

  useEffect(() => {
    const anim = data.animations[animation];
    if (!anim || anim.frames.length === 0) {
      return;
    }

    let cancelled = false;
    let index = 0;

    const step = () => {
      if (cancelled) return;
      const frame = anim.frames[index];
      if (!frame) {
        onEndRef.current?.(animation);
        return;
      }

      setFrameImages((current) => resolveFrameImages(current, frame));
      soundPlayerRef.current?.play(frame.sound);

      // Pick the next frame: probabilistic branching when present, else
      // sequential. Reaching past the last frame ends the animation.
      let nextIndex = index + 1;
      if (frame.branching) {
        let roll = Math.random() * 100;
        for (const branch of frame.branching.branches) {
          if (roll <= branch.weight) {
            nextIndex = branch.frameIndex;
            break;
          }
          roll -= branch.weight;
        }
      }

      if (nextIndex >= anim.frames.length) {
        timerRef.current = setTimeout(() => {
          if (!cancelled) onEndRef.current?.(animation);
        }, frame.duration);
        return;
      }

      index = nextIndex;
      timerRef.current = setTimeout(step, frame.duration);
    };

    step();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      soundPlayerRef.current?.stopAll();
    };
  }, [data, animation, playToken]);

  return (
    <div
      aria-hidden
      style={{
        position: "relative",
        width: frameWidth,
        height: frameHeight,
        pointerEvents: "none",
      }}
    >
      {frameImages.map(([x, y], layerIndex) => (
        <div
          key={layerIndex}
          data-assistant-sprite-layer={layerIndex}
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${mapUrl})`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: `-${x}px -${y}px`,
          }}
        />
      ))}
    </div>
  );
}
