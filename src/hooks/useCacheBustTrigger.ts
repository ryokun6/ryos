import { useRef, useCallback } from "react";
import { useIpodStore } from "@/stores/useIpodStore";

/**
 * Hook for detecting cache bust trigger changes.
 * 
 * Used to detect when the user requests a force refresh of lyrics data.
 * Each consumer tracks their own "last seen" trigger value to independently
 * detect force requests.
 * 
 * @returns Object with trigger detection and marking utilities
 */
export function useCacheBustTrigger() {
  const trigger = useIpodStore((s) => s.lyricsCacheBustTrigger);
  const lastTriggerRef = useRef<number>(trigger);

  /**
   * Whether the current trigger value indicates a force request
   * (trigger changed since last marked as handled)
   */
  const isForceRequest = lastTriggerRef.current !== trigger;

  /**
   * Mark the current trigger as handled.
   * Call this after successfully processing a force request.
   */
  const markHandled = useCallback(() => {
    lastTriggerRef.current = trigger;
  }, [trigger]);

  /**
   * Get the current trigger value (for dependency arrays)
   */
  const currentTrigger = trigger;

  return {
    /** Current trigger value from store */
    currentTrigger,
    /** Whether this is a force request (trigger changed) */
    isForceRequest,
    /** Mark current trigger as handled after processing */
    markHandled,
  };
}

/**
 * Hook for detecting lyrics refetch trigger changes.
 * 
 * This is a simpler trigger that just requests a refetch without
 * clearing server cache.
 */
export function useRefetchTrigger() {
  const trigger = useIpodStore((s) => s.lyricsRefetchTrigger);
  const lastTriggerRef = useRef<number>(trigger);

  const isForceRequest = lastTriggerRef.current !== trigger;

  const markHandled = useCallback(() => {
    lastTriggerRef.current = trigger;
  }, [trigger]);

  return {
    currentTrigger: trigger,
    isForceRequest,
    markHandled,
  };
}
