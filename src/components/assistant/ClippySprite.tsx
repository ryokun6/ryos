import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistantCharacterId } from "./characters";
import { AssistantSoundPlayer } from "./assistantSounds";
import { createDebugLogger } from "@/utils/debug";

/**
 * Sprite playback trace. Silent in production unless the user opts in via
 * `localStorage.setItem("ryos:debug", "1")` (see `src/utils/debug.ts`).
 */
const spriteLog = createDebugLogger("AssistantSprite");

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

/** How often a clip held at its WAITING point checks for an interrupt. */
const WAITING_POLL_MS = 50;

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

export type AgentDataLoadState =
  | { status: "idle"; data: null }
  | { status: "loading"; data: null }
  | { status: "ready"; data: AgentData }
  | { status: "error"; data: null };

interface StoredAgentDataLoadState {
  url: string | undefined;
  result: AgentDataLoadState;
}

export function useAgentDataLoadState(
  url: string | undefined
): AgentDataLoadState {
  const [loadState, setLoadState] = useState<StoredAgentDataLoadState>(() => ({
    url,
    result: url
      ? { status: "loading", data: null }
      : { status: "idle", data: null },
  }));

  useEffect(() => {
    if (!url) {
      setLoadState({
        url,
        result: { status: "idle", data: null },
      });
      return;
    }

    let cancelled = false;
    setLoadState({
      url,
      result: { status: "loading", data: null },
    });
    loadAgentData(url)
      .then((loaded) => {
        if (!cancelled) {
          setLoadState({
            url,
            result: { status: "ready", data: loaded },
          });
        }
      })
      .catch((err) => {
        console.warn("[Assistant] Failed to load sprite agent data:", err);
        if (!cancelled) {
          setLoadState({
            url,
            result: { status: "error", data: null },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (loadState.url !== url) {
    return url
      ? { status: "loading", data: null }
      : { status: "idle", data: null };
  }
  return loadState.result;
}

export function useAgentData(url: string | undefined): AgentData | null {
  return useAgentDataLoadState(url).data;
}

interface ClippySpriteProps {
  mapUrl: string;
  data: AgentData;
  characterId: AssistantCharacterId;
  /** Animation name from the agent data (e.g. "Greeting", "Thinking"). */
  animation: string;
  /** Re-trigger token: bump to replay the same animation name. */
  playToken?: number;
  /**
   * Start without a base tile. The first animation frame becomes the first
   * rendered visual, including intentionally empty entrance frames.
   */
  initiallyHidden?: boolean;
  /** Skip sound playback entirely (e.g. static preference-pane previews). */
  muted?: boolean;
  onAnimationEnd?: (animation: string) => void;
}

interface PlaybackState {
  name: string;
  anim: AgentAnimation;
  index: number;
  /** Following exitBranch frames toward the end after an interrupt request. */
  exiting: boolean;
  /** Frames stepped while exiting; caps malformed exit-branch loops. */
  exitSteps: number;
  /**
   * Reached the natural end of a useExitBranching clip: holding its final
   * pose (original Microsoft Agent WAITING state). The end has been reported,
   * and the clip's wind-down frames play when the next clip is requested.
   */
  waiting: boolean;
  /** Clip queued to start once the graceful exit completes. */
  pendingName: string | null;
  timer: ReturnType<typeof setTimeout> | null;
}

export function ClippySprite({
  mapUrl,
  data,
  characterId,
  animation,
  playToken = 0,
  initiallyHidden = false,
  muted = false,
  onAnimationEnd,
}: ClippySpriteProps) {
  const [frameImages, setFrameImages] = useState<Array<[number, number]>>(() =>
    initiallyHidden ? [] : [[0, 0]]
  );
  const playbackRef = useRef<PlaybackState | null>(null);
  const soundPlayerRef = useRef<AssistantSoundPlayer | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const onEndRef = useRef(onAnimationEnd);
  onEndRef.current = onAnimationEnd;

  useEffect(() => {
    if (muted) return;
    const player = new AssistantSoundPlayer();
    soundPlayerRef.current = player;
    player.loadCharacter(characterId);
    return () => {
      player.dispose();
      if (soundPlayerRef.current === player) {
        soundPlayerRef.current = null;
      }
    };
  }, [characterId, muted]);

  const [frameWidth, frameHeight] = data.framesize;

  const stopPlayback = useCallback(() => {
    const playback = playbackRef.current;
    if (playback?.timer) clearTimeout(playback.timer);
    playbackRef.current = null;
  }, []);

  const startAnimation = useCallback(
    function start(name: string) {
      stopPlayback();
      soundPlayerRef.current?.stopAll();
      const anim = dataRef.current.animations[name];
      if (!anim || anim.frames.length === 0) {
        spriteLog(`missing clip "${name}" — falling back to base pose`);
        setFrameImages([[0, 0]]);
        // Report the clip as ended so the overlay's state machine recovers
        // (otherwise a missing clip freezes the sprite at its base pose until
        // the next unrelated state change).
        onEndRef.current?.(name);
        return;
      }

      spriteLog(
        `start ${name} (${anim.frames.length} frames${
          anim.useExitBranching ? ", exit-branching" : ""
        })`
      );
      const playback: PlaybackState = {
        name,
        anim,
        index: 0,
        exiting: false,
        exitSteps: 0,
        waiting: false,
        pendingName: null,
        timer: null,
      };
      playbackRef.current = playback;

      const finish = () => {
        if (playbackRef.current !== playback) return;
        const pendingName = playback.pendingName;
        playbackRef.current = null;
        if (pendingName !== null) {
          // Interrupted clips exit silently: the parent state machine already
          // committed to the pending clip, so no end notification.
          start(pendingName);
          return;
        }
        onEndRef.current?.(playback.name);
      };

      const step = () => {
        if (playbackRef.current !== playback) return;
        const frame = playback.anim.frames[playback.index];
        if (!frame) {
          finish();
          return;
        }

        // WAITING hold: the frame is already on screen, so just poll for an
        // interrupt. Once one arrives, jump onto the held frame's exit path.
        if (playback.waiting) {
          if (!playback.exiting) {
            playback.timer = setTimeout(step, WAITING_POLL_MS);
            return;
          }
          playback.waiting = false;
          playback.exitSteps += 1;
          const exitIndex =
            typeof frame.exitBranch === "number"
              ? frame.exitBranch
              : playback.index + 1;
          if (exitIndex >= playback.anim.frames.length) {
            finish();
            return;
          }
          playback.index = exitIndex;
          step();
          return;
        }

        setFrameImages((current) => resolveFrameImages(current, frame));
        soundPlayerRef.current?.play(frame.sound);

        // Pick the next frame. Exiting follows exitBranch pointers toward the
        // end (skipping probabilistic loops); normal playback honors
        // branching, else advances sequentially. Reaching past the last frame
        // ends the animation.
        let nextIndex = playback.index + 1;
        if (playback.exiting) {
          playback.exitSteps += 1;
          if (playback.exitSteps > playback.anim.frames.length * 2) {
            finish();
            return;
          }
          if (typeof frame.exitBranch === "number") {
            nextIndex = frame.exitBranch;
          }
        } else if (frame.branching) {
          let roll = Math.random() * 100;
          for (const branch of frame.branching.branches) {
            if (roll <= branch.weight) {
              nextIndex = branch.frameIndex;
              break;
            }
            roll -= branch.weight;
          }
        }

        // Exit-branching clips never end on their own (original Microsoft
        // Agent WAITING state): their last frame is a terminal marker, and
        // the wind-down frames before it are only reachable via exitBranch
        // pointers. Finishing here would strand the held pose on screen and
        // make the next clip a hard cut. Instead hold the current frame —
        // keeping its exitBranch reachable — and report the end once so the
        // overlay's state machine can decide what plays next; its request
        // then winds the clip down through the exit path above.
        if (
          !playback.exiting &&
          playback.anim.useExitBranching &&
          nextIndex >= playback.anim.frames.length - 1
        ) {
          playback.waiting = true;
          spriteLog(`hold ${playback.name} at exit-branch wait point`);
          onEndRef.current?.(playback.name);
          if (playbackRef.current !== playback) return;
          playback.timer = setTimeout(step, WAITING_POLL_MS);
          return;
        }

        if (nextIndex >= playback.anim.frames.length) {
          playback.timer = setTimeout(finish, frame.duration);
          return;
        }

        playback.index = nextIndex;
        playback.timer = setTimeout(step, frame.duration);
      };

      step();
    },
    [stopPlayback]
  );

  const previousRequestRef = useRef<{
    data: AgentData;
    animation: string;
    playToken: number;
  } | null>(null);

  useEffect(() => {
    const previous = previousRequestRef.current;
    previousRequestRef.current = { data, animation, playToken };

    const playback = playbackRef.current;
    const dataChanged = previous !== null && previous.data !== data;

    // Graceful interrupt: clips authored with exit branching wind down along
    // their exitBranch path before the next clip starts (original Microsoft
    // Agent behavior). Everything else hard-switches immediately. A clip
    // holding at its WAITING point always winds down first — even a replay of
    // the same clip, which restarts from the rest pose the exit path ends on.
    if (
      !dataChanged &&
      playback &&
      playback.anim.useExitBranching &&
      !(playback.name === animation && !playback.exiting && !playback.waiting)
    ) {
      spriteLog(
        `graceful exit of ${playback.name}, then ${animation} (exit-branch wind-down)`
      );
      playback.pendingName = animation;
      playback.exiting = true;
      return;
    }

    startAnimation(animation);
  }, [data, animation, playToken, startAnimation]);

  useEffect(
    () => () => {
      stopPlayback();
      soundPlayerRef.current?.stopAll();
    },
    [stopPlayback]
  );

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
