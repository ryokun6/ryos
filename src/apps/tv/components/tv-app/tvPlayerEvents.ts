import { useTvStore } from "@/stores/useTvStore";

export function shouldPlayEmbeddedTv(state: {
  playbackRequested: boolean;
  isFullScreen: boolean;
  poweringOff: boolean;
  screenOff: boolean;
}): boolean {
  return state.playbackRequested && !state.isFullScreen && !state.poweringOff;
}

export function handleTvPlayerPause(): void {
  const state = useTvStore.getState();
  if (!state.isPlaying) return;
  state.setIsPlaying(false);
}
