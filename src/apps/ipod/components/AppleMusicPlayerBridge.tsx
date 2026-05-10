import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import type { Track } from "@/stores/useIpodStore";
import { onMusicKitReady } from "@/hooks/useMusicKit";

/**
 * Apple Music playback bridge.
 *
 * Renders nothing (MusicKit JS owns the actual `<audio>` element internally)
 * but mirrors the parts of `react-player`'s imperative API that the iPod
 * logic depends on (`seekTo`, `getCurrentTime`, `getInternalPlayer`).
 *
 * Lifecycle:
 *   - When `currentTrack` changes the bridge calls `setQueue` with the
 *     track's catalog or library ID, then plays/pauses to match `playing`.
 *   - Listens to `playbackTimeDidChange` / `playbackStateDidChange` /
 *     `mediaItemDidChange` to drive `onProgress` / `onPlay` / `onPause` /
 *     `onDuration` callbacks identical to `react-player`'s shape.
 *   - Honours `volume` (0–1).
 */

export interface AppleMusicPlayerBridgeProps {
  /** Current Apple Music track to play. Triggers `setQueue` on change. */
  currentTrack: Track | null;
  /** Whether playback should be active. */
  playing: boolean;
  /** Volume in [0, 1]. */
  volume: number;
  onProgress?: (state: { playedSeconds: number }) => void;
  onDuration?: (duration: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onReady?: () => void;
}

export interface AppleMusicPlayerBridgeHandle {
  seekTo(seconds: number): void;
  getCurrentTime(): number;
  getInternalPlayer(): MusicKit.MusicKitInstance | null;
}

function getQueueOptions(track: Track): MusicKit.SetQueueOptions | null {
  const params = track.appleMusicPlayParams;
  if (!params) return null;
  // Prefer catalog ID for streaming. Fall back to the library ID when the
  // track is library-only (no catalog match available).
  const id =
    params.kind === "library-songs"
      ? params.libraryId || params.catalogId
      : params.catalogId || params.libraryId;
  if (!id) return null;
  return { song: id, startPlaying: true };
}

export const AppleMusicPlayerBridge = forwardRef<
  AppleMusicPlayerBridgeHandle,
  AppleMusicPlayerBridgeProps
>(function AppleMusicPlayerBridge(
  {
    currentTrack,
    playing,
    volume,
    onProgress,
    onDuration,
    onPlay,
    onPause,
    onEnded,
    onReady,
  },
  ref
) {
  const instanceRef = useRef<MusicKit.MusicKitInstance | null>(null);
  const lastQueuedTrackIdRef = useRef<string | null>(null);
  const queueLoadingRef = useRef<Promise<void> | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // Bind the singleton — useMusicKit may not have completed configure() yet
  // when the iPod first mounts, so we subscribe to the ready notification
  // and update state when the instance becomes available.
  useEffect(() => {
    return onMusicKitReady((inst) => {
      instanceRef.current = inst;
      onReadyRef.current?.();
    });
  }, []);

  // Track latest callbacks via refs to avoid resubscribing event listeners
  // every render (callbacks are recreated by React but the listeners are
  // expensive to add/remove on a hot path).
  const onProgressRef = useRef(onProgress);
  const onDurationRef = useRef(onDuration);
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const onEndedRef = useRef(onEnded);
  onProgressRef.current = onProgress;
  onDurationRef.current = onDuration;
  onPlayRef.current = onPlay;
  onPauseRef.current = onPause;
  onEndedRef.current = onEnded;

  // Wire up MusicKit event listeners once the instance is available.
  useEffect(() => {
    let cancelled = false;
    let activeInstance: MusicKit.MusicKitInstance | null = null;

    const handleTime = (event: MusicKit.PlaybackTimeDidChangeEvent) => {
      const seconds =
        event?.currentPlaybackTime ?? activeInstance?.currentPlaybackTime ?? 0;
      onProgressRef.current?.({ playedSeconds: seconds });
    };

    const handleState = (event: MusicKit.PlaybackStateDidChangeEvent) => {
      const state = event?.state ?? activeInstance?.playbackState;
      switch (state) {
        case 2: // playing
          onPlayRef.current?.();
          break;
        case 3: // paused
        case 4: // stopped
          onPauseRef.current?.();
          break;
        case 5: // ended
        case 10: // completed
          onEndedRef.current?.();
          break;
        default:
          // loading/seeking/waiting/stalled — no-op for the iPod UI;
          // the activity indicator is driven separately.
          break;
      }
    };

    const handleMediaItem = (event: MusicKit.MediaItemDidChangeEvent) => {
      const durationMs =
        event.item?.attributes?.durationInMillis ??
        event.item?.playbackDuration ??
        0;
      if (durationMs > 0) {
        onDurationRef.current?.(durationMs / 1000);
      }
    };

    const tryAttach = (inst: MusicKit.MusicKitInstance | null) => {
      if (cancelled || !inst) return;
      if (activeInstance === inst) return;
      activeInstance = inst;
      inst.addEventListener("playbackTimeDidChange", handleTime);
      inst.addEventListener("playbackStateDidChange", handleState);
      inst.addEventListener("mediaItemDidChange", handleMediaItem);
      // Some MusicKit builds emit nowPlayingItemDidChange instead.
      inst.addEventListener("nowPlayingItemDidChange", handleMediaItem);
    };

    tryAttach(instanceRef.current);
    const unsubscribe = onMusicKitReady((inst) => tryAttach(inst));

    return () => {
      cancelled = true;
      unsubscribe();
      if (activeInstance) {
        activeInstance.removeEventListener("playbackTimeDidChange", handleTime);
        activeInstance.removeEventListener(
          "playbackStateDidChange",
          handleState
        );
        activeInstance.removeEventListener(
          "mediaItemDidChange",
          handleMediaItem
        );
        activeInstance.removeEventListener(
          "nowPlayingItemDidChange",
          handleMediaItem
        );
      }
    };
  }, []);

  // Sync volume — MusicKit reads `volume` as a number in [0, 1].
  useEffect(() => {
    const inst = instanceRef.current;
    if (!inst) return;
    try {
      // `volume` is typed as readonly in our minimal d.ts, but it's settable
      // in practice. We cast through `unknown` to silence the compiler
      // without losing the rest of the typings.
      (inst as unknown as { volume: number }).volume = Math.max(
        0,
        Math.min(1, volume)
      );
    } catch (err) {
      console.warn("[apple music] failed to set volume", err);
    }
  }, [volume]);

  // Stable representation of the queue so we only call setQueue when the
  // *track* (not unrelated prop changes) actually flips.
  const queueKey = useMemo(() => currentTrack?.id ?? null, [currentTrack]);

  // Drive `setQueue` on track change.
  useEffect(() => {
    const inst = instanceRef.current;
    if (!inst) return;
    if (!currentTrack) {
      // No track — stop the player so we don't keep audio bleeding from
      // the previously queued song after the user clears the library.
      try {
        inst.stop();
      } catch {
        /* ignore */
      }
      lastQueuedTrackIdRef.current = null;
      return;
    }
    if (lastQueuedTrackIdRef.current === queueKey) return;

    const queueOptions = getQueueOptions(currentTrack);
    if (!queueOptions) {
      console.warn(
        "[apple music] track is missing playParams, skipping",
        currentTrack
      );
      return;
    }

    const localQueueKey = queueKey;
    queueLoadingRef.current = (async () => {
      try {
        await inst.setQueue({ ...queueOptions, startPlaying: playing });
        // Honour the requested duration immediately if MusicKit doesn't
        // emit a media-item event before the next render.
        if (currentTrack.durationMs && currentTrack.durationMs > 0) {
          onDurationRef.current?.(currentTrack.durationMs / 1000);
        }
        if (lastQueuedTrackIdRef.current === localQueueKey) return; // re-entrancy
        lastQueuedTrackIdRef.current = localQueueKey;
        if (playing) {
          await inst.play().catch((err) => {
            // Browsers block autoplay until the user interacts; surface as
            // a paused state so the iPod's play button shows the right icon.
            console.warn(
              "[apple music] play() blocked, awaiting user gesture",
              err
            );
            onPauseRef.current?.();
          });
        }
      } catch (err) {
        console.error("[apple music] setQueue failed", err);
      } finally {
        queueLoadingRef.current = null;
      }
    })();
    // We intentionally only depend on `queueKey` here — `playing` toggling
    // alone shouldn't trigger a re-queue (handled by the next effect).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueKey]);

  // Sync play/pause without re-queueing.
  useEffect(() => {
    const inst = instanceRef.current;
    if (!inst) return;
    if (!currentTrack) return;
    // Wait for setQueue to finish if it's mid-flight.
    const pending = queueLoadingRef.current;
    const apply = async () => {
      try {
        if (pending) await pending;
        if (playing) {
          await inst.play();
        } else {
          inst.pause();
        }
      } catch (err) {
        console.warn("[apple music] play/pause failed", err);
      }
    };
    void apply();
  }, [playing, currentTrack]);

  useImperativeHandle(
    ref,
    () => ({
      seekTo(seconds: number) {
        const inst = instanceRef.current;
        if (!inst) return;
        inst.seekToTime(seconds).catch((err) => {
          console.warn("[apple music] seekToTime failed", err);
        });
      },
      getCurrentTime() {
        return instanceRef.current?.currentPlaybackTime ?? 0;
      },
      getInternalPlayer() {
        return instanceRef.current;
      },
    }),
    []
  );

  return null;
});
