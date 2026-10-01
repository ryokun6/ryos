/**
 * TV's current video comes from a per-window shuffled lineup that only
 * `useTvLogic` knows, so the TV window publishes it here for the native
 * now-playing sync. Store-free so the TV chunk stays lean.
 */
import type { RyosNowPlayingInfo } from "@/types/ryos-desktop";

let current: RyosNowPlayingInfo | null = null;
const listeners = new Set<() => void>();

export function publishTvNowPlaying(info: RyosNowPlayingInfo | null): void {
  current = info;
  for (const listener of listeners) listener();
}

export function getTvNowPlaying(): RyosNowPlayingInfo | null {
  return current;
}

export function subscribeTvNowPlaying(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
