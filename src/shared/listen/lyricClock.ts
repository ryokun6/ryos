/**
 * Local lyric timeline. Wall time advances the clock; sync corrections ease
 * small drift and snap only for a real seek or track change.
 */

export const LYRIC_CLOCK_HARD_CORRECT_MS = 750;
export const LYRIC_CLOCK_EASE_WINDOW_MS = 1200;
export const LYRIC_CLOCK_SETTLE_MS = 40;
export const LYRIC_CLOCK_MIN_RATE = 0.92;
export const LYRIC_CLOCK_MAX_RATE = 1.08;

export interface LyricClockAnchor {
  mediaMs: number;
  anchoredAtMs: number;
  rate: number;
  trackKey: string;
}

export function readLyricClock(anchor: LyricClockAnchor, nowMs: number): number {
  return anchor.mediaMs + (nowMs - anchor.anchoredAtMs) * anchor.rate;
}

export function correctLyricClock(args: {
  anchor: LyricClockAnchor | null;
  targetMs: number;
  nowMs: number;
  trackKey: string;
  playing: boolean;
}): LyricClockAnchor {
  const target = Math.max(0, args.targetMs);
  if (!args.anchor || args.anchor.trackKey !== args.trackKey || !args.playing) {
    return {
      mediaMs: target,
      anchoredAtMs: args.nowMs,
      rate: args.playing ? 1 : 0,
      trackKey: args.trackKey,
    };
  }

  const displayed = readLyricClock(args.anchor, args.nowMs);
  const drift = target - displayed;
  if (Math.abs(drift) >= LYRIC_CLOCK_HARD_CORRECT_MS) {
    return {
      mediaMs: target,
      anchoredAtMs: args.nowMs,
      rate: 1,
      trackKey: args.trackKey,
    };
  }
  if (Math.abs(drift) < LYRIC_CLOCK_SETTLE_MS) {
    return {
      mediaMs: displayed,
      anchoredAtMs: args.nowMs,
      rate: 1,
      trackKey: args.trackKey,
    };
  }
  const rate = Math.min(
    LYRIC_CLOCK_MAX_RATE,
    Math.max(LYRIC_CLOCK_MIN_RATE, 1 + drift / LYRIC_CLOCK_EASE_WINDOW_MS)
  );
  return {
    mediaMs: displayed,
    anchoredAtMs: args.nowMs,
    rate,
    trackKey: args.trackKey,
  };
}
