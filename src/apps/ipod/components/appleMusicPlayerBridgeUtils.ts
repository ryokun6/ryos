// Pure helpers for the AppleMusicPlayerBridge.
//
// Lives in its own module so the bridge component file only exports the
// component itself — keeping React Fast Refresh working for hot reloads
// during development (`react-refresh/only-export-components`).

import { isAppleMusicCollectionTrack, type Track } from "@/stores/useIpodStore";

/**
 * Decide whether a `playbackStateDidChange` event should fan out to the
 * parent's `onEnded` callback (which triggers our own next-track handler).
 *
 * MusicKit JS fires `ended` (state=5) once for *every* track that finishes.
 * Inside a multi-item queue (catalog station / playlist set up via
 * `setQueue({ station | playlist })`), MusicKit auto-advances to the next
 * item internally — invoking `onEnded` then would call our parent's
 * `nextTrack` → `skipToNextItem()`, skipping past the item MusicKit just
 * moved to and visibly mismatching the displayed Now Playing entry from
 * what's actually playing. Suppress for shells; the terminal `completed`
 * (state=10) signal still hands control back when the whole queue is
 * exhausted.
 */
export function shouldFireEndedForPlaybackState(
  state: number | undefined,
  currentTrack: Track | null
): boolean {
  if (state === 10) return true;
  if (state === 5) return !isAppleMusicCollectionTrack(currentTrack);
  return false;
}
