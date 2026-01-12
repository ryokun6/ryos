import { useEffect, useRef } from "react";

type EventMap = WindowEventMap & DocumentEventMap & HTMLElementEventMap;

/**
 * Custom hook for declarative event listener management with automatic cleanup.
 *
 * @param eventName - The event to listen for
 * @param handler - The event handler function
 * @param element - The target element (defaults to window)
 * @param options - Event listener options
 *
 * @example
 * // Window event
 * useEventListener("resize", handleResize);
 *
 * // Document event
 * useEventListener("visibilitychange", handleVisibility, document);
 *
 * // Element event via ref
 * const buttonRef = useRef<HTMLButtonElement>(null);
 * useEventListener("click", handleClick, buttonRef);
 */
export function useEventListener<K extends keyof EventMap>(
  eventName: K,
  handler: (event: EventMap[K]) => void,
  element?: Window | Document | HTMLElement | React.RefObject<HTMLElement | null> | null,
  options?: boolean | AddEventListenerOptions
): void {
  // Store handler in ref to avoid re-subscribing on handler change
  const savedHandler = useRef(handler);

  // Update ref when handler changes
  savedHandler.current = handler;

  useEffect(() => {
    // Resolve the target element
    const targetElement: Window | Document | HTMLElement | null =
      element === undefined
        ? window
        : element && "current" in element
          ? element.current
          : element;

    if (!targetElement?.addEventListener) {
      return;
    }

    // Create event listener that calls handler from ref
    const eventListener = (event: Event) => {
      savedHandler.current(event as EventMap[K]);
    };

    targetElement.addEventListener(eventName, eventListener, options);

    return () => {
      targetElement.removeEventListener(eventName, eventListener, options);
    };
  }, [eventName, element, options]);
}

/**
 * Hook for listening to custom events on window.
 * Provides better typing for CustomEvent payloads.
 *
 * @example
 * useCustomEventListener("toggleExposeView", () => setExposeOpen(true));
 * useCustomEventListener<{ instanceId: string }>("closeWindow", (e) => handleClose(e.detail.instanceId));
 */
export function useCustomEventListener<T = undefined>(
  eventName: string,
  handler: T extends undefined
    ? () => void
    : (event: CustomEvent<T>) => void,
  element?: Window | Document | null
): void {
  const savedHandler = useRef(handler);
  savedHandler.current = handler;

  useEffect(() => {
    const targetElement = element ?? window;

    const eventListener = (event: Event) => {
      (savedHandler.current as (event: Event) => void)(event);
    };

    targetElement.addEventListener(eventName, eventListener);

    return () => {
      targetElement.removeEventListener(eventName, eventListener);
    };
  }, [eventName, element]);
}
