import {
  useCallback,
  useEffect,
  useRef,
  type FocusEventHandler,
  type PointerEventHandler,
  type RefObject,
  type WheelEventHandler,
} from "react";
import { isTouchDevice } from "@/utils/device";

export const ASSISTANT_BUBBLE_AUTO_CLOSE_MS = 5_000;
/**
 * Touch devices drop focus easily (soft keyboard dismissal, taps on
 * non-focusable bubble content), so focus can't keep the bubble alive the way
 * it does with a mouse + hardware keyboard. Give a longer reading window.
 */
export const ASSISTANT_BUBBLE_AUTO_CLOSE_TOUCH_MS = 15_000;

export function getAssistantBubbleAutoCloseDelayMs(): number {
  return isTouchDevice()
    ? ASSISTANT_BUBBLE_AUTO_CLOSE_TOUCH_MS
    : ASSISTANT_BUBBLE_AUTO_CLOSE_MS;
}

interface UseAssistantBubbleAutoCloseOptions {
  bubbleOpen: boolean;
  bubbleRef: RefObject<HTMLElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  resetKey: string;
  /**
   * While true (e.g. a reply is generating), the bubble never auto-closes.
   * Close requests that arrive during the hold are deferred and re-armed with
   * a fresh full grace period once the hold ends, so the user gets the whole
   * window to read the finished reply.
   */
  holdOpen?: boolean;
}

interface AssistantBubbleAutoCloseHandlers {
  cancelAutoClose: () => void;
  onBlur: FocusEventHandler<HTMLElement>;
  onFocus: FocusEventHandler<HTMLElement>;
  onPointerDown: PointerEventHandler<HTMLElement>;
  onWheel: WheelEventHandler<HTMLElement>;
  onCompositionStart: () => void;
  onCompositionEnd: () => void;
}

export function useAssistantBubbleAutoClose({
  bubbleOpen,
  bubbleRef,
  inputRef,
  onClose,
  resetKey,
  holdOpen = false,
}: UseAssistantBubbleAutoCloseOptions): AssistantBubbleAutoCloseHandlers {
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferredFocusCheckRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const composingRef = useRef(false);
  const bubbleOpenRef = useRef(bubbleOpen);
  const onCloseRef = useRef(onClose);
  const holdOpenRef = useRef(holdOpen);
  /** A countdown was requested (or interrupted) while holdOpen was active. */
  const pendingRestartAfterHoldRef = useRef(false);
  bubbleOpenRef.current = bubbleOpen;
  onCloseRef.current = onClose;
  holdOpenRef.current = holdOpen;

  const cancelAutoClose = useCallback(() => {
    pendingRestartAfterHoldRef.current = false;
    if (autoCloseTimerRef.current !== null) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    if (deferredFocusCheckRef.current !== null) {
      clearTimeout(deferredFocusCheckRef.current);
      deferredFocusCheckRef.current = null;
    }
  }, []);

  const hasFocusInsideBubble = useCallback(() => {
    const activeElement = document.activeElement;
    return (
      activeElement === inputRef.current ||
      (activeElement !== null &&
        bubbleRef.current?.contains(activeElement) === true)
    );
  }, [bubbleRef, inputRef]);

  const startAutoClose = useCallback(() => {
    cancelAutoClose();
    if (
      !bubbleOpenRef.current ||
      composingRef.current ||
      hasFocusInsideBubble()
    ) {
      return;
    }
    if (holdOpenRef.current) {
      // Defer: re-arm with a fresh full grace period once the hold lifts.
      pendingRestartAfterHoldRef.current = true;
      return;
    }

    autoCloseTimerRef.current = setTimeout(() => {
      autoCloseTimerRef.current = null;
      if (
        !bubbleOpenRef.current ||
        composingRef.current ||
        hasFocusInsideBubble()
      ) {
        return;
      }
      if (holdOpenRef.current) {
        pendingRestartAfterHoldRef.current = true;
        return;
      }
      onCloseRef.current();
    }, getAssistantBubbleAutoCloseDelayMs());
  }, [cancelAutoClose, hasFocusInsideBubble]);

  const deferFocusCheck = useCallback(() => {
    if (deferredFocusCheckRef.current !== null) {
      clearTimeout(deferredFocusCheckRef.current);
    }
    deferredFocusCheckRef.current = setTimeout(() => {
      deferredFocusCheckRef.current = null;
      startAutoClose();
    }, 0);
  }, [startAutoClose]);

  const handleBlur = useCallback<FocusEventHandler<HTMLElement>>(
    (event) => {
      const nextFocus = event.relatedTarget;
      if (
        nextFocus instanceof Node &&
        bubbleRef.current?.contains(nextFocus) === true
      ) {
        cancelAutoClose();
        return;
      }
      // FocusEvent.activeElement is not consistent across browsers while blur
      // is dispatching. Check it in the next task, especially when
      // relatedTarget is null.
      deferFocusCheck();
    },
    [bubbleRef, cancelAutoClose, deferFocusCheck]
  );

  const handleFocus = useCallback<FocusEventHandler<HTMLElement>>(() => {
    cancelAutoClose();
  }, [cancelAutoClose]);

  const handlePointerInteraction = useCallback<
    PointerEventHandler<HTMLElement>
  >(() => {
    startAutoClose();
  }, [startAutoClose]);

  const handleWheel = useCallback<WheelEventHandler<HTMLElement>>(() => {
    startAutoClose();
  }, [startAutoClose]);

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true;
    cancelAutoClose();
  }, [cancelAutoClose]);

  const handleCompositionEnd = useCallback(() => {
    composingRef.current = false;
    deferFocusCheck();
  }, [deferFocusCheck]);

  useEffect(() => {
    cancelAutoClose();
  }, [bubbleOpen, cancelAutoClose, resetKey]);

  useEffect(() => {
    if (holdOpen) {
      // A countdown that was already running is interrupted by the hold and
      // will restart from zero once the hold lifts.
      if (autoCloseTimerRef.current !== null) {
        cancelAutoClose();
        pendingRestartAfterHoldRef.current = true;
      }
      return;
    }
    if (pendingRestartAfterHoldRef.current) {
      pendingRestartAfterHoldRef.current = false;
      startAutoClose();
    }
  }, [holdOpen, cancelAutoClose, startAutoClose]);

  useEffect(() => cancelAutoClose, [cancelAutoClose]);

  return {
    cancelAutoClose,
    onBlur: handleBlur,
    onFocus: handleFocus,
    onPointerDown: handlePointerInteraction,
    onWheel: handleWheel,
    onCompositionStart: handleCompositionStart,
    onCompositionEnd: handleCompositionEnd,
  };
}
