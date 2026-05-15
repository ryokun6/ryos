import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Track } from "@/stores/useIpodStore";
import { onMusicKitReady } from "@/hooks/useMusicKit";
import { PLAYER_PROGRESS_INTERVAL_MS } from "../constants";
import {
  buildAppleMusicQueueOptions,
  resolveAppleMusicQueueTrackIdFromMediaItem,
  getMusicKitEventItemId,
  isWithinEndedFanoutDedupWindow,
  shouldFireEndedForPlaybackState,
  shouldSyncQueueTrackFromMediaItem,
} from "./appleMusicPlayerBridgeUtils";

/**
 * Apple Music playback bridge.
 *
 * Renders nothing (MusicKit JS owns the actual `<audio>` element internally)
 * but mirrors the parts of `react-player`'s imperative API that the iPod
 * logic depends on (`seekTo`, `getCurrentTime`, `getInternalPlayer`).
 *
 * Lifecycle:
 *   - When the iPod starts a track, the bridge calls `setQueue` with the
 *     active MusicKit queue (song array, station, or playlist), then
 *     plays/pauses to match `playing`.
 *   - Listens to `playbackTimeDidChange` / `playbackStateDidChange` /
 *     `mediaItemDidChange` to drive `onProgress` / `onPlay` / `onPause` /
 *     `onDuration` callbacks identical to `react-player`'s shape.
 *   - Honours `volume` (0–1).
 */

export interface AppleMusicPlayerBridgeProps {
  /** Current Apple Music track to play. Triggers `setQueue` on change. */
  currentTrack: Track | null;
  /** Active iPod context queue. Song queues are handed to MusicKit as-is. */
  queueTracks?: Track[] | null;
  /** Whether playback should be active. */
  playing: boolean;
  /** Saved playback position to seek to after queueing a track. */
  resumeAtSeconds?: number;
  /** Volume in [0, 1]. */
  volume: number;
  onProgress?: (state: { playedSeconds: number }) => void;
  onDuration?: (duration: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onReady?: () => void;
  onNowPlayingItemChange?: (
    metadata: AppleMusicNowPlayingMetadata | null
  ) => void;
  onQueueTrackChange?: (trackId: string) => void;
}

export interface AppleMusicPlayerBridgeHandle {
  seekTo(seconds: number): void;
  getCurrentTime(): number;
  getInternalPlayer(): MusicKit.MusicKitInstance | null;
}

export interface AppleMusicNowPlayingMetadata {
  id?: string;
  title: string;
  artist?: string;
  album?: string;
  cover?: string;
}

function getSafeStartSeconds(
  track: Track,
  startSeconds: number | undefined
): number | null {
  const seconds = startSeconds ?? 0;
  const durationSeconds = track.durationMs ? track.durationMs / 1000 : null;
  if (!Number.isFinite(seconds) || seconds <= 0.25) return null;
  if (durationSeconds != null && seconds >= durationSeconds - 0.5) return null;
  return seconds;
}

function resolveArtworkUrl(
  artwork: MusicKit.MediaItemArtwork | undefined,
  size = 600
): string | undefined {
  return artwork?.url?.replace("{w}", String(size)).replace("{h}", String(size));
}

function mediaItemToNowPlayingMetadata(
  item: MusicKit.MediaItem | undefined
): AppleMusicNowPlayingMetadata | null {
  if (!item) return null;
  const attrs = item.attributes;
  const title = attrs?.name || item.title;
  if (!title) return null;

  return {
    id: item.id || attrs?.playParams?.id,
    title,
    artist: attrs?.artistName || item.artistName,
    album: attrs?.albumName || item.albumName,
    cover: resolveArtworkUrl(attrs?.artwork) || item.artworkURL,
  };
}

export const AppleMusicPlayerBridge = function AppleMusicPlayerBridge(
  {
    ref,
    currentTrack,
    queueTracks,
    playing,
    resumeAtSeconds,
    volume,
    onProgress,
    onDuration,
    onPlay,
    onPause,
    onEnded,
    onReady,
    onNowPlayingItemChange,
    onQueueTrackChange
  }: AppleMusicPlayerBridgeProps & {
    ref?: React.Ref<AppleMusicPlayerBridgeHandle>;
  }
) {
  const instanceRef = useRef<MusicKit.MusicKitInstance | null>(null);
  const [instanceReadyTick, setInstanceReadyTick] = useState(0);
  const lastQueuedRequestKeyRef = useRef<string | null>(null);
  const lastQueuedDefinitionKeyRef = useRef<string | null>(null);
  const queuedTrackIdsRef = useRef<string[]>([]);
  const isMultiSongQueueRef = useRef(false);
  const suppressedQueueTrackIdRef = useRef<string | null>(null);
  /** Blocks MusicKit→iPod sync while a user-selected track is being queued. */
  const playbackTargetTrackIdRef = useRef<string | null>(null);
  const queueLoadingRef = useRef<Promise<void> | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // Bind the singleton — useMusicKit may not have completed configure() yet
  // when the iPod first mounts, so we subscribe to the ready notification
  // and update state when the instance becomes available.
  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onMusicKitReady((inst) => {
      if (cancelled) return;
      instanceRef.current = inst;
      setInstanceReadyTick((tick) => tick + 1);
      onReadyRef.current?.();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Stop MusicKit on unmount.
  //
  // MusicKit JS owns its own internal `<audio>` element that is NOT a child
  // of this React tree, so unmounting the bridge does not stop playback on
  // its own — the song would keep playing in the background after the iPod
  // window closes (or the librarySource flips back to YouTube). Force a
  // stop here so closing the iPod always silences Apple Music.
  useEffect(() => {
    return () => {
      const inst = instanceRef.current;
      if (!inst) return;
      try {
        inst.stop();
      } catch (err) {
        try {
          inst.pause();
        } catch {
          /* ignore — unmount is best-effort */
        }
        console.warn("[apple music] stop() on unmount failed", err);
      }
    };
  }, []);

  // Track latest callbacks via refs to avoid resubscribing event listeners
  // every render (callbacks are recreated by React but the listeners are
  // expensive to add/remove on a hot path).
  const onProgressRef = useRef(onProgress);
  const onDurationRef = useRef(onDuration);
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const onEndedRef = useRef(onEnded);
  const onNowPlayingItemChangeRef = useRef(onNowPlayingItemChange);
  const onQueueTrackChangeRef = useRef(onQueueTrackChange);
  onProgressRef.current = onProgress;
  onDurationRef.current = onDuration;
  onPlayRef.current = onPlay;
  onPauseRef.current = onPause;
  onEndedRef.current = onEnded;
  onNowPlayingItemChangeRef.current = onNowPlayingItemChange;
  onQueueTrackChangeRef.current = onQueueTrackChange;

  // Track latest currentTrack so the once-only event listeners can read it
  // without resubscribing on every render.
  const currentTrackRef = useRef(currentTrack);
  currentTrackRef.current = currentTrack;
  const queueTracksRef = useRef(queueTracks);
  queueTracksRef.current = queueTracks;

  // Dedup state for `onEnded` fan-out. MusicKit JS fires both `ended`
  // (5) and `completed` (10) when a single-song queue's only item
  // finishes. Without dedup the parent's `nextTrack` runs twice — the
  // second pick races MusicKit's first `setQueue`, so the audio the user
  // hears can mismatch the song the iPod displays. With shuffle on the
  // mismatch is the most visible because each call picks a different
  // random song.
  //
  // Two layers (either match suppresses):
  //  - `lastEndedFiredForItemIdRef`: the just-ended item id. State 5 and
  //    state 10 reference the SAME item, so identical ids dedup
  //    regardless of timing.
  //  - `lastEndedFiredAtRef`: wall-clock timestamp + window. Backstop for
  //    builds that strip `event.item` from the second event.
  const lastEndedFiredForItemIdRef = useRef<string | null>(null);
  const lastEndedFiredAtRef = useRef(0);

  const emitDurationForMediaItem = (
    item: MusicKit.MediaItem | null | undefined
  ) => {
    const durationMs =
      item?.attributes?.durationInMillis ?? item?.playbackDuration ?? 0;
    if (durationMs > 0) {
      onDurationRef.current?.(durationMs / 1000);
    }
  };

  const syncQueueTrackFromMediaItem = (
    item: MusicKit.MediaItem | null | undefined
  ): boolean => {
    if (queuedTrackIdsRef.current.length === 0) return false;
    const trackId = resolveAppleMusicQueueTrackIdFromMediaItem(
      item,
      (queueTracksRef.current ?? []).filter((track) =>
        queuedTrackIdsRef.current.includes(track.id)
      )
    );
    if (
      !trackId ||
      !shouldSyncQueueTrackFromMediaItem(
        trackId,
        currentTrackRef.current?.id,
        playbackTargetTrackIdRef.current,
        queuedTrackIdsRef.current
      )
    ) {
      return false;
    }
    suppressedQueueTrackIdRef.current = trackId;
    onQueueTrackChangeRef.current?.(trackId);
    emitDurationForMediaItem(item);
    return true;
  };

  // Wire up MusicKit event listeners once the instance is available.
  // We deliberately skip `playbackTimeDidChange` for progress updates:
  // runtime logs (debug session b224e4) confirmed that MusicKit JS v3's
  // `currentPlaybackTime` is rounded to integer seconds — both the
  // polling read and the event payload return values like 7, 7, 7, 7,
  // 8, 8, 8, 8, 9. That gives the lyrics view 1-second "step"
  // updates, which renders as the stutter the user reported.
  // Instead, the polling effect below interpolates using wall-clock
  // time between MusicKit's integer ticks, producing smooth sub-second
  // progress. The native time event is therefore not needed at all
  // (it would just race the interpolated source with stale integer
  // values). State + media-item events are still useful and remain.
  useEffect(() => {
    let cancelled = false;
    let activeInstance: MusicKit.MusicKitInstance | null = null;

    const handleState = (event: MusicKit.PlaybackStateDidChangeEvent) => {
      const state = event?.state ?? activeInstance?.playbackState;
      if (state === 2) {
        onPlayRef.current?.();
        return;
      }
      if (state === 3 || state === 4) {
        onPauseRef.current?.();
        return;
      }
      if (
        (state === 5 || state === 10) &&
        shouldFireEndedForPlaybackState(
          state,
          currentTrackRef.current,
          isMultiSongQueueRef.current
        )
      ) {
        // MusicKit fires both `ended` (5) and `completed` (10) when a
        // single-song queue's only item finishes — dedup so the parent's
        // next-track handler runs once per song-ending event. Most
        // visible with shuffle on, where two fan-outs would pick two
        // different random songs and race two `setQueue` calls in
        // MusicKit, leaving the audio on a different song than the
        // display.
        const now = Date.now();
        const eventItemId = getMusicKitEventItemId(event?.item);
        const itemIdMatches =
          eventItemId !== null &&
          lastEndedFiredForItemIdRef.current === eventItemId;
        const withinTimeWindow = isWithinEndedFanoutDedupWindow(
          now,
          lastEndedFiredAtRef.current
        );
        if (itemIdMatches || withinTimeWindow) {
          return;
        }
        if (eventItemId !== null) {
          lastEndedFiredForItemIdRef.current = eventItemId;
        }
        lastEndedFiredAtRef.current = now;
        onEndedRef.current?.();
        return;
      }
      // loading/seeking/waiting/stalled and the suppressed mid-queue
      // `ended` for shells — no-op for the iPod UI; the activity
      // indicator is driven separately.
    };

    const handleMediaItem = (event: MusicKit.MediaItemDidChangeEvent) => {
      if (!syncQueueTrackFromMediaItem(event.item)) {
        emitDurationForMediaItem(event.item);
      }
      onNowPlayingItemChangeRef.current?.(
        mediaItemToNowPlayingMetadata(event.item)
      );
    };

    const tryAttach = (inst: MusicKit.MusicKitInstance | null) => {
      if (cancelled || !inst) return;
      if (activeInstance === inst) return;
      activeInstance = inst;
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

  // Steady-cadence progress polling with wall-clock interpolation.
  //
  // Why interpolate: MusicKit JS v3's `currentPlaybackTime` is rounded
  // to integer seconds (verified in debug session b224e4). Polling
  // every 200ms therefore yields five identical reads followed by a
  // sudden +1 jump, which the lyrics view renders as visible stutter.
  // Instead we snapshot a baseline every time the integer changes, and
  // between updates report `baseSeconds + (now - baseWallClock) /
  // 1000`, capped at +1s so we never run past the next integer tick
  // (which would cause a tiny rewind when the next integer arrives).
  //
  // Why requestAnimationFrame: setInterval keeps firing even when the
  // tab is hidden (just throttled to ~1Hz by the browser), wasting
  // React render cycles for music nobody is looking at. rAF
  // automatically pauses when the tab/page isn't visible. We still
  // throttle React state pushes to ~PLAYER_PROGRESS_INTERVAL_MS using
  // the wall clock, so the lyrics view sees the same ~5Hz update rate
  // as before — just without background-tab waste.
  useEffect(() => {
    if (!playing || !currentTrack) return;
    let cancelled = false;
    let rafId: number | null = null;
    let baseSeconds: number | null = null;
    let baseWallClock = 0;
    let lastReportedSeconds = -1;
    let lastEmittedAt = 0;

    const emit = (now: number) => {
      const inst = instanceRef.current;
      if (!inst) return;
      const rawSeconds = inst.currentPlaybackTime ?? 0;
      syncQueueTrackFromMediaItem(inst.nowPlayingItem);

      // First read or whenever the underlying integer changes (forward
      // OR backward, e.g. seek), reset the interpolation baseline.
      if (baseSeconds === null || rawSeconds !== lastReportedSeconds) {
        baseSeconds = rawSeconds;
        baseWallClock = now;
        lastReportedSeconds = rawSeconds;
      }

      const elapsed = (now - baseWallClock) / 1000;
      // Cap at just under 1s so we never overshoot the next tick — if
      // MusicKit's clock jumped forward by exactly 1s, we'd otherwise
      // briefly report the same value as the next integer and then
      // visibly rewind when interpolation restarts.
      const interpolated = baseSeconds + Math.min(elapsed, 0.99);

      onProgressRef.current?.({ playedSeconds: interpolated });
      lastEmittedAt = now;
    };

    const frame = () => {
      if (cancelled) return;
      const now = Date.now();
      // Throttle to PLAYER_PROGRESS_INTERVAL_MS so we don't push 60
      // updates/sec into React. rAF gives us automatic
      // pause-on-hidden-tab; the throttle keeps the React workload
      // identical to the old setInterval-based path.
      if (now - lastEmittedAt >= PLAYER_PROGRESS_INTERVAL_MS) {
        emit(now);
      }
      rafId = requestAnimationFrame(frame);
    };

    const startPolling = () => {
      if (rafId !== null || cancelled) return;
      const now = Date.now();
      emit(now);
      rafId = requestAnimationFrame(frame);
    };

    if (instanceRef.current) {
      startPolling();
    } else {
      const unsubscribe = onMusicKitReady(() => startPolling());
      return () => {
        cancelled = true;
        unsubscribe();
        if (rafId !== null) cancelAnimationFrame(rafId);
      };
    }

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [playing, currentTrack]);

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

  // Stable representation of the queue so MusicKit only receives a fresh
  // queue for explicit iPod selections, not for native auto-advances.
  const queueBuild = useMemo(
    () =>
      currentTrack
        ? buildAppleMusicQueueOptions(currentTrack, queueTracks)
        : null,
    [currentTrack, queueTracks]
  );
  const queueKey = queueBuild?.requestKey ?? null;

  // Latest `playing` value, read inside the async setQueue effect to avoid
  // stale closures when the user toggles play before the queue resolves.
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const resumeAtSecondsRef = useRef(resumeAtSeconds);
  resumeAtSecondsRef.current = resumeAtSeconds;

  // Drive `setQueue` on track change.
  useEffect(() => {
    let cancelled = false;
    const inst = instanceRef.current;
    if (!inst) return;
    if (!currentTrack) {
      try {
        inst.stop();
      } catch {
        /* ignore */
      }
      onNowPlayingItemChangeRef.current?.(null);
      lastQueuedRequestKeyRef.current = null;
      lastQueuedDefinitionKeyRef.current = null;
      queuedTrackIdsRef.current = [];
      isMultiSongQueueRef.current = false;
      playbackTargetTrackIdRef.current = null;
      return;
    }
    if (!queueBuild) {
      console.warn(
        "[apple music] track is missing playParams, skipping",
        currentTrack
      );
      return;
    }
    if (lastQueuedRequestKeyRef.current === queueBuild.requestKey) return;
    if (
      suppressedQueueTrackIdRef.current === currentTrack.id &&
      lastQueuedDefinitionKeyRef.current === queueBuild.definitionKey
    ) {
      suppressedQueueTrackIdRef.current = null;
      lastQueuedRequestKeyRef.current = queueBuild.requestKey;
      return;
    }
    onNowPlayingItemChangeRef.current?.(null);
    suppressedQueueTrackIdRef.current = null;
    playbackTargetTrackIdRef.current = currentTrack.id;

    const localQueueBuild = queueBuild;
    // Serialize back-to-back queue swaps. If another track change is
    // already in flight (rapid `nextTrack` clicks, an `onEnded` advance
    // racing a user press, etc.), wait for it to settle before issuing
    // our own `setQueue`. Two concurrent `setQueue` calls inside
    // MusicKit can resolve out of order — without serialization the
    // older queue can briefly start playing after the newer one
    // landed, so the audio mismatches the song the iPod displays
    // (display reflects the *latest* React state, audio reflects
    // whichever `setQueue` resolved last). Capture the *previous* ref
    // so the new chain awaits the old one rather than itself.
    const previousQueueLoading = queueLoadingRef.current;
    let thisLoad: Promise<void> | null = null;
    thisLoad = (async () => {
      if (previousQueueLoading) {
        // Best-effort wait — failures of the previous queue load
        // shouldn't block a fresh user action.
        try {
          await previousQueueLoading;
        } catch {
          /* ignore — the previous load already logged its own error */
        }
        if (cancelled) return;
      }
      try {
        const resumeSeconds = getSafeStartSeconds(
          currentTrack,
          resumeAtSecondsRef.current
        );
        await inst.setQueue({
          ...localQueueBuild.options,
          startTime: resumeSeconds ?? undefined,
          // Queue paused first so a restored elapsedTime can be applied
          // before any audible playback starts.
          startPlaying: false,
        });
        if (cancelled) return;
        if (resumeSeconds != null) {
          await inst.seekToTime(resumeSeconds).catch((err) => {
            console.warn("[apple music] resume seek failed", err);
          });
        }
        if (cancelled) return;
        if (currentTrack.durationMs && currentTrack.durationMs > 0) {
          onDurationRef.current?.(currentTrack.durationMs / 1000);
        }
        lastQueuedRequestKeyRef.current = localQueueBuild.requestKey;
        lastQueuedDefinitionKeyRef.current = localQueueBuild.definitionKey;
        queuedTrackIdsRef.current = localQueueBuild.queuedTrackIds;
        isMultiSongQueueRef.current = localQueueBuild.isMultiSongQueue;
        if (playingRef.current) {
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
        // Only clear the shared ref when *we* are still the most recent
        // load. A newer track change already replaced `queueLoadingRef`
        // with its own promise; nulling here would let play/pause sync
        // think there's no pending queue load and race the newer
        // `setQueue` mid-flight.
        if (queueLoadingRef.current === thisLoad) {
          queueLoadingRef.current = null;
        }
        if (playbackTargetTrackIdRef.current === currentTrack.id) {
          playbackTargetTrackIdRef.current = null;
        }
      }
    })();
    queueLoadingRef.current = thisLoad;
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueKey, queueBuild, currentTrack, instanceReadyTick]);

  // Sync play/pause without re-queueing.
  useEffect(() => {
    const inst = instanceRef.current;
    if (!inst) return;
    if (!currentTrack) return;
    const pending = queueLoadingRef.current;
    const apply = async () => {
      try {
        if (pending) await pending;
        if (playing) {
          const startSeconds = getSafeStartSeconds(
            currentTrack,
            resumeAtSecondsRef.current
          );
          if (startSeconds != null) {
            await inst.seekToTime(startSeconds).catch((err) => {
              console.warn("[apple music] play seek failed", err);
            });
          }
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
        const apply = async () => {
          const pending = queueLoadingRef.current;
          if (pending) await pending;
          await inst.seekToTime(seconds);
        };
        apply().catch((err) => {
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
};
