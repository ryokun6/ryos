import {
  useCallback,
  useEffect,
  useRef,
  type FocusEventHandler,
  type PointerEventHandler,
  type RefObject,
  type WheelEventHandler,
} from "react";

export const ASSISTANT_BUBBLE_AUTO_CLOSE_MS = 5_000;

interface UseAssistantBubbleAutoCloseOptions {
  bubbleOpen: boolean;
  bubbleRef: RefObject<HTMLElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  resetKey: string;
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
}: UseAssistantBubbleAutoCloseOptions): AssistantBubbleAutoCloseHandlers {
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferredFocusCheckRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const composingRef = useRef(false);
  const bubbleOpenRef = useRef(bubbleOpen);
  const onCloseRef = useRef(onClose);
  bubbleOpenRef.current = bubbleOpen;
  onCloseRef.current = onClose;

  const cancelAutoClose = useCallback(() => {
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

    autoCloseTimerRef.current = setTimeout(() => {
      autoCloseTimerRef.current = null;
      if (
        !bubbleOpenRef.current ||
        composingRef.current ||
        hasFocusInsideBubble()
      ) {
        return;
      }
      onCloseRef.current();
    }, ASSISTANT_BUBBLE_AUTO_CLOSE_MS);
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
