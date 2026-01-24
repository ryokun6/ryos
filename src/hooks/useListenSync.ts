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
}

const HEARTBEAT_INTERVAL_MS = 3000;   // when playing
const HEARTBEAT_PAUSED_MS = 12000;   // when paused – less frequent to avoid spam
const MIN_STATE_SYNC_INTERVAL_MS = 2500; // Min interval for "state changed" sync to avoid loop
const SOFT_SYNC_THRESHOLD_MS = 500;  // Below this, no correction needed
const HARD_SEEK_THRESHOLD_MS = 3000; // Above this, hard seek
const DJ_DISCONNECT_WARNING_MS = 15000; // Show warning after 15s
const DJ_DISCONNECT_PROMOTE_MS = 30000; // Auto-promote after 30s

// Soft sync: Adjust playback rate slightly to catch up/slow down
const SOFT_SYNC_RATE_FAST = 1.05;  // Speed up 5% to catch up
const SOFT_SYNC_RATE_SLOW = 0.95;  // Slow down 5% to wait

export function useListenSync({
  currentTrackId,
  currentTrackMeta,
  isPlaying,
  setIsPlaying,
  setCurrentTrackId,
  getActivePlayer,
  addTrackFromId,
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

  // Sync only when track or play state actually change (not on every render), and throttle to avoid loop
  useEffect(() => {
    if (!canBroadcast) return;
    const trackChanged = currentTrackId !== prevTrackIdRef.current;
    const playingChanged = isPlaying !== prevPlayingRef.current;
    if (!trackChanged && !playingChanged) return;
    const now = Date.now();
    if (now - lastSentRef.current < MIN_STATE_SYNC_INTERVAL_MS) return;
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
  // Skip if: no session, user is the DJ, no sync payload, or sync was sent by self
  useEffect(() => {
    if (!currentSession || !lastSyncPayload) return;
    
    // Ignore sync events sent by ourselves (DJ shouldn't apply their own syncs)
    // This prevents race conditions where the DJ receives their own broadcast
    const isSelfSync = lastSyncPayload.djUsername === username;
    if (isDj || isSelfSync) return;

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

    // Drift correction strategy:
    // - <500ms: No correction (acceptable)
    // - 500ms-3000ms: Soft sync (adjust playback rate)
    // - >3000ms: Hard seek
    if (absDrift > HARD_SEEK_THRESHOLD_MS) {
      // Hard seek for large drift
      player.seekTo(expectedPosition / 1000, "seconds");
      setPlaybackRate(player, 1.0);
    } else if (absDrift > SOFT_SYNC_THRESHOLD_MS) {
      // Soft sync: adjust playback rate to gradually catch up/slow down
      if (driftMs > 0) {
        // We're behind, speed up
        setPlaybackRate(player, SOFT_SYNC_RATE_FAST);
      } else {
        // We're ahead, slow down
        setPlaybackRate(player, SOFT_SYNC_RATE_SLOW);
      }
    } else {
      // Within acceptable range, reset to normal speed
      setPlaybackRate(player, 1.0);
    }
  }, [
    addTrackFromId,
    currentSession,
    currentTrackId,
    getActivePlayer,
    isDj,
    isPlaying,
    lastSyncPayload,
    setCurrentTrackId,
    setIsPlaying,
    setPlaybackRate,
    username,
  ]);

  // DJ disconnect detection - check if we haven't received sync for too long
  useEffect(() => {
    if (!currentSession || isDj || isAnonymous) return;
    if (!lastSyncAt) return;

    const checkDjConnection = () => {
      const now = Date.now();
      const timeSinceLastSync = now - lastSyncAt;

      if (timeSinceLastSync > DJ_DISCONNECT_PROMOTE_MS) {
        // DJ has been disconnected for too long
        // The server will handle auto-promotion when DJ leaves
        // For now, just show a persistent warning
        if (!djDisconnectWarningShownRef.current) {
          toast.warning("DJ may have disconnected", {
            description: "Waiting for DJ to reconnect or for a new DJ to be assigned.",
            duration: 10000,
          });
          djDisconnectWarningShownRef.current = true;
        }
      } else if (timeSinceLastSync > DJ_DISCONNECT_WARNING_MS) {
        // Show warning
        if (!djDisconnectWarningShownRef.current) {
          toast.info("DJ connection unstable", {
            description: "Haven't received updates from DJ in a while.",
            duration: 5000,
          });
          djDisconnectWarningShownRef.current = true;
        }
      }
    };

    // Check immediately and then every 5 seconds
    checkDjConnection();
    const interval = setInterval(checkDjConnection, 5000);
    return () => clearInterval(interval);
  }, [currentSession, isDj, isAnonymous, lastSyncAt]);
}
