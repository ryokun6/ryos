import { useLayoutEffect, useState, type RefObject } from "react";
import {
  CHAT_MESSAGE_LIST_MIN_CLEARANCE_PX,
  messageListBottomClearance,
  readSafeAreaBottomPx,
} from "../components/chat-messages/composerClearance";

/**
 * Tracks how far the message list must clear the floating composer.
 * Observes the composer overlay (so the model label, image preview, and
 * errors are included) and the scrollport, and folds in the iOS bottom
 * safe area when the scrollport extends into it.
 */
export function useComposerOverlayClearance(
  composerRef: RefObject<HTMLElement | null>,
  scrollportRef: RefObject<HTMLElement | null>
): number {
  const [clearance, setClearance] = useState(
    CHAT_MESSAGE_LIST_MIN_CLEARANCE_PX
  );

  useLayoutEffect(() => {
    const composer = composerRef.current;
    const scrollport = scrollportRef.current;
    if (!composer || !scrollport) return;

    const measure = () => {
      const composerBox = composer.getBoundingClientRect();
      const scrollBox = scrollport.getBoundingClientRect();
      const next = messageListBottomClearance({
        composerTop: composerBox.top,
        scrollBottom: scrollBox.bottom,
        viewportHeight: window.innerHeight,
        safeAreaBottom: readSafeAreaBottomPx(),
      });
      setClearance((prev) => (prev === next ? prev : next));
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(composer);
    observer.observe(scrollport);
    window.addEventListener("resize", measure);
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      visualViewport?.removeEventListener("resize", measure);
    };
  }, [composerRef, scrollportRef]);

  return clearance;
}
