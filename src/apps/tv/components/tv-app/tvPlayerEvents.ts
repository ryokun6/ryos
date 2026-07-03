import { useTvStore } from "@/stores/useTvStore";

export function handleTvPlayerPause(): void {
  const state = useTvStore.getState();
  if (!state.isPlaying) return;
  state.setIsPlaying(false);
}
