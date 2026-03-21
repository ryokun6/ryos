import { useCallback, useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import type ReactPlayer from "react-player";
import {
  useListenSessionStore,
  type ListenTrackMeta,
} from "@/stores/useListenSessionStore";
import { toast } from "sonner";

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
  setVirtualElapsedSeconds?: (seconds: number) => void;
}

const HEARTBEAT_INTERVAL_MS = 3000; // when playing
const HEARTBEAT_PAUSED_MS = 30000; // when paused – infrequent since position doesn't change
const MIN_STATE_SYNC_INTERVAL_MS = 2500; // Min interval for "state changed" sync to avoid loop
const SOFT_SYNC_THRESHOLD_MS = 500; // Below this, no correction needed
const HARD_SEEK_THRESHOLD_MS = 3000; // Above this, hard seek
const DJ_DISCONNECT_WARNING_MS = 15000; // Show warning after 15s
const DJ_DISCONNECT_PROMOTE_MS = 30000; // Auto-promote after 30s

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
}: ListenSyncOptions) {
  const {
    currentSession,
    isDj,
    isAnonymous,
    username,
    lastSyncPayload,
    lastSyncAt,
    syncSession,
  } = useListenSessionStore(
    useShallow((state) => ({
      currentSession: state.currentSession,
      isDj: state.isDj,
      isAnonymous: state.isAnonymous,
      username: state.username,
      lastSyncPayload: state.lastSyncPayload,
      lastSyncAt: state.lastSyncAt,
      syncSession: state.syncSession,
    }))
  );

  const lastSentRef = useRef<number>(0);
  const prevTrackIdRef = useRef<typeof currentTrackId>(undefined);
  const prevPlayingRef = useRef<boolean | undefined>(undefined);
  const broadcastStateRef = useRef<() => Promise<void>>(async () => {});
  const currentPlaybackRateRef = useRef<number>(1.0);
  const djDisconnectWarningShownRef = useRef<boolean>(false);

  const canBroadcast = useMemo(
    () => Boolean(currentSession?.id && isDj),
    [currentSession?.id, isDj]
  );

  const broadcastState = useCallback(async () => {
    if (!canBroadcast || !currentSession) return;

    const player = getActivePlayer();
    const positionMs = Math.max(0, (player?.getCurrentTime() ?? 0) * 1000);

    await syncSession({
      currentTrackId,
      currentTrackMeta,
      isPlaying,
      positionMs,
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
    const now = Date.now();
    if (!isUnpause && now - lastSentRef.current < MIN_STATE_SYNC_INTERVAL_MS) return;

    prevTrackIdRef.current = currentTrackId;
    prevPlayingRef.current = isPlaying;
    lastSentRef.current = now;
    broadcastState();
  }, [broadcastState, canBroadcast, currentTrackId, isPlaying]);

  // Heartbeat: use ref so interval is not cleared on every re-render; slower when paused
  useEffect(() => {
    if (!canBroadcast) return;
    const intervalMs = isPlaying ? HEARTBEAT_INTERVAL_MS : HEARTBEAT_PAUSED_MS;
    const id = setInterval(() => {
      broadcastStateRef.current();
    }, intervalMs);
    return () => clearInterval(id);
  }, [canBroadcast, isPlaying]);

  // Helper to set playback rate on the internal player
  const setPlaybackRate = useCallback((player: ReactPlayer, rate: number) => {
    if (currentPlaybackRateRef.current === rate) return;

    try {
      const internalPlayer = player.getInternalPlayer();
      if (internalPlayer && typeof internalPlayer.playbackRate !== "undefined") {
        internalPlayer.playbackRate = rate;
        currentPlaybackRateRef.current = rate;
      }
    } catch {
      // Some players don't support playbackRate
    }
  }, []);

  // Listener effect: apply sync from DJ to local playback
  useEffect(() => {
    if (!currentSession || !lastSyncPayload) return;

    const source = lastSyncPayload.sourceUsername ?? lastSyncPayload.djUsername;
    const isSelfOriginated =
      username != null && source.toLowerCase() === username.toLowerCase();

    // DJ ignores self-originated syncs (their own broadcasts). Playback device also applies
    // server revisions from remote commands (source !== dj) so queue/skip from remotes applies locally.
    if (isDj && isSelfOriginated) return;

    if (!applyListenerPlayback) {
      djDisconnectWarningShownRef.current = false;
      if (lastSyncPayload.currentTrackId !== currentTrackId) {
        setCurrentTrackId(lastSyncPayload.currentTrackId);
      }
      if (lastSyncPayload.isPlaying !== isPlaying) {
        setIsPlaying(lastSyncPayload.isPlaying);
      }
      if (setVirtualElapsedSeconds) {
        const now = Date.now();
        const expectedSec =
          (lastSyncPayload.positionMs +
            (lastSyncPayload.isPlaying ? now - lastSyncPayload.timestamp : 0)) /
          1000;
        setVirtualElapsedSeconds(Math.max(0, expectedSec));
      }
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
      if (driftMs > 0) {
        setPlaybackRate(player, SOFT_SYNC_RATE_FAST);
      } else {
        setPlaybackRate(player, SOFT_SYNC_RATE_SLOW);
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
    username,
  ]);

  // Virtual timeline tick for remote-only UI
  useEffect(() => {
    if (applyListenerPlayback || !setVirtualElapsedSeconds || !lastSyncPayload) return;
    if (!lastSyncPayload.isPlaying) return;
    let raf = 0;
    const tick = () => {
      const now = Date.now();
      const expectedSec =
        (lastSyncPayload.positionMs + (now - lastSyncPayload.timestamp)) / 1000;
      setVirtualElapsedSeconds(Math.max(0, expectedSec));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [applyListenerPlayback, lastSyncPayload, setVirtualElapsedSeconds]);

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
