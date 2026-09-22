export interface ConfirmedPlaybackFields {
  /** True only after the media provider has emitted an actual play event. */
  isPlaying: boolean;
  /** Desired player state, including an in-flight play attempt. */
  playbackRequested: boolean;
}

export function requestPlayback(): ConfirmedPlaybackFields {
  return {
    isPlaying: false,
    playbackRequested: true,
  };
}

export function confirmPlayback(
  state: Pick<ConfirmedPlaybackFields, "playbackRequested">
): ConfirmedPlaybackFields {
  return state.playbackRequested
    ? {
        isPlaying: true,
        playbackRequested: true,
      }
    : stopPlayback();
}

export function stopPlayback(): ConfirmedPlaybackFields {
  return {
    isPlaying: false,
    playbackRequested: false,
  };
}

export function togglePlayback(
  state: Pick<ConfirmedPlaybackFields, "playbackRequested">
): ConfirmedPlaybackFields {
  return state.playbackRequested ? stopPlayback() : requestPlayback();
}

export function resetPlaybackConfirmation(
  state: Pick<ConfirmedPlaybackFields, "playbackRequested">
): ConfirmedPlaybackFields {
  return {
    isPlaying: false,
    playbackRequested: state.playbackRequested,
  };
}

/**
 * YouTube IFrame PlayerState values that mean audio is running
 * (or about to): 1 = playing, 3 = buffering.
 */
export function isYouTubePlayerAudiblyActive(
  playerState: number | null | undefined
): boolean {
  return playerState === 1 || playerState === 3;
}

/**
 * Re-sync confirmed UI play state when a view overlay (e.g. Cover Flow)
 * hides and the karaoke/iPod player is shown again.
 *
 * `setIsPlaying(true)` maps to `requestPlayback()`, which clears
 * `isPlaying` until ReactPlayer emits `onPlay`. Selecting the already-
 * playing track in Cover Flow does that re-request without a new onPlay,
 * so the toolbar stays paused while audio continues. Prefer the live
 * player; if the snapshot is stale/unknown, keep a pending request
 * confirmed so the UI matches audio that never paused.
 */
export function resolvePlayStateAfterViewResume(input: {
  playerState: number | null | undefined;
  playbackRequested: boolean;
}): ConfirmedPlaybackFields {
  if (isYouTubePlayerAudiblyActive(input.playerState)) {
    return { isPlaying: true, playbackRequested: true };
  }
  if (input.playbackRequested) {
    return { isPlaying: true, playbackRequested: true };
  }
  return stopPlayback();
}

export function applyPlayStateAfterViewResume(
  current: ConfirmedPlaybackFields,
  playerState: number | null | undefined,
  actions: {
    setIsPlaying: (playing: boolean) => void;
    confirmPlayback: () => void;
  }
): ConfirmedPlaybackFields {
  const next = resolvePlayStateAfterViewResume({
    playerState,
    playbackRequested: current.playbackRequested,
  });
  if (
    next.isPlaying === current.isPlaying &&
    next.playbackRequested === current.playbackRequested
  ) {
    return current;
  }
  if (next.isPlaying) {
    if (!current.playbackRequested) {
      actions.setIsPlaying(true);
    }
    actions.confirmPlayback();
  } else {
    actions.setIsPlaying(false);
  }
  return next;
}
