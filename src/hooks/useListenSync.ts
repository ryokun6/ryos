import { useCallback, useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import type ReactPlayer from "react-player";
import {
  useListenSessionStore,
  type ListenTrackMeta,
} from "@/stores/useListenSessionStore";

interface ListenSyncOptions {
  currentTrackId: string | null;
  currentTrackMeta: ListenTrackMeta | null;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTrackId: (trackId: string | null) => void;
  getActivePlayer: () => ReactPlayer | null;
  addTrackFromId?: (trackId: string) => Promise<unknown> | void;
}

const HEARTBEAT_INTERVAL_MS = 3000;
const HARD_SEEK_THRESHOLD_MS = 3000;

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
    username,
    lastSyncPayload,
    syncSession,
  } = useListenSessionStore(
    useShallow((state) => ({
      currentSession: state.currentSession,
      isDj: state.isDj,
      username: state.username,
      lastSyncPayload: state.lastSyncPayload,
      syncSession: state.syncSession,
    }))
  );

  const lastSentRef = useRef<number>(0);

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

  useEffect(() => {
    if (!canBroadcast) return;
    const now = Date.now();
    if (now - lastSentRef.current < 500) return;
    lastSentRef.current = now;
    broadcastState();
  }, [broadcastState, canBroadcast, currentTrackId, isPlaying]);

  useEffect(() => {
    if (!canBroadcast) return;
    const interval = setInterval(() => {
      broadcastState();
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [broadcastState, canBroadcast]);

  // Listener effect: apply sync from DJ to local playback
  // Skip if: no session, user is the DJ, no sync payload, or sync was sent by self
  useEffect(() => {
    if (!currentSession || !lastSyncPayload) return;
    
    // Ignore sync events sent by ourselves (DJ shouldn't apply their own syncs)
    // This prevents race conditions where the DJ receives their own broadcast
    const isSelfSync = lastSyncPayload.djUsername === username;
    if (isDj || isSelfSync) return;

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

    if (Math.abs(driftMs) > HARD_SEEK_THRESHOLD_MS) {
      player.seekTo(expectedPosition / 1000, "seconds");
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
    username,
  ]);
}
