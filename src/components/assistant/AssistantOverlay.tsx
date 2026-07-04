import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/stores/useAppStore";
import {
  useAssistantStore,
  type AssistantPosition,
} from "@/stores/useAssistantStore";
import { useWindowInsets } from "@/hooks/useWindowInsets";
import { getAssistantCharacter } from "./characters";
import { ClippySprite, useAgentData } from "./ClippySprite";
import { useAssistantChat } from "./useAssistantChat";
import { cn } from "@/lib/utils";

/** Distance (px) within which the assistant snaps to an edge on release. */
const SNAP_THRESHOLD = 32;
/** Margin (px) kept between the assistant and the edge it snaps to. */
const SNAP_MARGIN = 8;
/** Pointer movement (px) below which a press counts as a click, not a drag. */
const CLICK_SLOP = 5;

const IDLE_ANIMATIONS = [
  "IdleEyeBrowRaise",
  "IdleFingerTap",
  "IdleHeadScratch",
  "IdleSideToSide",
  "IdleRopePile",
  "IdleAtom",
  "LookLeft",
  "LookRight",
  "LookUp",
  "GetAttention",
] as const;

const THINKING_ANIMATIONS = ["Thinking", "Processing", "Searching"] as const;

interface SnapEdges {
  xs: number[];
  ys: number[];
}

/**
 * Collect snap targets: screen edges (inside menubar/dock insets), the dock's
 * top edge, and the edges of every open window so the assistant can perch on
 * title bars or hang off window corners like the original.
 */
function collectSnapEdges(
  width: number,
  height: number,
  topInset: number,
  bottomInset: number
): SnapEdges {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const xs = [SNAP_MARGIN, vw - width - SNAP_MARGIN];
  // Bottom edge doubles as the dock snap: bottomInset already includes the
  // dock height, so this rests the character right on top of the dock.
  const ys = [topInset + SNAP_MARGIN, vh - bottomInset - height - SNAP_MARGIN];

  const { instances } = useAppStore.getState();
  for (const instance of Object.values(instances)) {
    if (!instance.isOpen || instance.isMinimized) continue;
    const pos = instance.position;
    const size = instance.size;
    if (!pos || !size) continue;
    // Left/right window edges (assistant sits flush outside or inside).
    xs.push(pos.x - width, pos.x, pos.x + size.width - width, pos.x + size.width);
    // Perch on the window's top edge, or align with its bottom edge.
    ys.push(pos.y - height, pos.y + size.height - height, pos.y + size.height);
  }

  return { xs, ys };
}

function snapAxis(value: number, candidates: number[]): number {
  let best = value;
  let bestDistance = SNAP_THRESHOLD;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - value);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function clampToViewport(
  pos: AssistantPosition,
  width: number,
  height: number,
  topInset: number
): AssistantPosition {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: Math.min(Math.max(pos.x, 0), Math.max(vw - width, 0)),
    y: Math.min(Math.max(pos.y, topInset), Math.max(vh - height, topInset)),
  };
}

export function AssistantOverlay() {
  const enabled = useAssistantStore((state) => state.enabled);
  if (!enabled) return null;
  return <AssistantOverlayInner />;
}

function AssistantOverlayInner() {
  const { t } = useTranslation();
  const characterId = useAssistantStore((state) => state.characterId);
  const storedPosition = useAssistantStore((state) => state.position);
  const setStoredPosition = useAssistantStore((state) => state.setPosition);
  const character = getAssistantCharacter(characterId);
  const { computeInsets } = useWindowInsets();

  const chatHandle = useAssistantChat();
  const {
    latestAssistantText,
    isLoading,
    errorText,
    sendUserMessage,
    greetIfStale,
  } = chatHandle;

  const [bubbleOpen, setBubbleOpen] = useState(true);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // --- Position + dragging ---------------------------------------------------
  const defaultPosition = useCallback((): AssistantPosition => {
    const insets = computeInsets();
    return clampToViewport(
      {
        x: window.innerWidth - character.width - 24,
        y: window.innerHeight - insets.bottomInset - character.height - 16,
      },
      character.width,
      character.height,
      insets.topInset
    );
  }, [computeInsets, character.width, character.height]);

  const [position, setPosition] = useState<AssistantPosition>(() => {
    const insets = computeInsets();
    return storedPosition
      ? clampToViewport(
          storedPosition,
          character.width,
          character.height,
          insets.topInset
        )
      : defaultPosition();
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  const positionRef = useRef(position);
  positionRef.current = position;

  // Keep the assistant on-screen when the viewport resizes.
  useEffect(() => {
    const handleResize = () => {
      const insets = computeInsets();
      setPosition((prev) =>
        clampToViewport(prev, character.width, character.height, insets.topInset)
      );
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [computeInsets, character.width, character.height]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: positionRef.current.x,
        originY: positionRef.current.y,
        moved: false,
      };
    },
    []
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.abs(dx) < CLICK_SLOP && Math.abs(dy) < CLICK_SLOP) {
        return;
      }
      drag.moved = true;
      setIsDragging(true);
      const insets = computeInsets();
      setPosition(
        clampToViewport(
          { x: drag.originX + dx, y: drag.originY + dy },
          character.width,
          character.height,
          insets.topInset
        )
      );
    },
    [computeInsets, character.width, character.height]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragStateRef.current = null;
      setIsDragging(false);

      if (!drag.moved) {
        // Click: toggle the speech bubble.
        setBubbleOpen((open) => !open);
        return;
      }

      // Drag release: snap to nearby screen, dock, and window edges.
      const insets = computeInsets();
      const edges = collectSnapEdges(
        character.width,
        character.height,
        insets.topInset,
        insets.bottomInset
      );
      const snapped = clampToViewport(
        {
          x: snapAxis(positionRef.current.x, edges.xs),
          y: snapAxis(positionRef.current.y, edges.ys),
        },
        character.width,
        character.height,
        insets.topInset
      );
      setPosition(snapped);
      setStoredPosition(snapped);
    },
    [computeInsets, character.width, character.height, setStoredPosition]
  );

  // --- Greeting on summon ------------------------------------------------------
  const greetedRef = useRef(false);
  useEffect(() => {
    if (greetedRef.current) return;
    greetedRef.current = true;
    greetIfStale();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Sprite animation state machine -----------------------------------------
  const agentData = useAgentData(
    character.kind === "sprite" ? character.agentUrl : undefined
  );
  const [spriteAnim, setSpriteAnim] = useState<{ name: string; token: number }>({
    name: "Greeting",
    token: 0,
  });
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;

  const playAnimation = useCallback((name: string) => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    setSpriteAnim((prev) => ({ name, token: prev.token + 1 }));
  }, []);

  // Thinking pose while the AI is working.
  useEffect(() => {
    if (character.kind !== "sprite") return;
    if (isLoading) {
      playAnimation(
        THINKING_ANIMATIONS[
          Math.floor(Math.random() * THINKING_ANIMATIONS.length)
        ]
      );
    }
  }, [isLoading, character.kind, playAnimation]);

  const handleAnimationEnd = useCallback(() => {
    if (isLoadingRef.current) {
      // Keep visibly "working" until the reply lands.
      setSpriteAnim((prev) => ({
        name: THINKING_ANIMATIONS[
          Math.floor(Math.random() * THINKING_ANIMATIONS.length)
        ],
        token: prev.token + 1,
      }));
      return;
    }
    setSpriteAnim((prev) => ({ name: "RestPose", token: prev.token + 1 }));
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setSpriteAnim((prev) => ({
        name: IDLE_ANIMATIONS[
          Math.floor(Math.random() * IDLE_ANIMATIONS.length)
        ],
        token: prev.token + 1,
      }));
    }, 4000 + Math.random() * 8000);
  }, []);

  useEffect(
    () => () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    },
    []
  );

  // --- Bubble placement --------------------------------------------------------
  // Show the bubble above the character unless the character is near the top
  // of the screen; keep the bubble inside the viewport horizontally.
  const bubbleBelow = position.y < 220;
  const bubbleAlignRight =
    position.x + character.width / 2 > window.innerWidth / 2;

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const text = input.trim();
      if (!text || isLoading) return;
      setInput("");
      sendUserMessage(text);
    },
    [input, isLoading, sendUserMessage]
  );

  const bubbleText = errorText ?? latestAssistantText;
  const showTyping = isLoading && !latestAssistantText.trim() && !errorText;

  const characterVisual = useMemo(() => {
    if (character.kind === "sprite") {
      if (!agentData) {
        return <div style={{ width: character.width, height: character.height }} />;
      }
      return (
        <ClippySprite
          mapUrl={character.mapUrl!}
          data={agentData}
          animation={spriteAnim.name}
          playToken={spriteAnim.token}
          onAnimationEnd={handleAnimationEnd}
        />
      );
    }
    return (
      <motion.img
        src={character.imageUrl}
        alt={character.name}
        draggable={false}
        style={{ width: character.width, height: character.height }}
        animate={
          isLoading
            ? { y: [0, -6, 0], rotate: [0, -3, 3, 0] }
            : { y: [0, -3, 0] }
        }
        transition={{
          duration: isLoading ? 0.9 : 3,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    );
  }, [character, agentData, spriteAnim, handleAnimationEnd, isLoading]);

  return (
    <div
      className="fixed z-[5000] select-none"
      style={{ left: position.x, top: position.y }}
      data-assistant-overlay
    >
      <AnimatePresence>
        {bubbleOpen && !isDragging && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: bubbleBelow ? -6 : 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: bubbleBelow ? -6 : 6 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={cn(
              "absolute w-64 pointer-events-auto",
              bubbleBelow ? "top-full mt-2" : "bottom-full mb-2",
              bubbleAlignRight ? "right-0" : "left-0"
            )}
          >
            <div
              className="relative rounded-lg border border-black bg-[#FFFFC8] px-3 py-2 shadow-[2px_2px_0_rgba(0,0,0,0.35)] font-geneva-12 text-[12px] leading-snug text-black"
              role="log"
              aria-live="polite"
            >
              {showTyping ? (
                <div className="flex gap-1 py-1" aria-label={t("common.assistant.thinking")}>
                  <span className="size-1.5 rounded-full bg-black/60 animate-bounce [animation-delay:0ms]" />
                  <span className="size-1.5 rounded-full bg-black/60 animate-bounce [animation-delay:120ms]" />
                  <span className="size-1.5 rounded-full bg-black/60 animate-bounce [animation-delay:240ms]" />
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
                  {bubbleText || t("common.assistant.emptyBubble")}
                </div>
              )}
              <form onSubmit={handleSubmit} className="mt-2 flex gap-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={t("common.assistant.inputPlaceholder")}
                  aria-label={t("common.assistant.inputPlaceholder")}
                  className="min-w-0 flex-1 rounded border border-black/50 bg-white px-1.5 py-0.5 text-[12px] font-geneva-12 focus:outline-none focus:ring-1 focus:ring-black/40"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="rounded border border-black/50 bg-white px-1.5 py-0.5 text-[12px] font-geneva-12 disabled:opacity-40 hover:bg-black/5 active:bg-black/10"
                >
                  {t("common.assistant.send")}
                </button>
              </form>
              {/* Bubble tail pointing at the character */}
              <div
                className={cn(
                  "absolute size-2.5 rotate-45 border-black bg-[#FFFFC8]",
                  bubbleBelow
                    ? "-top-[6px] border-l border-t"
                    : "-bottom-[6px] border-b border-r",
                  bubbleAlignRight ? "right-6" : "left-6"
                )}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className={cn(
          "pointer-events-auto touch-none",
          isDragging ? "cursor-grabbing" : "cursor-grab"
        )}
        style={{ width: character.width, height: character.height }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="button"
        aria-label={t("common.assistant.label", { name: character.name })}
        title={character.name}
      >
        {characterVisual}
      </div>
    </div>
  );
}
