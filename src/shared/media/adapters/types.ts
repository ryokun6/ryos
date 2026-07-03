/**
 * MediaCore source adapter contract.
 *
 * A `MediaSourceAdapter` is the seam between a transport (store state) and a
 * concrete playback engine — the ReactPlayer-based YouTube embeds (iPod,
 * Karaoke, Videos, TV), the MusicKit `AppleMusicPlayerBridge`, and Winamp's
 * raw IFrame wrapper. Phase 4 replaces the per-app `getActivePlayer` ref
 * juggling with adapter instances; Listen Together and cross-device handoff
 * then target this interface instead of app internals.
 */

export interface MediaAdapterEvents {
  /** Provider confirmed playback actually started. */
  onPlay?: () => void;
  /** Provider paused (user gesture, buffer stall resolution, etc.). */
  onPause?: () => void;
  /** Current item finished playing. */
  onEnded?: () => void;
  /** Playback clock tick, in seconds. */
  onProgress?: (seconds: number) => void;
  /** Total duration became known, in seconds. */
  onDuration?: (seconds: number) => void;
  /** Provider-level failure (embed blocked, network, autoplay denial). */
  onError?: (error: unknown) => void;
}

export interface MediaSourceAdapter {
  /** Stable id for diagnostics ("youtube", "apple-music", "webamp"). */
  readonly kind: string;
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  /** Current playback position in seconds, or null when unavailable. */
  getCurrentTime: () => number | null;
  /** Attach event handlers; returns an unsubscribe function. */
  subscribe: (events: MediaAdapterEvents) => () => void;
}
