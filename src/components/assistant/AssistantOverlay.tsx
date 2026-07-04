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
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { RightClickMenu, type MenuItem } from "@/components/ui/right-click-menu";
import {
  ASSISTANT_CHARACTERS,
  getAssistantCharacter,
} from "./characters";
import { ClippySprite, useAgentData, type AgentData } from "./ClippySprite";
import { useAssistantChat } from "./useAssistantChat";
import {
  Streamdown,
  CHAT_STREAMDOWN_ANIMATED,
  CHAT_STREAMDOWN_PLUGINS,
  CHAT_STREAMDOWN_SHIKI_THEME,
  STREAMDOWN_DISALLOWED_ELEMENTS,
  chatStreamdownComponents,
} from "@/apps/chats/components/chat-messages/streamdown";
import { cn } from "@/lib/utils";

/** Distance (px) within which the assistant snaps to an edge on release. */
const SNAP_THRESHOLD = 32;
/** Margin (px) kept between the assistant and the edge it snaps to. */
const SNAP_MARGIN = 8;
/** Pointer movement (px) below which a press counts as a click, not a drag. */
const CLICK_SLOP = 5;
/** Press-and-hold duration (ms) that opens the context menu. */
const LONG_PRESS_MS = 550;

// Animation names vary across the original agents; pick what's available.
const GREET_CANDIDATES = ["Greeting", "Show", "Wave", "Announce", "GetAttention"];
const THINKING_CANDIDATES = [
  "Thinking",
  "Processing",
  "Searching",
  "Writing",
  "CheckingSomething",
];
const EXTRA_IDLE_CANDIDATES = [
  "LookLeft",
  "LookRight",
  "LookUp",
  "LookDown",
  "GetAttention",
  "Blink",
];
const REST_ANIMATION = "RestPose";

function availableFrom(data: AgentData, candidates: string[]): string[] {
  return candidates.filter((name) => data.animations[name]);
}

function pickRandom(pool: string[], fallback: string): string {
  if (pool.length === 0) return fallback;
  return pool[Math.floor(Math.random() * pool.length)];
}

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

/**
 * Vertical roller shown while a reply is being generated: shows the latest
 * status ("Thinking…" or a friendly tool-call line) and rolls the old line up
 * and out only when a new one arrives.
 */
function ThinkingTicker({ items }: { items: string[] }) {
  const current = items[items.length - 1] ?? "";

  return (
    <div
      className="relative h-[18px] overflow-hidden"
      aria-live="polite"
      aria-label={current}
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={`${items.length}-${current}`}
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -14, opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="absolute inset-x-0 top-0 truncate text-black/60"
        >
          {current}
        </motion.div>
      </AnimatePresence>
    </div>
  );
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
  const setCharacterId = useAssistantStore((state) => state.setCharacterId);
  const setEnabled = useAssistantStore((state) => state.setEnabled);
  const character = getAssistantCharacter(characterId);
  const { computeInsets } = useWindowInsets();
  const launchApp = useLaunchApp();

  const chatHandle = useAssistantChat();
  const {
    latestAssistantText,
    statusLabels,
    isAwaitingReply,
    isLoading,
    errorText,
    sendUserMessage,
    greetIfStale,
    clearConversation,
  } = chatHandle;

  const [bubbleOpen, setBubbleOpen] = useState(true);
  const [input, setInput] = useState("");
  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
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

  const positionRef = useRef(position);
  positionRef.current = position;

  // Keep the assistant on-screen when the viewport or character size changes.
  useEffect(() => {
    const clamp = () => {
      const insets = computeInsets();
      setPosition((prev) =>
        clampToViewport(prev, character.width, character.height, insets.topInset)
      );
    };
    clamp();
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, [computeInsets, character.width, character.height]);

  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
    longPressTimer: ReturnType<typeof setTimeout> | null;
    longPressFired: boolean;
  } | null>(null);

  const openContextMenu = useCallback((clientX: number, clientY: number) => {
    // RightClickMenu positions itself absolutely inside this fixed container,
    // so convert from viewport coordinates to container-local coordinates.
    setContextMenuPos({
      x: clientX - positionRef.current.x,
      y: clientY - positionRef.current.y,
    });
  }, []);

  const endDrag = useCallback(
    (commit: boolean) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      if (drag.longPressTimer) clearTimeout(drag.longPressTimer);
      dragStateRef.current = null;
      setIsDragging(false);

      if (!commit) return;

      if (!drag.moved) {
        if (!drag.longPressFired) {
          // Plain click: toggle the speech bubble.
          setBubbleOpen((open) => !open);
        }
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

  // Window-level listeners make dragging robust even if pointer capture is
  // unavailable (e.g. synthesized events) or the pointer leaves the character.
  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.abs(dx) < CLICK_SLOP && Math.abs(dy) < CLICK_SLOP) {
        return;
      }
      if (drag.longPressTimer) {
        clearTimeout(drag.longPressTimer);
        drag.longPressTimer = null;
      }
      if (drag.longPressFired) return;
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
    };
    const handleUp = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      endDrag(true);
    };
    const handleCancel = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      endDrag(false);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
    };
  }, [computeInsets, character.width, character.height, endDrag]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (contextMenuPos) return;
      const { clientX, clientY, pointerId } = event;
      const drag = {
        pointerId,
        startX: clientX,
        startY: clientY,
        originX: positionRef.current.x,
        originY: positionRef.current.y,
        moved: false,
        longPressTimer: null as ReturnType<typeof setTimeout> | null,
        longPressFired: false,
      };
      // Long-press (touch and mouse) opens the context menu instead of a drag.
      drag.longPressTimer = setTimeout(() => {
        if (dragStateRef.current !== drag || drag.moved) return;
        drag.longPressFired = true;
        openContextMenu(clientX, clientY);
      }, LONG_PRESS_MS);
      dragStateRef.current = drag;
    },
    [contextMenuPos, openContextMenu]
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      endDrag(false);
      openContextMenu(event.clientX, event.clientY);
    },
    [endDrag, openContextMenu]
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
  const agentData = useAgentData(character.agentUrl);
  const [spriteAnim, setSpriteAnim] = useState<{ name: string; token: number }>({
    name: REST_ANIMATION,
    token: 0,
  });
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;
  const agentDataRef = useRef<AgentData | null>(null);
  agentDataRef.current = agentData;

  const playAnimation = useCallback((name: string) => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    setSpriteAnim((prev) => ({ name, token: prev.token + 1 }));
  }, []);

  // Greet when this character's animation data arrives (also on switch).
  useEffect(() => {
    if (!agentData) return;
    playAnimation(pickRandom(availableFrom(agentData, GREET_CANDIDATES), REST_ANIMATION));
  }, [agentData, playAnimation]);

  // Thinking pose while the AI is working.
  useEffect(() => {
    if (!agentData) return;
    if (isLoading) {
      playAnimation(
        pickRandom(availableFrom(agentData, THINKING_CANDIDATES), REST_ANIMATION)
      );
    }
  }, [isLoading, agentData, playAnimation]);

  const handleAnimationEnd = useCallback(() => {
    const data = agentDataRef.current;
    if (!data) return;
    if (isLoadingRef.current) {
      // Keep visibly "working" until the reply lands.
      setSpriteAnim((prev) => ({
        name: pickRandom(availableFrom(data, THINKING_CANDIDATES), REST_ANIMATION),
        token: prev.token + 1,
      }));
      return;
    }
    setSpriteAnim((prev) => ({ name: REST_ANIMATION, token: prev.token + 1 }));
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      const idlePool = [
        ...Object.keys(data.animations).filter((name) =>
          name.toLowerCase().startsWith("idle")
        ),
        ...availableFrom(data, EXTRA_IDLE_CANDIDATES),
      ];
      setSpriteAnim((prev) => ({
        name: pickRandom(idlePool, REST_ANIMATION),
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

  // --- Context menu items ------------------------------------------------------
  const contextMenuItems = useMemo<MenuItem[]>(
    () => [
      {
        type: "submenu",
        label: t("common.assistant.contextMenu.character"),
        items: ASSISTANT_CHARACTERS.map((entry) => ({
          type: "checkbox" as const,
          label: entry.name,
          checked: entry.id === characterId,
          onSelect: () => setCharacterId(entry.id),
        })),
      },
      { type: "separator" },
      {
        type: "item",
        label: t("common.assistant.contextMenu.newConversation"),
        onSelect: () => {
          clearConversation();
          setBubbleOpen(true);
        },
      },
      {
        type: "item",
        label: t("common.assistant.contextMenu.settings"),
        onSelect: () =>
          launchApp("control-panels", {
            initialData: { defaultTab: "assistant" },
          }),
      },
      { type: "separator" },
      {
        type: "item",
        label: t("common.assistant.contextMenu.quit"),
        onSelect: () => setEnabled(false),
      },
    ],
    [t, characterId, setCharacterId, clearConversation, launchApp, setEnabled]
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
  const showTyping = isAwaitingReply && !errorText;

  const characterVisual = useMemo(() => {
    if (!agentData) {
      return <div style={{ width: character.width, height: character.height }} />;
    }
    return (
      <ClippySprite
        mapUrl={character.mapUrl}
        data={agentData}
        animation={spriteAnim.name}
        playToken={spriteAnim.token}
        onAnimationEnd={handleAnimationEnd}
      />
    );
  }, [character, agentData, spriteAnim, handleAnimationEnd]);

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
                <ThinkingTicker
                  items={[t("common.assistant.thinking"), ...statusLabels]}
                />
              ) : errorText ? (
                <div className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
                  {errorText}
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto break-words">
                  {bubbleText ? (
                    <Streamdown
                      className="ryos-chat-streamdown"
                      components={chatStreamdownComponents}
                      disallowedElements={STREAMDOWN_DISALLOWED_ELEMENTS}
                      controls={false}
                      lineNumbers={false}
                      shikiTheme={CHAT_STREAMDOWN_SHIKI_THEME}
                      plugins={CHAT_STREAMDOWN_PLUGINS}
                      skipHtml
                      unwrapDisallowed
                      mode={isLoading ? "streaming" : "static"}
                      animated={CHAT_STREAMDOWN_ANIMATED}
                      isAnimating={isLoading}
                      parseIncompleteMarkdown={isLoading}
                    >
                      {bubbleText}
                    </Streamdown>
                  ) : (
                    t("common.assistant.emptyBubble")
                  )}
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
        onContextMenu={handleContextMenu}
        role="button"
        aria-label={t("common.assistant.label", { name: character.name })}
        title={character.name}
      >
        {characterVisual}
      </div>

      <RightClickMenu
        position={contextMenuPos}
        onClose={() => setContextMenuPos(null)}
        items={contextMenuItems}
      />
    </div>
  );
}
