import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Track } from "@/stores/useIpodStore";
import { getMusicKitInstance, onMusicKitReady } from "@/hooks/useMusicKit";
import { PLAYER_PROGRESS_INTERVAL_MS } from "../constants";
import {
  getMusicKitEventItemId,
  isNewMusicKitInstance,
  isLikelyMusicKitUnhandledRejection,
  isMusicKitPlaying,
  isMusicKitRedundantPlayError,
  isStaleQueueLoad,
  isWithinEndedFanoutDedupWindow,
  shouldConfirmPlaybackAfterQueueLoad,
  shouldFireEndedForPlaybackState,
  shouldSuppressPlaybackStateFanoutWhileQueueLoading,
} from "./appleMusicPlayerBridgeUtils";
import { createClientLogger } from "@/utils/logger";

const appleMusicLog = createClientLogger("AppleMusic");

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

function getQueueOptions(track: Track): MusicKit.SetQueueOptions | null {
  const params = track.appleMusicPlayParams;
  if (!params) return null;
  if (params.stationId) {
    return { station: params.stationId, startPlaying: true };
  }
  if (params.playlistId) {
    return { playlist: params.playlistId, startPlaying: true };
  }
  // Prefer catalog ID for streaming. Fall back to the library ID when the
  // track is library-only (no catalog match available).
  const id =
    params.kind === "library-songs"
      ? params.libraryId || params.catalogId
      : params.catalogId || params.libraryId;
  if (!id) return null;
  return { song: id, startPlaying: true };
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

function summarizeTrackForLog(track: Track | null): Record<string, unknown> | null {
  if (!track) return null;
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    source: track.source,
    hasPlayParams: Boolean(track.appleMusicPlayParams),
    playParams: track.appleMusicPlayParams
      ? {
          kind: track.appleMusicPlayParams.kind,
          hasCatalogId: Boolean(track.appleMusicPlayParams.catalogId),
          hasLibraryId: Boolean(track.appleMusicPlayParams.libraryId),
          hasStationId: Boolean(track.appleMusicPlayParams.stationId),
          hasPlaylistId: Boolean(track.appleMusicPlayParams.playlistId),
        }
      : null,
  };
}

function callBridgeCallback(
  name: string,
  callback: (() => unknown) | undefined,
  context: Record<string, unknown>
): void {
  try {
    const result = callback?.();
    void Promise.resolve(result).catch((error) => {
      appleMusicLog.error("Player bridge callback rejected", {
        callback: name,
        error,
        context,
      });
    });
  } catch (error) {
    appleMusicLog.error("Player bridge callback threw", {
      callback: name,
      error,
      context,
    });
  }
}

export const AppleMusicPlayerBridge = function AppleMusicPlayerBridge(
  {
    ref,
    currentTrack,
    playing,
    resumeAtSeconds,
    volume,
    onProgress,
    onDuration,
    onPlay,
    onPause,
    onEnded,
    onReady,
    onNowPlayingItemChange
  }: AppleMusicPlayerBridgeProps & {
    ref?: React.Ref<AppleMusicPlayerBridgeHandle>;
  }
) {
  const instanceRef = useRef<MusicKit.MusicKitInstance | null>(
    getMusicKitInstance()
  );
  const [instanceReadyTick, setInstanceReadyTick] = useState(() =>
    getMusicKitInstance() ? 1 : 0
  );
  const lastQueuedTrackIdRef = useRef<string | null>(null);
  const queueGenerationRef = useRef(0);
  const queueLoadingRef = useRef<Promise<void> | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // Bind the singleton — useMusicKit may not have completed configure() yet
  // when the iPod first mounts, so we subscribe to the ready notification
  // and update state when the instance becomes available.
  useEffect(() => {
    let cancelled = false;
    appleMusicLog.debug("Mounted player bridge", {
      hasInitialInstance: instanceRef.current !== null,
      currentTrack: summarizeTrackForLog(currentTrackRef.current),
    });
    const unsubscribe = onMusicKitReady((inst) => {
      if (cancelled) return;
      const instanceChanged = isNewMusicKitInstance(instanceRef.current, inst);
      instanceRef.current = inst;
      appleMusicLog.debug("Player bridge received MusicKit instance", {
        isAuthorized: inst.isAuthorized,
        playbackState: inst.playbackState,
        storefrontId: inst.storefrontId,
      });
      if (instanceChanged) {
        setInstanceReadyTick((tick) => tick + 1);
      }
      onReadyRef.current?.();
    });
    return () => {
      cancelled = true;
      unsubscribe();
      appleMusicLog.debug("Unmounted player bridge");
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
        appleMusicLog.debug("Stopping playback while unmounting player bridge", {
          playbackState: inst.playbackState,
          currentTrack: summarizeTrackForLog(currentTrackRef.current),
        });
        inst.stop();
      } catch (err) {
        try {
          inst.pause();
        } catch {
          /* ignore — unmount is best-effort */
        }
        appleMusicLog.warn("Could not stop playback while unmounting", {
          error: err,
        });
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
  onProgressRef.current = onProgress;
  onDurationRef.current = onDuration;
  onPlayRef.current = onPlay;
  onPauseRef.current = onPause;
  onEndedRef.current = onEnded;
  onNowPlayingItemChangeRef.current = onNowPlayingItemChange;

  // Track latest currentTrack so the once-only event listeners can read it
  // without resubscribing on every render.
  const currentTrackRef = useRef(currentTrack);
  currentTrackRef.current = currentTrack;

  const getBridgeSnapshot = useCallback(() => {
    const inst = instanceRef.current;
    return {
      currentTrack: summarizeTrackForLog(currentTrackRef.current),
      queuedTrackId: lastQueuedTrackIdRef.current,
      queueGeneration: queueGenerationRef.current,
      hasPendingQueueLoad: queueLoadingRef.current !== null,
      instance: inst
        ? {
            isAuthorized: inst.isAuthorized,
            playbackState: inst.playbackState,
            currentPlaybackTime: inst.currentPlaybackTime,
            storefrontId: inst.storefrontId,
          }
        : null,
    };
  }, []);

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
      const eventItemId = getMusicKitEventItemId(event?.item);
      appleMusicLog.debug("MusicKit playback state changed", {
        state,
        eventItemId,
        snapshot: getBridgeSnapshot(),
      });
      if (
        shouldSuppressPlaybackStateFanoutWhileQueueLoading(
          queueLoadingRef.current !== null,
          state
        )
      ) {
        appleMusicLog.debug(
          "Ignored playback state change while loading a new queue",
          {
          state,
          eventItemId,
          queueGeneration: queueGenerationRef.current,
          }
        );
        return;
      }
      if (state === 2) {
        callBridgeCallback("playbackStateDidChange:onPlay", onPlayRef.current, {
          state,
          snapshot: getBridgeSnapshot(),
        });
        return;
      }
      if (state === 3 || state === 4) {
        callBridgeCallback("playbackStateDidChange:onPause", onPauseRef.current, {
          state,
          snapshot: getBridgeSnapshot(),
        });
        return;
      }
      if (
        (state === 5 || state === 10) &&
        shouldFireEndedForPlaybackState(state, currentTrackRef.current)
      ) {
        // MusicKit fires both `ended` (5) and `completed` (10) when a
        // single-song queue's only item finishes — dedup so the parent's
        // next-track handler runs once per song-ending event. Most
        // visible with shuffle on, where two fan-outs would pick two
        // different random songs and race two `setQueue` calls in
        // MusicKit, leaving the audio on a different song than the
        // display.
        const now = Date.now();
        const itemIdMatches =
          eventItemId !== null &&
          lastEndedFiredForItemIdRef.current === eventItemId;
        const withinTimeWindow = isWithinEndedFanoutDedupWindow(
          now,
          lastEndedFiredAtRef.current
        );
        if (itemIdMatches || withinTimeWindow) {
          appleMusicLog.debug("Ignored duplicate track-ended event", {
            state,
            eventItemId,
            itemIdMatches,
            withinTimeWindow,
            elapsedSinceLastEndedMs: now - lastEndedFiredAtRef.current,
          });
          return;
        }
        if (eventItemId !== null) {
          lastEndedFiredForItemIdRef.current = eventItemId;
        }
        lastEndedFiredAtRef.current = now;
        callBridgeCallback("playbackStateDidChange:onEnded", onEndedRef.current, {
          state,
          eventItemId,
          snapshot: getBridgeSnapshot(),
        });
        return;
      }
      // loading/seeking/waiting/stalled and the suppressed mid-queue
      // `ended` for shells — no-op for the iPod UI; the activity
      // indicator is driven separately.
    };

    const handleMediaItem = (event: MusicKit.MediaItemDidChangeEvent) => {
      const durationMs =
        event.item?.attributes?.durationInMillis ??
        event.item?.playbackDuration ??
        0;
      appleMusicLog.debug("MusicKit media item changed", {
        itemId: getMusicKitEventItemId(event.item),
        durationMs,
        metadata: mediaItemToNowPlayingMetadata(event.item),
        snapshot: getBridgeSnapshot(),
      });
      if (durationMs > 0) {
        callBridgeCallback(
          "mediaItemDidChange:onDuration",
          () => onDurationRef.current?.(durationMs / 1000),
          { durationMs, snapshot: getBridgeSnapshot() }
        );
      }
      callBridgeCallback(
        "mediaItemDidChange:onNowPlayingItemChange",
        () =>
          onNowPlayingItemChangeRef.current?.(
            mediaItemToNowPlayingMetadata(event.item)
          ),
        {
          itemId: getMusicKitEventItemId(event.item),
          snapshot: getBridgeSnapshot(),
        }
      );
    };

    const tryAttach = (inst: MusicKit.MusicKitInstance | null) => {
      if (cancelled || !inst) return;
      if (activeInstance === inst) return;
      activeInstance = inst;
      appleMusicLog.debug("Attached MusicKit player event listeners", {
        isAuthorized: inst.isAuthorized,
        playbackState: inst.playbackState,
      });
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
        appleMusicLog.debug("Detached MusicKit player event listeners", {
          playbackState: activeInstance.playbackState,
        });
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
  }, [getBridgeSnapshot]);

  // MusicKit JS can reject inside its own event dispatcher, outside any promise
  // we directly await. Convert those known MusicKit-owned unhandled rejections
  // into scoped logs with playback context, but let unrelated app rejections
  // keep bubbling to the global console capture.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!isLikelyMusicKitUnhandledRejection(event.reason)) return;
      event.preventDefault();
      const payload = {
        error: event.reason,
        snapshot: getBridgeSnapshot(),
      };
      if (isMusicKitRedundantPlayError(event.reason)) {
        appleMusicLog.warn("Ignored redundant MusicKit play request", payload);
        return;
      }
      appleMusicLog.error("MusicKit reported an unhandled rejection", payload);
    };
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [getBridgeSnapshot]);

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
    if (!inst) {
      appleMusicLog.debug(
        "Skipped volume update because MusicKit is unavailable",
        { volume }
      );
      return;
    }
    try {
      // `volume` is typed as readonly in our minimal d.ts, but it's settable
      // in practice. We cast through `unknown` to silence the compiler
      // without losing the rest of the typings.
      (inst as unknown as { volume: number }).volume = Math.max(
        0,
        Math.min(1, volume)
      );
      appleMusicLog.debug("Updated player volume", { volume });
    } catch (err) {
      appleMusicLog.warn("Could not update player volume", {
        error: err,
        volume,
        snapshot: getBridgeSnapshot(),
      });
    }
  }, [getBridgeSnapshot, volume]);

  // Stable representation of the queue so we only call setQueue when the
  // *track* (not unrelated prop changes) actually flips.
  const queueKey = useMemo(() => currentTrack?.id ?? null, [currentTrack]);

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
    if (!inst) {
      appleMusicLog.debug("Skipped queue update because MusicKit is unavailable", {
        queueKey,
        currentTrack: summarizeTrackForLog(currentTrack),
      });
      return;
    }
    if (!currentTrack) {
      appleMusicLog.debug("Clearing the MusicKit queue", {
        previousQueuedTrackId: lastQueuedTrackIdRef.current,
        snapshot: getBridgeSnapshot(),
      });
      try {
        inst.stop();
      } catch {
        /* ignore */
      }
      onNowPlayingItemChangeRef.current?.(null);
      lastQueuedTrackIdRef.current = null;
      return;
    }
    if (lastQueuedTrackIdRef.current === queueKey) {
      appleMusicLog.debug("Skipped queue update because the track is already queued", {
        queueKey,
      });
      return;
    }
    onNowPlayingItemChangeRef.current?.(null);

    const queueOptions = getQueueOptions(currentTrack);
    if (!queueOptions) {
      appleMusicLog.warn("Could not queue track because play parameters are missing", {
        currentTrack: summarizeTrackForLog(currentTrack),
        snapshot: getBridgeSnapshot(),
      });
      return;
    }

    const localQueueKey = currentTrack.id;
    const loadGeneration = ++queueGenerationRef.current;
    appleMusicLog.debug("Loading track into the MusicKit queue", {
      queueKey: localQueueKey,
      loadGeneration,
      currentTrack: summarizeTrackForLog(currentTrack),
      queueOptions,
      hadPreviousQueueLoad: queueLoadingRef.current !== null,
      shouldPlay: playingRef.current,
      resumeAtSeconds: resumeAtSecondsRef.current,
    });
    // Silence the outgoing track immediately so the user doesn't keep
    // hearing song A while the UI already shows song B and we're waiting
    // for a serialized `setQueue` or a prior in-flight load to settle.
    try {
      inst.pause();
    } catch {
      /* ignore — best-effort */
    }
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
      const isStale = () =>
        isStaleQueueLoad(
          loadGeneration,
          queueGenerationRef.current,
          cancelled
        );
      // Capture play intent up front. MusicKit emits `paused` while
      // `setQueue({ startPlaying: false })` runs; if we forwarded that to
      // the store, `playingRef` would flip false before this async block
      // finishes and we'd skip the post-queue `play()` call.
      const shouldPlayAfterQueue = playingRef.current;
      if (previousQueueLoading) {
        appleMusicLog.debug("Waiting for the previous queue update", {
          queueKey: localQueueKey,
          loadGeneration,
        });
        // Best-effort wait — failures of the previous queue load
        // shouldn't block a fresh user action.
        try {
          await previousQueueLoading;
        } catch {
          /* ignore — the previous load already logged its own error */
        }
        if (isStale()) {
          appleMusicLog.debug("Abandoned stale queue update after waiting", {
            queueKey: localQueueKey,
            loadGeneration,
            activeGeneration: queueGenerationRef.current,
          });
          return;
        }
      }
      try {
        const resumeSeconds = getSafeStartSeconds(
          currentTrack,
          resumeAtSecondsRef.current
        );
        appleMusicLog.debug("Calling MusicKit to replace the queue", {
          queueKey: localQueueKey,
          loadGeneration,
          resumeSeconds,
          shouldPlayAfterQueue,
        });
        await inst.setQueue({
          ...queueOptions,
          startTime: resumeSeconds ?? undefined,
          // Queue paused first so a restored elapsedTime can be applied
          // before any audible playback starts.
          startPlaying: false,
        });
        if (isStale()) {
          appleMusicLog.debug("Abandoned stale queue update after MusicKit resolved", {
            queueKey: localQueueKey,
            loadGeneration,
            activeGeneration: queueGenerationRef.current,
          });
          return;
        }
        appleMusicLog.debug("MusicKit queue replaced", {
          queueKey: localQueueKey,
          loadGeneration,
          snapshot: getBridgeSnapshot(),
        });
        if (resumeSeconds != null) {
          appleMusicLog.debug("Restoring saved playback position", {
            queueKey: localQueueKey,
            resumeSeconds,
          });
          await inst.seekToTime(resumeSeconds).catch((err) => {
            appleMusicLog.warn("Could not restore saved playback position", {
              error: err,
              resumeSeconds,
              snapshot: getBridgeSnapshot(),
            });
          });
        }
        if (isStale()) {
          appleMusicLog.debug("Abandoned stale queue update after seeking", {
            queueKey: localQueueKey,
            loadGeneration,
            activeGeneration: queueGenerationRef.current,
          });
          return;
        }
        const durationMs = currentTrack.durationMs;
        if (durationMs && durationMs > 0) {
          callBridgeCallback(
            "queue:onDuration",
            () => onDurationRef.current?.(durationMs / 1000),
            {
              durationMs,
              snapshot: getBridgeSnapshot(),
            }
          );
        }
        lastQueuedTrackIdRef.current = localQueueKey;
        if (shouldPlayAfterQueue && !isMusicKitPlaying(inst.playbackState)) {
          appleMusicLog.debug("Starting playback for the new queue", {
            queueKey: localQueueKey,
            playbackState: inst.playbackState,
          });
          await inst.play().catch((err) => {
            if (isMusicKitRedundantPlayError(err)) return;
            // Browsers block autoplay until the user interacts; surface as
            // a paused state so the iPod's play button shows the right icon.
            appleMusicLog.warn("Playback for the new queue was blocked", {
              error: err,
              snapshot: getBridgeSnapshot(),
            });
            callBridgeCallback("queue:onPauseAfterBlockedPlay", onPauseRef.current, {
              snapshot: getBridgeSnapshot(),
            });
          });
        } else {
          appleMusicLog.debug("New queue does not need a play request", {
            queueKey: localQueueKey,
            shouldPlayAfterQueue,
            playbackState: inst.playbackState,
          });
        }
      } catch (err) {
        if (!isStale()) {
          lastQueuedTrackIdRef.current = null;
        }
        appleMusicLog.error("Could not replace the MusicKit queue", {
          error: err,
          queueOptions,
          snapshot: getBridgeSnapshot(),
        });
      } finally {
        // Only clear the shared ref when *we* are still the most recent
        // load. A newer track change already replaced `queueLoadingRef`
        // with its own promise; nulling here would let play/pause sync
        // think there's no pending queue load and race the newer
        // `setQueue` mid-flight.
        const settledCurrentLoad = queueLoadingRef.current === thisLoad;
        const shouldConfirmPlayback =
          settledCurrentLoad &&
          shouldConfirmPlaybackAfterQueueLoad({
            loadIsStale: isStale(),
            queuedTrackId: lastQueuedTrackIdRef.current,
            expectedTrackId: localQueueKey,
            playbackState: inst.playbackState,
          });
        if (settledCurrentLoad) {
          queueLoadingRef.current = null;
        }
        appleMusicLog.debug("Queue update settled", {
          queueKey: localQueueKey,
          loadGeneration,
          cancelled,
          activeGeneration: queueGenerationRef.current,
          snapshot: getBridgeSnapshot(),
        });
        if (shouldConfirmPlayback) {
          appleMusicLog.debug(
            "Confirming playback after suppressed queue-load event",
            {
              queueKey: localQueueKey,
              loadGeneration,
              playbackState: inst.playbackState,
            }
          );
          callBridgeCallback(
            "queue:onPlayAfterSettled",
            onPlayRef.current,
            { snapshot: getBridgeSnapshot() }
          );
        }
      }
    })();
    queueLoadingRef.current = thisLoad;
    return () => {
      cancelled = true;
      appleMusicLog.debug("Cancelled queue update", {
        queueKey: localQueueKey,
        loadGeneration,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueKey, instanceReadyTick]);

  // Sync play/pause without re-queueing. Track changes are owned entirely
  // by the `setQueue` effect above — resuming playback here when
  // `currentTrack` flips would call `play()` on whatever queue MusicKit
  // still holds (often the previous song) before the new `setQueue`
  // resolves, which is the classic audio/UI mismatch on fast skips.
  useEffect(() => {
    const inst = instanceRef.current;
    if (!inst) {
      appleMusicLog.debug(
        "Skipped playback sync because MusicKit is unavailable",
        { playing }
      );
      return;
    }
    const track = currentTrackRef.current;
    if (!track) {
      appleMusicLog.debug("Skipped playback sync because no track is selected", {
        playing,
      });
      return;
    }
    const pending = queueLoadingRef.current;
    appleMusicLog.debug("Synchronizing requested playback state with MusicKit", {
      playing,
      track: summarizeTrackForLog(track),
      hasPendingQueueLoad: pending !== null,
      snapshot: getBridgeSnapshot(),
    });
    const apply = async () => {
      try {
        if (pending) await pending;
        if (queueLoadingRef.current) {
          appleMusicLog.debug("Skipped playback sync because a newer queue is loading", {
            playing,
            trackId: track.id,
          });
          return;
        }
        const queuedTrackId = lastQueuedTrackIdRef.current;
        if (queuedTrackId !== track.id) {
          appleMusicLog.debug("Skipped playback sync because the queued track changed", {
            playing,
            trackId: track.id,
            queuedTrackId,
          });
          return;
        }
        if (playing) {
          if (isMusicKitPlaying(inst.playbackState)) {
            appleMusicLog.debug("Skipped play request because MusicKit is already playing", {
              trackId: track.id,
              playbackState: inst.playbackState,
            });
            return;
          }
          const startSeconds = getSafeStartSeconds(
            track,
            resumeAtSecondsRef.current
          );
          if (startSeconds != null) {
            appleMusicLog.debug("Seeking before starting playback", {
              trackId: track.id,
              startSeconds,
            });
            await inst.seekToTime(startSeconds).catch((err) => {
              appleMusicLog.warn("Could not seek before starting playback", {
                error: err,
                startSeconds,
                snapshot: getBridgeSnapshot(),
              });
            });
          }
          appleMusicLog.debug("Starting MusicKit playback", {
            trackId: track.id,
            playbackState: inst.playbackState,
          });
          await inst.play();
          appleMusicLog.debug("MusicKit playback started", {
            trackId: track.id,
            playbackState: inst.playbackState,
          });
        } else {
          appleMusicLog.debug("Pausing MusicKit playback", {
            trackId: track.id,
            playbackState: inst.playbackState,
          });
          inst.pause();
        }
      } catch (err) {
        if (isMusicKitRedundantPlayError(err)) return;
        appleMusicLog.warn("Could not synchronize MusicKit playback state", {
          error: err,
          playing,
          snapshot: getBridgeSnapshot(),
        });
        if (playing) {
          callBridgeCallback(
            "playback:onPauseAfterFailedPlay",
            onPauseRef.current,
            { snapshot: getBridgeSnapshot() }
          );
        }
      }
    };
    void apply();
  }, [getBridgeSnapshot, playing, instanceReadyTick]);

  useImperativeHandle(
    ref,
    () => ({
      seekTo(seconds: number) {
        const inst = instanceRef.current;
        if (!inst) {
          appleMusicLog.debug(
            "Skipped seek because MusicKit is unavailable",
            { seconds }
          );
          return;
        }
        appleMusicLog.debug("Seeking MusicKit playback", {
          seconds,
          hasPendingQueueLoad: queueLoadingRef.current !== null,
          snapshot: getBridgeSnapshot(),
        });
        const apply = async () => {
          const pending = queueLoadingRef.current;
          if (pending) await pending;
          await inst.seekToTime(seconds);
          appleMusicLog.debug("MusicKit seek completed", {
            seconds,
            snapshot: getBridgeSnapshot(),
          });
        };
        apply().catch((err) => {
          appleMusicLog.warn("MusicKit seek failed", {
            error: err,
            seconds,
            snapshot: getBridgeSnapshot(),
          });
        });
      },
      getCurrentTime() {
        return instanceRef.current?.currentPlaybackTime ?? 0;
      },
      getInternalPlayer() {
        return instanceRef.current;
      },
    }),
    [getBridgeSnapshot]
  );

  return null;
};
