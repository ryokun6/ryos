import type { Dispatch, SetStateAction } from "react";
import type ReactPlayer from "react-player";
import { useListenSync } from "@/hooks/useListenSync";
import type { ListenTrackMeta } from "@/shared/contracts/listen";

export interface PlaybackListenSyncTarget {
  currentTrackId: string | null;
  currentTrackMeta: ListenTrackMeta | null;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTrackId: (trackId: string | null) => void;
  getActivePlayer: () => ReactPlayer | null;
  addTrackFromId?: (trackId: string) => Promise<unknown> | void;
  listenRemoteOnly: boolean;
  setVirtualElapsedSeconds?: Dispatch<SetStateAction<number>>;
}

export function usePlaybackListenSync(target: PlaybackListenSyncTarget): void {
  useListenSync({
    currentTrackId: target.currentTrackId,
    currentTrackMeta: target.currentTrackMeta,
    isPlaying: target.isPlaying,
    setIsPlaying: target.setIsPlaying,
    setCurrentTrackId: target.setCurrentTrackId,
    getActivePlayer: target.getActivePlayer,
    addTrackFromId: target.addTrackFromId,
    applyListenerPlayback: !target.listenRemoteOnly,
    setVirtualElapsedSeconds: target.listenRemoteOnly
      ? target.setVirtualElapsedSeconds
      : undefined,
  });
}

export async function broadcastListenState(args: {
  getActivePlayer: () => ReactPlayer | null;
  syncSession: (payload: {
    currentTrackId: string | null;
    currentTrackMeta: ListenTrackMeta | null;
    isPlaying: boolean;
    positionMs: number;
  }) => Promise<{ ok: boolean; error?: string }>;
  currentTrackId: string | null;
  currentTrackMeta: ListenTrackMeta | null;
  isPlaying: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const activePlayer = args.getActivePlayer();
  const positionMs = Math.max(0, (activePlayer?.getCurrentTime() ?? 0) * 1000);
  return args.syncSession({
    currentTrackId: args.currentTrackId,
    currentTrackMeta: args.currentTrackMeta,
    isPlaying: args.isPlaying,
    positionMs,
  });
}
