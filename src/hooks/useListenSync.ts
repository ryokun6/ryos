import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { useShallow } from "zustand/react/shallow";
import type ReactPlayer from "react-player";
import {
  useListenSessionStore,
} from "@/stores/useListenSessionStore";
import type { ListenTrackMeta } from "@/shared/contracts/listen";
import { toast } from "sonner";
import { subscribeRealtimeConnection } from "@/lib/pusherClient";
import {
  clearListenLyricClock,
  readListenLyricMediaMs,
  stepListenLyricClock,
} from "@/lib/listenLyricClock";
import { shouldIgnoreOwnSyncEcho } from "@/shared/listen/selfSync";

interface ListenSyncOptions {
  currentTrackId: string | null;
  currentTrackMeta: ListenTrackMeta | null;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTrackId: (trackId: string | null) => void;
  getActivePlayer: () => ReactPlayer | null;
  addTrackFromId?: (trackId: string) => Promise<unknown> | void;
  /** When false, listener shows session state only (no local A/V sync). */
  applyListenerPlayback?: boolean;
  /** Virtual timeline for remotes (seconds). */
  setVirtualElapsedSeconds?: Dispatch<SetStateAction<number>>;
  /** Confirms room play/pause without waiting for a local player onPlay. */
  adoptRemotePlayState?: (playing: boolean) => void;
}

const HEARTBEAT_INTERVAL_MS = 3000; // playing and paused — keeps listeners aligned without long gaps
const MIN_STATE_SYNC_INTERVAL_MS = 2500; // Min interval for "state changed" sync to avoid loop
const SOFT_SYNC_THRESHOLD_MS = 500; // Below this, no correction needed
const HARD_SEEK_THRESHOLD_MS = 3000; // Above this, hard seek
const DJ_DISCONNECT_WARNING_MS = 15000; // Show warning after 15s
const DJ_DISCONNECT_PROMOTE_MS = 30000; // Auto-promote after 30s
/** Sync payloads can be a few 100ms behind local extrapolation; snapping back looks like jitter. Larger jumps = real seek. */
const VIRTUAL_BACKWARD_IGNORE_SEC = 0.35;

// Soft sync: Adjust playback rate slightly to catch up/slow down
const SOFT_SYNC_RATE_FAST = 1.05; // Speed up 5% to catch up
const SOFT_SYNC_RATE_SLOW = 0.95; // Slow down 5% to wait

export function useListenSync({
  currentTrackId,
  currentTrackMeta,
  isPlaying,
  setIsPlaying,
  setCurrentTrackId,
  getActivePlayer,
  addTrackFromId,
  applyListenerPlayback = true,
  setVirtualElapsedSeconds,
  adoptRemotePlayState,
}: ListenSyncOptions) {
  const {
    currentSession,
    isDj,
    isAnonymous,
    username,
    clientInstanceId,
    lastSyncPayload,
    lastSyncAt,
    syncSession,
    playbackCatchUp,
    clearPlaybackCatchUp,
  } = useListenSessionStore(
    useShallow((state) => ({
      currentSession: state.currentSession,
      isDj: state.isDj,
      isAnonymous: state.isAnonymous,
      username: state.username,
      clientInstanceId: state.clientInstanceId,
      lastSyncPayload: state.lastSyncPayload,
      lastSyncAt: state.lastSyncAt,
      syncSession: state.syncSession,
      playbackCatchUp: state.playbackCatchUp,
      clearPlaybackCatchUp: state.clearPlaybackCatchUp,
    }))
  );

  const lastSentRef = useRef<number>(0);
  const prevTrackIdRef = useRef<typeof currentTrackId>(undefined);
  const prevPlayingRef = useRef<boolean | undefined>(undefined);
  const broadcastStateRef = useRef<() => Promise<void>>(async () => {});
  const currentPlaybackRateRef = useRef<number>(1.0);
  const djDisconnectWarningShownRef = useRef<boolean>(false);
  const lastVirtualTrackForSmoothingRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!currentSession) {
      lastVirtualTrackForSmoothingRef.current = undefined;
    }
  }, [currentSession]);

  const applySmoothedVirtualElapsed = useCallback(
    (nextSec: number, trackId: string | null, playing: boolean) => {
      if (!setVirtualElapsedSeconds) return;
      setVirtualElapsedSeconds((prev) => {
        const next = Math.max(0, nextSec);
        if (lastVirtualTrackForSmoothingRef.current !== trackId) {
          lastVirtualTrackForSmoothingRef.current = trackId;
          return next;
        }
        if (!playing) {
          return next;
        }
        if (next < prev && prev - next < VIRTUAL_BACKWARD_IGNORE_SEC) {
          return prev;
        }
        return next;
      });
    },
    [setVirtualElapsedSeconds],
  );

  const canBroadcast = useMemo(
    () => Boolean(currentSession?.id && isDj),
    [currentSession?.id, isDj]
  );

  const broadcastState = useCallback(async () => {
    if (!canBroadcast || !currentSession) return;

    const player = getActivePlayer();
    const positionMs = Math.max(0, (player?.getCurrentTime() ?? 0) * 1000);
    const durationSeconds = player?.getDuration?.() ?? 0;
    const durationMs =
      Number.isFinite(durationSeconds) && durationSeconds > 0
        ? Math.round(durationSeconds * 1000)
        : undefined;

    await syncSession({
      currentTrackId,
      currentTrackMeta,
      isPlaying,
      positionMs,
      ...(durationMs != null ? { durationMs } : {}),
    });
  }, [
    canBroadcast,
    currentSession,
    getActivePlayer,
    currentTrackId,
    currentTrackMeta,
    isPlaying,
    syncSession,
  ]);

  broadcastStateRef.current = broadcastState;

  // Sync only when track or play state actually change (not on every render), and throttle to avoid loop.
  // Exception: always send immediately when transitioning to playing (unpause)
  // so listeners resync right away instead of waiting for the next heartbeat.
  useEffect(() => {
    if (!canBroadcast) return;
    const trackChanged = currentTrackId !== prevTrackIdRef.current;
    const playingChanged = isPlaying !== prevPlayingRef.current;
    if (!trackChanged && !playingChanged) return;

    const isUnpause = playingChanged && isPlaying;
    const isPause = playingChanged && !isPlaying;
    const now = Date.now();
    // Always broadcast play/pause edges so remotes don't wait for throttle or heartbeat
    if (!isUnpause && !isPause && now - lastSentRef.current < MIN_STATE_SYNC_INTERVAL_MS) return;

    prevTrackIdRef.current = currentTrackId;
    prevPlayingRef.current = isPlaying;
    lastSentRef.current = now;
    broadcastState();
  }, [broadcastState, canBroadcast, currentTrackId, isPlaying]);

  // Heartbeat: periodic sync while DJ is connected (playing or paused).
  useEffect(() => {
    if (!canBroadcast) return;
    const id = setInterval(() => {
      broadcastStateRef.current();
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [canBroadcast]);

  // Helper to set playback rate on the internal player
  const setPlaybackRate = useCallback((player: ReactPlayer, rate: number): boolean => {
    if (currentPlaybackRateRef.current === rate) return true;

    try {
      const internalPlayer = player.getInternalPlayer() as {
        playbackRate?: number;
        setPlaybackRate?: (next: number) => void;
      } | null;
      if (internalPlayer && typeof internalPlayer.setPlaybackRate === "function") {
        internalPlayer.setPlaybackRate(rate);
        currentPlaybackRateRef.current = rate;
        return true;
      }
      if (internalPlayer && typeof internalPlayer.playbackRate !== "undefined") {
        internalPlayer.playbackRate = rate;
        currentPlaybackRateRef.current = rate;
        return true;
      }
    } catch {
      // Some players don't support playbackRate
    }
    return false;
  }, []);

  // Listener effect: apply sync from DJ to local playback
  useEffect(() => {
    if (!currentSession || !lastSyncPayload) return;

    const source = lastSyncPayload.sourceUsername ?? lastSyncPayload.djUsername;
    const sourceConn = lastSyncPayload.sourceClientInstanceId;

    // Playback tab ignores its own sync echo, except the first snapshot after
    // rejoining so a reloaded DJ seeks to the room instead of dragging it off.
    if (
      shouldIgnoreOwnSyncEcho({
        isDj,
        playbackCatchUp,
        username,
        clientInstanceId,
        sourceUsername: source,
        sourceClientInstanceId: sourceConn,
      })
    ) {
      return;
    }
    if (playbackCatchUp) clearPlaybackCatchUp();

    if (!applyListenerPlayback) {
      djDisconnectWarningShownRef.current = false;
      if (lastSyncPayload.currentTrackId !== currentTrackId) {
        setCurrentTrackId(lastSyncPayload.currentTrackId);
      }
      // Followers never receive onPlay. setIsPlaying(true) only records a
      // request and leaves the button paused, which also freezes the lyric clock.
      adoptRemotePlayState?.(lastSyncPayload.isPlaying);
      return;
    }

    // Reset DJ disconnect warning when we receive a sync
    djDisconnectWarningShownRef.current = false;

    if (
      lastSyncPayload.currentTrackId &&
      lastSyncPayload.currentTrackId !== currentTrackId
    ) {
      if (addTrackFromId) {
        Promise.resolve(addTrackFromId(lastSyncPayload.currentTrackId))
          .catch(() => null)
          .finally(() => {
            setCurrentTrackId(lastSyncPayload.currentTrackId);
          });
      } else {
        setCurrentTrackId(lastSyncPayload.currentTrackId);
      }
    }

    if (lastSyncPayload.isPlaying !== isPlaying) {
      setIsPlaying(lastSyncPayload.isPlaying);
    }

    const player = getActivePlayer();
    if (!player) return;

    const now = Date.now();
    const expectedPosition =
      lastSyncPayload.positionMs +
      (lastSyncPayload.isPlaying ? now - lastSyncPayload.timestamp : 0);
    const currentPosition = (player.getCurrentTime() ?? 0) * 1000;
    const driftMs = expectedPosition - currentPosition;
    const absDrift = Math.abs(driftMs);

    if (absDrift > HARD_SEEK_THRESHOLD_MS) {
      player.seekTo(expectedPosition / 1000, "seconds");
      setPlaybackRate(player, 1.0);
    } else if (absDrift > SOFT_SYNC_THRESHOLD_MS) {
      const nudged = setPlaybackRate(
        player,
        driftMs > 0 ? SOFT_SYNC_RATE_FAST : SOFT_SYNC_RATE_SLOW
      );
      if (!nudged) {
        setPlaybackRate(player, 1.0);
      }
    } else {
      setPlaybackRate(player, 1.0);
    }
  }, [
    addTrackFromId,
    applyListenerPlayback,
    currentSession,
    currentTrackId,
    getActivePlayer,
    isDj,
    isPlaying,
    lastSyncPayload,
    setCurrentTrackId,
    setIsPlaying,
    setPlaybackRate,
    setVirtualElapsedSeconds,
    adoptRemotePlayState,
    applySmoothedVirtualElapsed,
    clientInstanceId,
    username,
    playbackCatchUp,
    clearPlaybackCatchUp,
  ]);

  // Remote lyric clock: advance every frame from the last sync, and ease
  // corrections instead of snapping the word highlight on each heartbeat.
  useEffect(() => {
    if (applyListenerPlayback || !currentSession) {
      clearListenLyricClock();
    }
  }, [applyListenerPlayback, currentSession]);

  useEffect(() => {
    if (applyListenerPlayback || !setVirtualElapsedSeconds || !lastSyncPayload) return;
    let frame = 0;
    const tick = () => {
      const playing = lastSyncPayload.isPlaying;
      const expectedMs =
        lastSyncPayload.positionMs +
        (playing ? Date.now() - lastSyncPayload.timestamp : 0);
      stepListenLyricClock({
        correctionKey: `${lastSyncPayload.currentTrackId}|${lastSyncPayload.timestamp}|${lastSyncPayload.positionMs}|${lastSyncPayload.isPlaying}`,
        targetMs: expectedMs,
        nowMs: performance.now(),
        trackKey: lastSyncPayload.currentTrackId ?? "",
        playing,
      });
      const mediaMs = readListenLyricMediaMs(performance.now());
      if (mediaMs != null) {
        applySmoothedVirtualElapsed(
          mediaMs / 1000,
          lastSyncPayload.currentTrackId,
          playing
        );
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [
    applyListenerPlayback,
    applySmoothedVirtualElapsed,
    currentSession,
    lastSyncPayload,
    setVirtualElapsedSeconds,
  ]);

  useEffect(() => {
    if (!currentSession) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void useListenSessionStore.getState().refreshSession();
      if (isDj) void broadcastStateRef.current();
    };
    const onOnline = () => {
      void useListenSessionStore.getState().refreshSession();
      if (isDj) void broadcastStateRef.current();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", onOnline);
    const unsubscribe = subscribeRealtimeConnection((state) => {
      if (state === "connected") refresh();
    });
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", onOnline);
      unsubscribe();
    };
  }, [currentSession, isDj]);

  // DJ disconnect detection - check if we haven't received sync for too long
  useEffect(() => {
    if (!currentSession || isDj || isAnonymous) return;
    if (!lastSyncAt) return;

    const checkDjConnection = () => {
      const now = Date.now();
      const timeSinceLastSync = now - lastSyncAt;

      if (timeSinceLastSync > DJ_DISCONNECT_PROMOTE_MS) {
        if (!djDisconnectWarningShownRef.current) {
          toast.warning("Playback device may be offline", {
            description: "Waiting for the device that plays audio to reconnect.",
            duration: 10000,
          });
          djDisconnectWarningShownRef.current = true;
          void useListenSessionStore.getState().claimStaleDj();
        }
      } else if (timeSinceLastSync > DJ_DISCONNECT_WARNING_MS) {
        if (!djDisconnectWarningShownRef.current) {
          toast.info("Connection unstable", {
            description: "Haven't received updates from the playback device in a while.",
            duration: 5000,
          });
          djDisconnectWarningShownRef.current = true;
        }
      }
    };

    checkDjConnection();
    const interval = setInterval(checkDjConnection, 5000);
    return () => clearInterval(interval);
  }, [currentSession, isDj, isAnonymous, lastSyncAt]);
}
