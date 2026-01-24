import { useCallback, useEffect, useMemo, useRef } from "react";
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
  addTrackFromId?: (trackId: string) => Promise<void> | void;
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
    lastSyncPayload,
    syncSession,
  } = useListenSessionStore((state) => ({
    currentSession: state.currentSession,
    isDj: state.isDj,
    lastSyncPayload: state.lastSyncPayload,
    syncSession: state.syncSession,
  }));

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

  useEffect(() => {
    if (!currentSession || isDj || !lastSyncPayload) return;

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
  ]);
}
