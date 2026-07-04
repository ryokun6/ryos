import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  type Transition,
} from "motion/react";
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
import {
  ClippySprite,
  useAgentDataLoadState,
  type AgentData,
} from "./ClippySprite";
import { useAssistantChat } from "./useAssistantChat";
import {
  DEEP_IDLE_AFTER_MS,
  getAnimationCandidates,
  getAssistantAnimationIntent,
  getAssistantExitAnimationTimeout,
  getAssistantLifecycleAnimationIntent,
  getAssistantPointingDirection,
  getDeepIdleAnimationPool,
  getDocumentToolSequenceKind,
  getIdleAnimationPool,
  isAssistantEntranceAnimation,
  isDocumentSequenceTool,
  resolveAssistantEntranceSequencePlan,
  resolveDocumentToolSequencePlan,
  selectAssistantAnimation,
  selectAssistantPointingAnimation,
  type AssistantAnimationIntent,
  type AssistantToolActivity,
  type DocumentToolSequencePlan,
} from "./assistantAnimation";
import { markAssistantSoundInteraction } from "./assistantSounds";
import { resolveAssistantSnapPoint } from "./assistantSnap";
import { useAssistantBubbleAutoClose } from "./useAssistantBubbleAutoClose";
import { speakAssistantText, stopAssistantSpeech } from "./assistantSpeech";
import { useAssistantSpeech } from "./useAssistantSpeech";
import {
  Streamdown,
  CHAT_STREAMDOWN_ANIMATED,
  CHAT_STREAMDOWN_PLUGINS,
  CHAT_STREAMDOWN_SHIKI_THEME,
  STREAMDOWN_DISALLOWED_ELEMENTS,
  chatStreamdownComponents,
} from "@/apps/chats/components/chat-messages/streamdown";
import { ArrowUp } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { createClientLogger } from "@/utils/logger";

/**
 * Animation state machine trace. Silent in production unless the user enables
 * Debug Mode (or sets `localStorage["ryos:debug"] = "1"`).
 */
const assistantAnimLogger = createClientLogger("AssistantAnim");
const animLog = (message: string): void => assistantAnimLogger.debug(message);

/** Distance (px) within which the assistant snaps to an edge on release. */
const SNAP_THRESHOLD = 32;
/** Margin (px) kept between the assistant and the edge it snaps to. */
const SNAP_MARGIN = 8;
/** Pointer movement (px) below which a press counts as a click, not a drag. */
const CLICK_SLOP = 5;
/** Press-and-hold duration (ms) that opens the context menu. */
const LONG_PRESS_MS = 550;

const SNAP_SPRING: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 24,
  mass: 0.75,
};

const BUBBLE_OPEN_SPRING: Transition = {
  type: "spring",
  stiffness: 360,
  damping: 25,
  mass: 0.7,
};

const BUBBLE_EXIT: Transition = {
  duration: 0.12,
  ease: "easeIn",
};

const REST_ANIMATION = "RestPose";

/** Wait for the snap spring to mostly settle before pointing at a window. */
const POINTING_DELAY_MS = 550;

function isWorkingIntent(intent: AssistantAnimationIntent): boolean {
  return (
    intent === "thinking" ||
    intent === "speaking" ||
    intent === "processing" ||
    intent === "searching" ||
    intent === "reading" ||
    intent === "writing"
  );
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
/** Shared vertical envelope for thinking/tool-call and final reply text. */
const ASSISTANT_BUBBLE_BODY_CLASS =
  "max-h-40 overflow-y-auto break-words py-1.5 leading-snug";

function ThinkingTicker({ items }: { items: string[] }) {
  const current = items[items.length - 1] ?? "";

  return (
    <div
      className="relative min-h-[1lh] overflow-hidden"
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
          className="absolute inset-x-0 top-0 truncate leading-snug shimmer-gray"
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
  const { t, i18n } = useTranslation();
  const characterId = useAssistantStore((state) => state.characterId);
  const storedPosition = useAssistantStore((state) => state.position);
  const setStoredPosition = useAssistantStore((state) => state.setPosition);
  const setCharacterId = useAssistantStore((state) => state.setCharacterId);
  const setEnabled = useAssistantStore((state) => state.setEnabled);
  const speechEnabled = useAssistantStore((state) => state.speechEnabled);
  const setSpeechEnabled = useAssistantStore((state) => state.setSpeechEnabled);
  const character = getAssistantCharacter(characterId);
  const { computeInsets } = useWindowInsets();
  const launchApp = useLaunchApp();
  const reduceMotion = useReducedMotion();
  const lastUserDragAtRef = useRef(0);
  const pendingRelocationCancelRef = useRef<(() => void) | null>(null);

  const chatHandle = useAssistantChat();
  const {
    latestAssistantText,
    statusLabels,
    toolActivity,
    openTarget,
    isAwaitingReply,
    isLoading,
    errorText,
    sendUserMessage,
    greetIfStale,
    clearConversation,
  } = chatHandle;

  // Speak finished replies aloud (browser TTS) when Speech is enabled.
  useAssistantSpeech({ latestAssistantText, isLoading });

  const [bubbleOpen, setBubbleOpen] = useState(true);
  const [input, setInput] = useState("");
  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const activateCharacterRef = useRef<() => void>(() => {});
  const pointAtTargetRef = useRef<
    (
      target: { x: number; y: number; width: number; height: number },
      from: AssistantPosition
    ) => void
  >(() => {});
  const pointingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Last moment the assistant was doing something (drives deep idle). */
  const lastActiveAtRef = useRef(Date.now());
  const closeBubble = useCallback(() => setBubbleOpen(false), []);
  const {
    cancelAutoClose: cancelBubbleAutoClose,
    onBlur: handleBubbleBlur,
    onFocus: handleBubbleFocus,
    onPointerDown: handleBubblePointerDown,
    onWheel: handleBubbleWheel,
    onCompositionStart: handleInputCompositionStart,
    onCompositionEnd: handleInputCompositionEnd,
  } = useAssistantBubbleAutoClose({
    bubbleOpen,
    bubbleRef,
    inputRef,
    onClose: closeBubble,
    resetKey: characterId,
    // Never close mid-reply: on mobile the input blurs as soon as the
    // keyboard dismisses, which would otherwise start the countdown while
    // the reply is still generating (or before the user can read it).
    holdOpen: isLoading,
  });

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

  const overlayRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(position);
  positionRef.current = position;

  // Move next to the exact window reported by a successful desktop-assistant
  // tool. New windows wait on the app store's loaded/foreground transition;
  // existing windows can resolve immediately from their committed geometry.
  useEffect(() => {
    if (!openTarget) return;
    if (lastUserDragAtRef.current >= openTarget.toolStartedAt) return;

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    const cancel = () => {
      if (cancelled) return;
      cancelled = true;
      unsubscribe?.();
      if (pendingRelocationCancelRef.current === cancel) {
        pendingRelocationCancelRef.current = null;
      }
    };
    pendingRelocationCancelRef.current?.();
    pendingRelocationCancelRef.current = cancel;

    const tryRelocate = (state: ReturnType<typeof useAppStore.getState>) => {
      if (cancelled) return;
      if (lastUserDragAtRef.current >= openTarget.toolStartedAt) {
        cancel();
        return;
      }

      const instance = state.instances[openTarget.instanceId];
      if (!instance?.isOpen || instance.isMinimized) {
        cancel();
        return;
      }
      if (instance.isLoading) return;
      if (state.foregroundInstanceId !== openTarget.instanceId) {
        // A user-selected foreground window supersedes this completed open.
        cancel();
        return;
      }

      const insets = computeInsets();
      const windowFrame = Array.from(
        document.querySelectorAll<HTMLElement>("[data-window-instance-id]")
      ).find(
        (element) =>
          element.dataset.windowInstanceId === openTarget.instanceId
      );
      const frameBounds = windowFrame?.getBoundingClientRect();
      const targetBounds =
        frameBounds && frameBounds.width > 0 && frameBounds.height > 0
          ? {
              x: frameBounds.left,
              y: frameBounds.top,
              width: frameBounds.width,
              height: frameBounds.height,
            }
          : instance.position && instance.size
          ? {
              x: instance.position.x,
              y: instance.position.y,
              width: instance.size.width,
              height: instance.size.height,
            }
          : instance.launchOrigin ?? null;
      const snapped = resolveAssistantSnapPoint({
        currentPosition: positionRef.current,
        assistantSize: {
          width: character.width,
          height: character.height,
        },
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          topInset: insets.topInset,
          bottomInset: insets.bottomInset,
        },
        targetBounds,
      });

      if (snapped) {
        setPosition(snapped);
        setStoredPosition(snapped);
        if (targetBounds) {
          // Look/point toward the window the assistant just moved to show.
          pointAtTargetRef.current(targetBounds, snapped);
        }
      }
      cancel();
    };

    tryRelocate(useAppStore.getState());
    if (!cancelled) {
      unsubscribe = useAppStore.subscribe(tryRelocate);
    }

    return cancel;
  }, [
    openTarget,
    computeInsets,
    character.width,
    character.height,
    setStoredPosition,
  ]);

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
    const overlayBounds = overlayRef.current?.getBoundingClientRect();
    setContextMenuPos({
      x: clientX - (overlayBounds?.left ?? positionRef.current.x),
      y: clientY - (overlayBounds?.top ?? positionRef.current.y),
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
          activateCharacterRef.current();
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
      markAssistantSoundInteraction();
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (contextMenuPos) return;
      lastActiveAtRef.current = Date.now();
      lastUserDragAtRef.current = Date.now();
      pendingRelocationCancelRef.current?.();
      const { clientX, clientY, pointerId } = event;
      const overlayBounds = overlayRef.current?.getBoundingClientRect();
      const drag = {
        pointerId,
        startX: clientX,
        startY: clientY,
        originX: overlayBounds?.left ?? positionRef.current.x,
        originY: overlayBounds?.top ?? positionRef.current.y,
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
  const agentDataLoadState = useAgentDataLoadState(character.agentUrl);
  const agentData = agentDataLoadState.data;
  const activityIntent = getAssistantAnimationIntent({
    isLoading,
    hasError: errorText !== null,
    toolActivity,
    hasVisibleReply: !isAwaitingReply,
  });
  const [spriteAnim, setSpriteAnim] = useState<{ name: string; token: number }>({
    name: REST_ANIMATION,
    token: 0,
  });
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agentDataRef = useRef<AgentData | null>(null);
  agentDataRef.current = agentData;
  const activityIntentRef = useRef(activityIntent);
  activityIntentRef.current = activityIntent;
  const previousActivityIntentRef = useRef(activityIntent);
  const toolActivityRef = useRef(toolActivity);
  toolActivityRef.current = toolActivity;
  const previousToolActivityRef = useRef<AssistantToolActivity | null>(
    toolActivity
  );
  const sequencePlanRef = useRef<DocumentToolSequencePlan | null>(null);
  const sequenceToolRef = useRef<string | null>(null);
  const entranceSequenceRef = useRef<string[] | null>(null);
  const enteredCharacterIdRef = useRef<string | null>(null);
  const enteredAgentDataRef = useRef<AgentData | null>(null);
  const quittingAnimationRef = useRef<string | null>(null);
  const quitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const needsCharacterEntry =
    agentData !== null &&
    enteredCharacterIdRef.current !== character.id &&
    enteredAgentDataRef.current !== agentData;
  const pendingEntrancePlan = needsCharacterEntry
    ? resolveAssistantEntranceSequencePlan(agentData)
    : null;
  const pendingEntranceAnimation = pendingEntrancePlan?.first ?? null;
  const initiallyHideSprite =
    pendingEntranceAnimation !== null &&
    isAssistantEntranceAnimation(pendingEntranceAnimation);

  const clearSequencePlan = useCallback(() => {
    sequencePlanRef.current = null;
    sequenceToolRef.current = null;
  }, []);

  const clearEntranceSequence = useCallback(() => {
    entranceSequenceRef.current = null;
  }, []);

  const clearPointingTimer = useCallback(() => {
    if (pointingTimerRef.current) {
      clearTimeout(pointingTimerRef.current);
      pointingTimerRef.current = null;
    }
  }, []);

  // Drop transient animation state when the character changes. Without this,
  // switching characters mid-entrance leaves a stale entrance sequence and a
  // stale entrance clip name behind, which replays the entry animation (and
  // blocks activity-driven clips) when the sprite next mounts. The pending
  // ambient idle timer must go too: it captured the previous character's clip
  // pool and would otherwise fire mid-entrance with a clip the new character
  // may not have (flashing it to its base pose and aborting the entry).
  const previousCharacterIdRef = useRef(character.id);
  useEffect(() => {
    if (previousCharacterIdRef.current === character.id) return;
    animLog(
      `character switch ${previousCharacterIdRef.current} → ${character.id}; reset transient animation state`
    );
    previousCharacterIdRef.current = character.id;
    clearSequencePlan();
    clearEntranceSequence();
    clearPointingTimer();
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    setSpriteAnim({ name: REST_ANIMATION, token: 0 });
  }, [
    character.id,
    clearSequencePlan,
    clearEntranceSequence,
    clearPointingTimer,
  ]);

  const pickAnimation = useCallback(
    (intent: AssistantAnimationIntent, randomValue?: number) => {
      if (!agentDataRef.current) return REST_ANIMATION;
      const activeTool = toolActivityRef.current;
      return selectAssistantAnimation({
        data: agentDataRef.current,
        intent,
        characterId: character.id,
        toolName:
          activeTool?.phase === "running" ? activeTool.name : undefined,
        randomValue,
      });
    },
    [character.id]
  );

  const playAnimation = useCallback((name: string, reason?: string) => {
    if (!name) return;
    animLog(`play ${name}${reason ? ` — ${reason}` : ""}`);
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    setSpriteAnim((prev) => ({ name, token: prev.token + 1 }));
  }, []);

  const startDocumentSequence = useCallback(
    (plan: DocumentToolSequencePlan, toolName: string) => {
      sequencePlanRef.current = plan;
      sequenceToolRef.current = toolName;
      playAnimation(plan.intro, `document ${plan.kind} sequence for ${toolName}`);
    },
    [playAnimation]
  );

  // Look/gesture toward a window the assistant just relocated next to.
  // Delayed so the snap spring mostly settles first. Skipped under reduced
  // motion and never interrupts an entrance or quit clip.
  pointAtTargetRef.current = (target, from) => {
    clearPointingTimer();
    if (reduceMotion) return;
    pointingTimerRef.current = setTimeout(() => {
      pointingTimerRef.current = null;
      const data = agentDataRef.current;
      if (!data) return;
      if (entranceSequenceRef.current || quittingAnimationRef.current) return;
      const direction = getAssistantPointingDirection(
        {
          x: from.x,
          y: from.y,
          width: character.width,
          height: character.height,
        },
        target
      );
      if (!direction) return;
      const pointingAnimation = selectAssistantPointingAnimation(
        data,
        direction
      );
      if (!pointingAnimation) {
        animLog(`pointing ${direction} skipped — no clip for direction`);
        return;
      }
      playAnimation(pointingAnimation, `pointing ${direction} at window`);
    }, POINTING_DELAY_MS);
  };

  // Play Show followed by a greeting once per character appearance. The data
  // identity guard ignores the previous character's data while a switch loads.
  useEffect(() => {
    if (!agentData) return;
    if (enteredCharacterIdRef.current === character.id) return;
    if (enteredAgentDataRef.current === agentData) return;

    const intent = getAssistantLifecycleAnimationIntent("characterLoad");
    if (intent !== "greeting") return;

    enteredCharacterIdRef.current = character.id;
    enteredAgentDataRef.current = agentData;
    clearSequencePlan();
    // Reduced motion keeps the sprite pinned to its rest pose; arming the
    // sequence would just block activity-driven state forever.
    if (reduceMotion) return;
    const plan = resolveAssistantEntranceSequencePlan(agentData);
    if (!plan) return;
    entranceSequenceRef.current = plan.followUp
      ? [plan.first, plan.followUp]
      : [plan.first];
    animLog(
      `entrance ${character.id}: ${plan.first}${
        plan.followUp ? ` → ${plan.followUp}` : ""
      }`
    );
    // The pending-entry render already started this clip. Record it without
    // bumping the replay token, which would restart the entrance.
    setSpriteAnim((prev) =>
      prev.name === plan.first ? prev : { name: plan.first, token: prev.token }
    );
  }, [
    agentData,
    character.id,
    clearSequencePlan,
    reduceMotion,
  ]);

  // Reflect chat and structured tool lifecycle changes without restarting an
  // animation for unrelated renders or repeated updates in the same state.
  useEffect(() => {
    const previousIntent = previousActivityIntentRef.current;
    previousActivityIntentRef.current = activityIntent;
    const previousTool = previousToolActivityRef.current;
    previousToolActivityRef.current = toolActivity;
    if (activityIntent !== "idle") {
      lastActiveAtRef.current = Date.now();
    }
    if (!agentData) return;
    if (entranceSequenceRef.current) return;

    const activeTool = toolActivityRef.current;
    const activeToolName =
      activeTool?.phase === "running" ? activeTool.name : null;

    if (activityIntent === "idle") {
      clearSequencePlan();
      if (isWorkingIntent(previousIntent)) {
        playAnimation(
          pickAnimation("success"),
          `success after ${previousIntent}`
        );
      }
      return;
    }

    const sequenceKind = activeToolName
      ? getDocumentToolSequenceKind(activeToolName)
      : null;

    if (
      sequenceKind &&
      activeToolName &&
      activeTool?.phase === "running" &&
      (activityIntent === "reading" || activityIntent === "writing")
    ) {
      const plan = resolveDocumentToolSequencePlan(agentData, sequenceKind);
      if (plan) {
        const sameSequence =
          sequenceToolRef.current === activeToolName &&
          sequencePlanRef.current?.kind === plan.kind;
        if (!sameSequence) {
          startDocumentSequence(plan, activeToolName);
        }
        return;
      }
    }

    if (
      sequencePlanRef.current &&
      (activityIntent === "thinking" ||
        activityIntent === "speaking" ||
        activityIntent === "processing" ||
        activityIntent === "searching") &&
      isWorkingIntent(previousIntent)
    ) {
      const plan = sequencePlanRef.current;
      clearSequencePlan();
      playAnimation(plan.returnAnim, `return from ${plan.kind} sequence`);
      return;
    }

    if (
      sequencePlanRef.current &&
      activeToolName !== sequenceToolRef.current
    ) {
      clearSequencePlan();
    }

    // Quick nod when a non-sequence tool just completed mid-turn (document
    // sequences already acknowledge via their return clip). The working loop
    // resumes once the nod ends.
    if (
      toolActivity?.phase === "complete" &&
      previousTool?.phase === "running" &&
      previousTool.name === toolActivity.name &&
      !isDocumentSequenceTool(toolActivity.name) &&
      (activityIntent === "thinking" || activityIntent === "speaking")
    ) {
      playAnimation(
        pickAnimation("acknowledge"),
        `acknowledge — tool ${toolActivity.name} completed`
      );
      return;
    }

    playAnimation(
      pickAnimation(activityIntent),
      `intent ${previousIntent} → ${activityIntent}` +
        (activeToolName ? ` (tool ${activeToolName})` : "")
    );
  }, [
    activityIntent,
    agentData,
    clearSequencePlan,
    pickAnimation,
    playAnimation,
    startDocumentSequence,
    toolActivity,
  ]);

  const handleCharacterActivate = useCallback(() => {
    cancelBubbleAutoClose();
    markAssistantSoundInteraction();
    lastActiveAtRef.current = Date.now();
    const willOpen = !bubbleOpen;
    setBubbleOpen(willOpen);
    if (willOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }

    const intent = getAssistantLifecycleAnimationIntent(
      willOpen ? "bubbleOpen" : "bubbleClose"
    );
    if (!intent) return;

    clearSequencePlan();
    clearEntranceSequence();
    playAnimation(
      pickAnimation(intent),
      `bubble ${willOpen ? "open" : "close"}`
    );
  }, [
    bubbleOpen,
    cancelBubbleAutoClose,
    clearEntranceSequence,
    clearSequencePlan,
    pickAnimation,
    playAnimation,
  ]);
  activateCharacterRef.current = handleCharacterActivate;

  const handleCharacterKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      handleCharacterActivate();
    },
    [handleCharacterActivate]
  );

  const handleAnimationEnd = useCallback(
    (endedAnimation: string) => {
      const data = agentDataRef.current;
      if (!data) return;
      animLog(`ended ${endedAnimation}`);

      if (quittingAnimationRef.current) {
        if (endedAnimation === quittingAnimationRef.current) {
          if (quitTimerRef.current) {
            clearTimeout(quitTimerRef.current);
            quitTimerRef.current = null;
          }
          quittingAnimationRef.current = null;
          setEnabled(false);
        }
        return;
      }

      const entranceSequence = entranceSequenceRef.current;
      if (entranceSequence?.[0] === endedAnimation) {
        const remaining = entranceSequence.slice(1);
        if (remaining.length > 0) {
          entranceSequenceRef.current = remaining;
          playAnimation(remaining[0], "entrance follow-up");
          return;
        }
        entranceSequenceRef.current = null;
        animLog("entrance complete");
      }

      const currentIntent = activityIntentRef.current;
      const activeTool = toolActivityRef.current;
      const plan = sequencePlanRef.current;
      const sequenceTool = sequenceToolRef.current;
      const sequenceStillActive =
        plan !== null &&
        sequenceTool !== null &&
        activeTool?.phase === "running" &&
        activeTool.name === sequenceTool &&
        isDocumentSequenceTool(sequenceTool);

      if (sequenceStillActive && plan) {
        playAnimation(plan.continued ?? plan.intro, `${plan.kind} sequence loop`);
        return;
      }

      if (plan && endedAnimation === plan.returnAnim) {
        clearSequencePlan();
      }

      if (isWorkingIntent(currentIntent)) {
        if (
          plan &&
          (currentIntent === "reading" || currentIntent === "writing")
        ) {
          playAnimation(
            plan.continued ?? plan.intro,
            `${plan.kind} sequence resume`
          );
          return;
        }
        playAnimation(
          pickAnimation(currentIntent),
          `working loop (${currentIntent})`
        );
        return;
      }

      if (endedAnimation !== REST_ANIMATION) {
        playAnimation(REST_ANIMATION, "settle to rest");
      }

      // No ambient idle rotation for reduced motion.
      if (reduceMotion) return;

      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        if (activityIntentRef.current !== "idle") return;
        // Never override an entrance or exit clip.
        if (entranceSequenceRef.current || quittingAnimationRef.current) return;
        // Re-read the agent data: the captured `data` may belong to a
        // character that has since been switched away, and its clip names
        // would flash the current sprite to its base pose.
        const currentData = agentDataRef.current;
        if (!currentData) return;
        // After prolonged inactivity, prefer the character's deep-idle
        // (sleep) clips when it ships them.
        const deepIdlePool =
          Date.now() - lastActiveAtRef.current >= DEEP_IDLE_AFTER_MS
            ? getDeepIdleAnimationPool(currentData)
            : [];
        const idlePool =
          deepIdlePool.length > 0
            ? deepIdlePool
            : getIdleAnimationPool(currentData);
        playAnimation(
          idlePool[Math.floor(Math.random() * idlePool.length)] ??
            REST_ANIMATION,
          deepIdlePool.length > 0 ? "deep idle" : "ambient idle"
        );
      }, 4000 + Math.random() * 8000);
    },
    [clearSequencePlan, pickAnimation, playAnimation, reduceMotion, setEnabled]
  );

  useEffect(
    () => () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (quitTimerRef.current) clearTimeout(quitTimerRef.current);
      if (pointingTimerRef.current) clearTimeout(pointingTimerRef.current);
    },
    []
  );

  const handleSpeechToggle = useCallback(() => {
    cancelBubbleAutoClose();
    const willEnable = !speechEnabled;
    setSpeechEnabled(willEnable);
    if (!willEnable) {
      stopAssistantSpeech();
      return;
    }
    // Speak the current reply inside the menu-click gesture: it audibly
    // confirms the setting and unlocks synthesis on iOS Safari.
    if (latestAssistantText && !isLoading) {
      speakAssistantText(latestAssistantText, { locale: i18n.language });
    }
  }, [
    cancelBubbleAutoClose,
    speechEnabled,
    setSpeechEnabled,
    latestAssistantText,
    isLoading,
    i18n.language,
  ]);

  const handleQuit = useCallback(() => {
    cancelBubbleAutoClose();
    clearPointingTimer();
    stopAssistantSpeech();
    if (quittingAnimationRef.current) return;

    const data = agentDataRef.current;
    const intent = getAssistantLifecycleAnimationIntent("quit");
    if (!data || intent !== "goodbye" || reduceMotion) {
      setEnabled(false);
      return;
    }

    const exitAnimation = pickAnimation(intent);
    const isAvailableExit = getAnimationCandidates(intent).includes(
      exitAnimation
    );
    if (!isAvailableExit || data.animations[exitAnimation] === undefined) {
      setEnabled(false);
      return;
    }

    clearSequencePlan();
    clearEntranceSequence();
    quittingAnimationRef.current = exitAnimation;
    playAnimation(exitAnimation, "quit exit");
    quitTimerRef.current = setTimeout(
      () => {
        quittingAnimationRef.current = null;
        quitTimerRef.current = null;
        setEnabled(false);
      },
      getAssistantExitAnimationTimeout(data, exitAnimation)
    );
  }, [
    cancelBubbleAutoClose,
    clearEntranceSequence,
    clearPointingTimer,
    clearSequencePlan,
    pickAnimation,
    playAnimation,
    reduceMotion,
    setEnabled,
  ]);

  // --- Context menu items ------------------------------------------------------
  const contextMenuItems = useMemo<MenuItem[]>(
    () => [
      {
        type: "checkbox",
        label: t("common.assistant.contextMenu.speech"),
        checked: speechEnabled,
        onSelect: handleSpeechToggle,
      },
      {
        type: "submenu",
        label: t("common.assistant.contextMenu.character"),
        items: ASSISTANT_CHARACTERS.map((entry) => ({
          type: "checkbox" as const,
          label: t(entry.nameKey),
          checked: entry.id === characterId,
          onSelect: () => {
            cancelBubbleAutoClose();
            setCharacterId(entry.id);
          },
        })),
      },
      { type: "separator" },
      {
        type: "item",
        label: t("common.assistant.contextMenu.newConversation"),
        onSelect: () => {
          cancelBubbleAutoClose();
          stopAssistantSpeech();
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
        onSelect: handleQuit,
      },
    ],
    [
      t,
      characterId,
      setCharacterId,
      cancelBubbleAutoClose,
      clearConversation,
      launchApp,
      handleQuit,
      speechEnabled,
      handleSpeechToggle,
    ]
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
      markAssistantSoundInteraction();
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
      if (agentDataLoadState.status === "error") {
        return (
          <div
            aria-hidden
            data-assistant-sprite-fallback
            style={{
              width: character.width,
              height: character.height,
              backgroundImage: `url(${character.mapUrl})`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "0 0",
              pointerEvents: "none",
            }}
          />
        );
      }
      return <div style={{ width: character.width, height: character.height }} />;
    }
    return (
      <ClippySprite
        key={character.id}
        mapUrl={character.mapUrl}
        data={agentData}
        characterId={character.id}
        // Reduced motion pins the sprite to its rest pose; state changes are
        // still conveyed by the bubble (ticker, error text, streamed reply).
        animation={
          reduceMotion
            ? REST_ANIMATION
            : pendingEntranceAnimation ?? spriteAnim.name
        }
        playToken={spriteAnim.token}
        initiallyHidden={initiallyHideSprite && !reduceMotion}
        onAnimationEnd={handleAnimationEnd}
      />
    );
  }, [
    character,
    agentData,
    agentDataLoadState.status,
    pendingEntranceAnimation,
    spriteAnim,
    initiallyHideSprite,
    handleAnimationEnd,
    reduceMotion,
  ]);

  return (
    <motion.div
      ref={overlayRef}
      initial={false}
      animate={{ x: position.x, y: position.y }}
      transition={
        isDragging || reduceMotion ? { duration: 0 } : SNAP_SPRING
      }
      className="fixed left-0 top-0 z-[5000] select-none"
      data-assistant-overlay
    >
      <AnimatePresence>
        {bubbleOpen && !isDragging && (
          <motion.div
            ref={bubbleRef}
            id="assistant-chat-bubble"
            onBlur={handleBubbleBlur}
            onFocus={handleBubbleFocus}
            onPointerDown={handleBubblePointerDown}
            onWheel={handleBubbleWheel}
            initial={{ opacity: 0, scale: 0.9, y: bubbleBelow ? -4 : 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{
              opacity: 0,
              scale: 0.96,
              y: bubbleBelow ? -2 : 2,
              transition: reduceMotion ? { duration: 0 } : BUBBLE_EXIT,
            }}
            transition={reduceMotion ? { duration: 0 } : BUBBLE_OPEN_SPRING}
            style={{
              transformOrigin: `${bubbleAlignRight ? "right" : "left"} ${
                bubbleBelow ? "top" : "bottom"
              }`,
            }}
            className={cn(
              "absolute w-64 pointer-events-auto",
              bubbleBelow ? "top-full mt-2" : "bottom-full mb-2",
              bubbleAlignRight ? "right-0" : "left-0"
            )}
          >
            <div
              className="relative rounded-[8px] border border-black bg-[#FFFFC8] px-3 pt-1.5 pb-1 shadow-[2px_2px_0_rgba(0,0,0,0.35)] font-geneva-12 text-[12px] leading-snug text-black"
              role="log"
              aria-live="polite"
            >
              <div className={ASSISTANT_BUBBLE_BODY_CLASS}>
                {showTyping ? (
                  <ThinkingTicker
                    items={[t("common.assistant.thinking"), ...statusLabels]}
                  />
                ) : errorText ? (
                  <div className="whitespace-pre-wrap">{errorText}</div>
                ) : bubbleText ? (
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
              <form
                onSubmit={handleSubmit}
                className="-mx-3 mt-1.5 flex items-center gap-1 border-t border-black/15 px-3 pt-1 pb-0.5"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onCompositionStart={handleInputCompositionStart}
                  onCompositionEnd={handleInputCompositionEnd}
                  placeholder={t("common.assistant.inputPlaceholder")}
                  aria-label={t("common.assistant.inputPlaceholder")}
                  className="min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-[12px] leading-tight font-geneva-12 placeholder:text-black/45 focus:outline-none focus:ring-0"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  aria-label={t("common.assistant.send")}
                  className="group flex size-7 shrink-0 items-center justify-center rounded-full disabled:opacity-35"
                >
                  <span className="flex size-5 items-center justify-center rounded-full bg-black/10 text-black/70 group-hover:bg-black/15 group-active:bg-black/20">
                    <ArrowUp className="size-3" weight="bold" aria-hidden />
                  </span>
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
        onKeyDown={handleCharacterKeyDown}
        role="button"
        tabIndex={0}
        aria-controls="assistant-chat-bubble"
        aria-expanded={bubbleOpen}
        aria-label={t("common.assistant.label", { name: t(character.nameKey) })}
        title={t(character.nameKey)}
      >
        {characterVisual}
      </div>

      <RightClickMenu
        position={contextMenuPos}
        onClose={() => setContextMenuPos(null)}
        items={contextMenuItems}
      />
    </motion.div>
  );
}
