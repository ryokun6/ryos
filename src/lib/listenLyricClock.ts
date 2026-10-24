import {
  correctLyricClock,
  readLyricClock,
  type LyricClockAnchor,
} from "@/shared/listen/lyricClock";

let anchor: LyricClockAnchor | null = null;
let correctionKey = "";
let offsetMs = 0;

export function setListenLyricOffsetMs(next: number): void {
  offsetMs = Number.isFinite(next) ? next : 0;
}

export function clearListenLyricClock(): void {
  anchor = null;
  correctionKey = "";
}

export function stepListenLyricClock(args: {
  correctionKey: string;
  targetMs: number;
  nowMs: number;
  trackKey: string;
  playing: boolean;
}): void {
  if (args.correctionKey !== correctionKey || !anchor || anchor.trackKey !== args.trackKey) {
    correctionKey = args.correctionKey;
    anchor = correctLyricClock({
      anchor,
      targetMs: args.targetMs,
      nowMs: args.nowMs,
      trackKey: args.trackKey,
      playing: args.playing,
    });
  }
}

/** Lyric timeline in ms (playback position plus the current offset), or null when inactive. */
export function readListenLyricTimelineMs(nowMs: number): number | null {
  if (!anchor) return null;
  return readLyricClock(anchor, nowMs) + offsetMs;
}

export function readListenLyricMediaMs(nowMs: number): number | null {
  if (!anchor) return null;
  return readLyricClock(anchor, nowMs);
}
