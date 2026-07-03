import { useCallback, useRef } from "react";

/**
 * MediaCore track-switch guard (Phase 4).
 *
 * The media apps ignore spurious ReactPlayer play/pause events for a short
 * window after a track (or fullscreen) switch, because YouTube embeds emit
 * transient state churn while loading. Previously the iPod, Karaoke, and
 * Videos hooks each hand-rolled the same two refs + timeout dance.
 *
 * The refs are exposed directly so app-specific effects (lyric-offset seek,
 * fullscreen sync) can keep managing bespoke guard windows.
 */
export interface TrackSwitchGuard {
  /** True while player events should be ignored. */
  isTrackSwitchingRef: React.MutableRefObject<boolean>;
  /** Pending guard-clearing timeout, shared across guard writers. */
  trackSwitchTimeoutRef: React.MutableRefObject<ReturnType<
    typeof setTimeout
  > | null>;
  /** Begin a guard window; clears any previous pending timeout. */
  startTrackSwitch: (durationMs?: number) => void;
}

export const TRACK_SWITCH_GUARD_MS = 2000;

export function useTrackSwitchGuard(options?: {
  /** Called when a `startTrackSwitch` guard window ends (debug logging). */
  onGuardEnd?: () => void;
}): TrackSwitchGuard {
  const isTrackSwitchingRef = useRef(false);
  const trackSwitchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const onGuardEndRef = useRef(options?.onGuardEnd);
  onGuardEndRef.current = options?.onGuardEnd;

  const startTrackSwitch = useCallback(
    (durationMs: number = TRACK_SWITCH_GUARD_MS) => {
      isTrackSwitchingRef.current = true;
      if (trackSwitchTimeoutRef.current) {
        clearTimeout(trackSwitchTimeoutRef.current);
      }
      // Allow the player to load before accepting play/pause events again.
      trackSwitchTimeoutRef.current = setTimeout(() => {
        isTrackSwitchingRef.current = false;
        onGuardEndRef.current?.();
      }, durationMs);
    },
    []
  );

  return { isTrackSwitchingRef, trackSwitchTimeoutRef, startTrackSwitch };
}
