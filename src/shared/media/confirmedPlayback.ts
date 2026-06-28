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
