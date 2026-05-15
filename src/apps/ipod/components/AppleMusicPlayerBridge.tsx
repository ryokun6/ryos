import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Track } from "@/stores/useIpodStore";
import { onMusicKitReady } from "@/hooks/useMusicKit";
import { PLAYER_PROGRESS_INTERVAL_MS } from "../constants";
import {
  applyMusicKitPlaybackModes,
  buildMusicKitQueueIdentity,
  buildMusicKitSongQueue,
  findTrackIdByMusicKitItemId,
  getMusicKitEventItemId,
  getMusicKitQueueStartIndex,
  getMusicKitSongId,
  getQueueOptionsForNativeSongQueue,
  getQueueOptionsForTrack,
  isMusicKitPlayingSongId,
  isWithinEndedFanoutDedupWindow,
  musicKitRepeatToStore,
  musicKitShuffleToStore,
  shouldFireEndedForPlaybackState,
  shouldUseNativeMusicKitSongQueue,
  type StorePlaybackModes,
  withMusicKitShuffleSuspended,
} from "./appleMusicPlayerBridgeUtils";

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
 *   - For sequential album/playlist/library playback with 2+ songs, builds
 *     a native MusicKit multi-song queue (`setQueue({ songs, startWith })`)
 *     so MusicKit auto-advances between tracks without racing `setQueue`.
 *   - Listens to `playbackTimeDidChange` / `playbackStateDidChange` /
 *     `mediaItemDidChange` to drive `onProgress` / `onPlay` / `onPause` /
 *     `onDuration` callbacks identical to `react-player`'s shape.
 *   - Honours `volume` (0–1).
 */

export interface AppleMusicPlayerBridgeProps {
  /** Current Apple Music track to play. Triggers `setQueue` on change. */
  currentTrack: Track | null;
  /**
   * Ordered tracks that scope playback (album, playlist, library subset).
   * When eligible, the bridge builds a native MusicKit multi-song queue.
   */
  queueTracks?: Track[];
  /** ryOS shuffle flag — mirrored to MusicKit `shuffleMode`. */
  isShuffled?: boolean;
  /** ryOS repeat-one flag — mirrored to MusicKit `repeatMode`. */
  loopCurrent?: boolean;
  /** ryOS repeat-all flag — mirrored to MusicKit `repeatMode`. */
  loopAll?: boolean;
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
  /** Sync ryOS current-song id when MusicKit auto-advances in a native queue. */
  onQueueTrackChange?: (trackId: string) => void;
  /** Sync ryOS shuffle/repeat when the user changes modes in MusicKit UI. */
  onPlaybackModesChange?: (modes: StorePlaybackModes) => void;
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
    isShuffled = false,
    loopCurrent = false,
    loopAll = false,
    playing,
    resumeAtSeconds,
    volume,
    onProgress,
    onDuration,
    onPlay,
    onPause,
    onEnded,
    onReady,
    onQueueTrackChange,
    onPlaybackModesChange,
    onNowPlayingItemChange
  }: AppleMusicPlayerBridgeProps & {
    ref?: React.Ref<AppleMusicPlayerBridgeHandle>;
  }
) {
  const instanceRef = useRef<MusicKit.MusicKitInstance | null>(null);
  const [instanceReadyTick, setInstanceReadyTick] = useState(0);
  const lastQueuedTrackIdRef = useRef<string | null>(null);
  const lastQueueIdentityRef = useRef<string | null>(null);
  const lastNowPlayingItemIdRef = useRef<string | null>(null);
  const queueLoadingRef = useRef<Promise<void> | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const effectiveQueueTracks = useMemo(
    () => queueTracks ?? (currentTrack ? [currentTrack] : []),
    [queueTracks, currentTrack]
  );
  const playbackModes = useMemo<StorePlaybackModes>(
    () => ({ isShuffled, loopCurrent, loopAll }),
    [isShuffled, loopCurrent, loopAll]
  );
  const usesNativeMultiSongQueue = shouldUseNativeMusicKitSongQueue(
    effectiveQueueTracks
  );
  const usesNativeMultiSongQueueRef = useRef(usesNativeMultiSongQueue);
  usesNativeMultiSongQueueRef.current = usesNativeMultiSongQueue;
  const queueTracksRef = useRef(effectiveQueueTracks);
  queueTracksRef.current = effectiveQueueTracks;

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

  const onProgressRef = useRef(onProgress);
  const onDurationRef = useRef(onDuration);
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const onEndedRef = useRef(onEnded);
  const onQueueTrackChangeRef = useRef(onQueueTrackChange);
  const onPlaybackModesChangeRef = useRef(onPlaybackModesChange);
  const onNowPlayingItemChangeRef = useRef(onNowPlayingItemChange);
  onProgressRef.current = onProgress;
  onDurationRef.current = onDuration;
  onPlayRef.current = onPlay;
  onPauseRef.current = onPause;
  onEndedRef.current = onEnded;
  onQueueTrackChangeRef.current = onQueueTrackChange;
  onPlaybackModesChangeRef.current = onPlaybackModesChange;
  onNowPlayingItemChangeRef.current = onNowPlayingItemChange;

  const playbackModesRef = useRef(playbackModes);
  playbackModesRef.current = playbackModes;
  const applyingPlaybackModesFromStoreRef = useRef(false);

  const currentTrackRef = useRef(currentTrack);
  currentTrackRef.current = currentTrack;

  const lastEndedFiredForItemIdRef = useRef<string | null>(null);
  const lastEndedFiredAtRef = useRef(0);

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
          usesNativeMultiSongQueueRef.current
        )
      ) {
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
    };

    const handleMediaItem = (event: MusicKit.MediaItemDidChangeEvent) => {
      const itemId = getMusicKitEventItemId(event.item);
      if (itemId) {
        lastNowPlayingItemIdRef.current = itemId;
      }

      const durationMs =
        event.item?.attributes?.durationInMillis ??
        event.item?.playbackDuration ??
        0;
      if (durationMs > 0) {
        onDurationRef.current?.(durationMs / 1000);
      }

      if (usesNativeMultiSongQueueRef.current) {
        const trackId = findTrackIdByMusicKitItemId(
          queueTracksRef.current,
          itemId
        );
        if (trackId) {
          onQueueTrackChangeRef.current?.(trackId);
        }
      }

      onNowPlayingItemChangeRef.current?.(
        mediaItemToNowPlayingMetadata(event.item)
      );
    };

    const readEventMode = (event: unknown): number | undefined => {
      if (typeof event === "number") return event;
      if (event && typeof event === "object") {
        const record = event as Record<string, unknown>;
        const candidate = record.shuffleMode ?? record.repeatMode ?? record.mode;
        return typeof candidate === "number" ? candidate : undefined;
      }
      return undefined;
    };

    const handleShuffleMode = (event: unknown) => {
      if (applyingPlaybackModesFromStoreRef.current) return;
      const shuffleMode = readEventMode(event);
      if (shuffleMode === undefined) return;
      const storeModes = musicKitShuffleToStore(shuffleMode);
      onPlaybackModesChangeRef.current?.({
        ...playbackModesRef.current,
        ...storeModes,
      });
    };

    const handleRepeatMode = (event: unknown) => {
      if (applyingPlaybackModesFromStoreRef.current) return;
      const repeatMode = readEventMode(event);
      if (repeatMode === undefined) return;
      const storeModes = musicKitRepeatToStore(repeatMode);
      onPlaybackModesChangeRef.current?.({
        ...playbackModesRef.current,
        ...storeModes,
      });
    };

    const tryAttach = (inst: MusicKit.MusicKitInstance | null) => {
      if (cancelled || !inst) return;
      if (activeInstance === inst) return;
      activeInstance = inst;
      inst.addEventListener("playbackStateDidChange", handleState);
      inst.addEventListener("mediaItemDidChange", handleMediaItem);
      inst.addEventListener("nowPlayingItemDidChange", handleMediaItem);
      inst.addEventListener("shuffleModeDidChange", handleShuffleMode);
      inst.addEventListener("repeatModeDidChange", handleRepeatMode);
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
        activeInstance.removeEventListener(
          "shuffleModeDidChange",
          handleShuffleMode
        );
        activeInstance.removeEventListener(
          "repeatModeDidChange",
          handleRepeatMode
        );
      }
    };
  }, []);

  // Mirror ryOS shuffle / repeat to MusicKit so the player owns queue order
  // and looping instead of our store-driven next-track picker.
  useEffect(() => {
    const inst = instanceRef.current;
    if (!inst) return;
    applyingPlaybackModesFromStoreRef.current = true;
    try {
      applyMusicKitPlaybackModes(inst, playbackModes);
    } catch (err) {
      console.warn("[apple music] failed to sync playback modes", err);
    } finally {
      applyingPlaybackModesFromStoreRef.current = false;
    }
  }, [playbackModes, instanceReadyTick]);

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

      if (baseSeconds === null || rawSeconds !== lastReportedSeconds) {
        baseSeconds = rawSeconds;
        baseWallClock = now;
        lastReportedSeconds = rawSeconds;
      }

      const elapsed = (now - baseWallClock) / 1000;
      const interpolated = baseSeconds + Math.min(elapsed, 0.99);

      onProgressRef.current?.({ playedSeconds: interpolated });
      lastEmittedAt = now;
    };

    const frame = () => {
      if (cancelled) return;
      const now = Date.now();
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

  useEffect(() => {
    const inst = instanceRef.current;
    if (!inst) return;
    try {
      (inst as unknown as { volume: number }).volume = Math.max(
        0,
        Math.min(1, volume)
      );
    } catch (err) {
      console.warn("[apple music] failed to set volume", err);
    }
  }, [volume]);

  const nativeQueueIdentity = useMemo(() => {
    if (!usesNativeMultiSongQueue) return null;
    const { songIds } = buildMusicKitSongQueue(effectiveQueueTracks);
    return buildMusicKitQueueIdentity(songIds);
  }, [usesNativeMultiSongQueue, effectiveQueueTracks]);

  const queueKey = useMemo(() => {
    if (!currentTrack) return null;
    if (usesNativeMultiSongQueue && nativeQueueIdentity) {
      return `${nativeQueueIdentity}::${currentTrack.id}`;
    }
    return currentTrack.id;
  }, [currentTrack, usesNativeMultiSongQueue, nativeQueueIdentity]);

  const playingRef = useRef(playing);
  playingRef.current = playing;
  const resumeAtSecondsRef = useRef(resumeAtSeconds);
  resumeAtSecondsRef.current = resumeAtSeconds;

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
      lastQueuedTrackIdRef.current = null;
      lastQueueIdentityRef.current = null;
      return;
    }
    if (lastQueuedTrackIdRef.current === queueKey) return;
    onNowPlayingItemChangeRef.current?.(null);

    const localQueueKey = queueKey;
    const previousQueueLoading = queueLoadingRef.current;
    let thisLoad: Promise<void> | null = null;
    thisLoad = (async () => {
      if (previousQueueLoading) {
        try {
          await previousQueueLoading;
        } catch {
          /* ignore */
        }
        if (cancelled) return;
      }

      const resumeSeconds = getSafeStartSeconds(
        currentTrack,
        resumeAtSecondsRef.current
      );

      const nativeQueueOptions =
        usesNativeMultiSongQueue && currentTrack
          ? getQueueOptionsForNativeSongQueue(
              effectiveQueueTracks,
              currentTrack,
              false
            )
          : null;
      const singleTrackOptions =
        nativeQueueOptions == null
          ? getQueueOptionsForTrack(currentTrack)
          : null;

      if (!nativeQueueOptions && !singleTrackOptions) {
        console.warn(
          "[apple music] track is missing playParams, skipping",
          currentTrack
        );
        return;
      }

      const queueIdentity = nativeQueueOptions
        ? buildMusicKitQueueIdentity(
            buildMusicKitSongQueue(effectiveQueueTracks).songIds
          )
        : null;
      const targetSongId = getMusicKitSongId(currentTrack);
      const musicKitAlreadyOnTarget = isMusicKitPlayingSongId(
        lastNowPlayingItemIdRef.current,
        targetSongId
      );

      try {
        if (
          nativeQueueOptions &&
          queueIdentity &&
          lastQueueIdentityRef.current === queueIdentity &&
          musicKitAlreadyOnTarget
        ) {
          // MusicKit auto-advanced (or the user skipped via MusicKit APIs).
          // The audio is already on the right item — just sync play state.
          if (cancelled) return;
          lastQueuedTrackIdRef.current = localQueueKey;
          if (playingRef.current) {
            await inst.play().catch((err) => {
              console.warn(
                "[apple music] play() blocked, awaiting user gesture",
                err
              );
              onPauseRef.current?.();
            });
          }
          return;
        }

        const modes = playbackModesRef.current;
        const targetQueue = async () => {
          if (
            nativeQueueOptions &&
            queueIdentity &&
            lastQueueIdentityRef.current === queueIdentity &&
            !musicKitAlreadyOnTarget
          ) {
            const startWith = getMusicKitQueueStartIndex(
              effectiveQueueTracks,
              currentTrack
            );
            await inst.changeToMediaAtIndex(startWith);
            if (cancelled) return;
            if (resumeSeconds != null) {
              await inst.seekToTime(resumeSeconds).catch((err) => {
                console.warn("[apple music] resume seek failed", err);
              });
            }
          } else {
            const queueOptions = nativeQueueOptions ?? singleTrackOptions!;
            await inst.setQueue({
              ...queueOptions,
              startTime: resumeSeconds ?? undefined,
              startPlaying: false,
            });
            if (cancelled) return;
            if (resumeSeconds != null) {
              await inst.seekToTime(resumeSeconds).catch((err) => {
                console.warn("[apple music] resume seek failed", err);
              });
            }
            lastQueueIdentityRef.current = queueIdentity;
          }
        };

        applyingPlaybackModesFromStoreRef.current = true;
        try {
          await withMusicKitShuffleSuspended(inst, modes, targetQueue);
        } finally {
          applyingPlaybackModesFromStoreRef.current = false;
        }

        if (cancelled) return;
        if (currentTrack.durationMs && currentTrack.durationMs > 0) {
          onDurationRef.current?.(currentTrack.durationMs / 1000);
        }
        lastQueuedTrackIdRef.current = localQueueKey;
        if (playingRef.current) {
          await inst.play().catch((err) => {
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
        if (queueLoadingRef.current === thisLoad) {
          queueLoadingRef.current = null;
        }
      }
    })();
    queueLoadingRef.current = thisLoad;
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueKey, instanceReadyTick]);

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
