/**
 * Helpers for reaching MusicKit playback controls across JS builds.
 * v3 often flattens player methods onto the instance; older builds nest
 * them under `instance.player`.
 */

export interface MusicKitShuffleRepeatState {
  isShuffled: boolean;
  loopCurrent: boolean;
  loopAll: boolean;
}

type PlaybackSurface = {
  shuffleMode?: MusicKit.PlayerShuffleMode;
  repeatMode?: MusicKit.PlayerRepeatMode;
  queue?: MusicKit.Queue;
  nowPlayingItem?: MusicKit.MediaItem;
  nowPlayingItemIndex?: number;
  playbackTargetAvailable?: boolean;
  showPlaybackTargetPicker?: () => void;
  changeToMediaAtIndex?: (index: number) => Promise<unknown>;
  changeToMediaItem?: (descriptor: string) => Promise<unknown>;
};

export function getMusicKitPlaybackSurface(
  instance: MusicKit.MusicKitInstance
): PlaybackSurface {
  const nested = (
    instance as MusicKit.MusicKitInstance & { player?: PlaybackSurface }
  ).player;
  if (nested) return nested;
  return instance as unknown as PlaybackSurface;
}

export function mapIpodRepeatToMusicKit(
  loopCurrent: boolean,
  loopAll: boolean
): MusicKit.PlayerRepeatMode {
  if (loopCurrent) return 1;
  if (loopAll) return 2;
  return 0;
}

export function mapIpodShuffleToMusicKit(
  isShuffled: boolean
): MusicKit.PlayerShuffleMode {
  return isShuffled ? 1 : 0;
}

export function applyMusicKitShuffleRepeat(
  instance: MusicKit.MusicKitInstance,
  state: MusicKitShuffleRepeatState
): void {
  const surface = getMusicKitPlaybackSurface(instance);
  try {
    surface.shuffleMode = mapIpodShuffleToMusicKit(state.isShuffled);
    surface.repeatMode = mapIpodRepeatToMusicKit(
      state.loopCurrent,
      state.loopAll
    );
  } catch (err) {
    console.warn("[apple music] failed to sync shuffle/repeat", err);
  }
}

export function isMusicKitBufferingState(state: number | undefined): boolean {
  return state === 1 || state === 6 || state === 8 || state === 9;
}

export function canShowMusicKitAirPlayPicker(
  instance: MusicKit.MusicKitInstance
): boolean {
  const surface = getMusicKitPlaybackSurface(instance);
  return Boolean(
    surface.playbackTargetAvailable &&
      typeof surface.showPlaybackTargetPicker === "function"
  );
}

export function showMusicKitAirPlayPicker(
  instance: MusicKit.MusicKitInstance
): boolean {
  const surface = getMusicKitPlaybackSurface(instance);
  if (
    !surface.playbackTargetAvailable ||
    typeof surface.showPlaybackTargetPicker !== "function"
  ) {
    return false;
  }
  try {
    surface.showPlaybackTargetPicker();
    return true;
  } catch (err) {
    console.warn("[apple music] AirPlay picker failed", err);
    return false;
  }
}
