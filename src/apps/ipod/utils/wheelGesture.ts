/**
 * Click-wheel gesture math for the iPod.
 *
 * Samples are our own model of a 15° click wheel: angular speed, a center
 * corridor that must not tick, a short reversal gate, list and scrub step
 * tables, volume mapped onto the shared 0–1 iPod volume, and menu-slide
 * timing. Nothing here is copied from another implementation.
 */

export const LIST_ROW_TIERS = [1, 2, 3, 5, 8, 13, 21, 34] as const;
export const SCRUB_STEP_SECONDS = [1, 2, 3, 5] as const;

export const ACCEL_MIN_SPEED_DEG_PER_SEC = 180;
export const ACCEL_TIER_MS = 500;
export const ACCEL_GAP_RESET_MS = 250;
export const WHEEL_SPEED_MAX_DEG_PER_SEC = 400;
export const WHEEL_SPEED_EMA_ALPHA = 0.15;

export const REVERSAL_THRESHOLD_DEG = 8;
export const HUB_RADIUS_RATIO = 0.1;

/** 1.25 turns across 0–100 volume units. */
export const VOLUME_DEGREES_PER_UNIT = (1.25 * 360) / 100;

export const SCRUB_COMMIT_IDLE_MS = 1000;
export const VOLUME_OVERLAY_IDLE_MS = 5000;
export const HOLD_SEEK_REPEAT_MS = 200;
export const MENU_SLIDE_FULL_MS = 240;

/**
 * How long the center button must stay down before it opens the Now Playing
 * menu. A release before this is a short press. On Now Playing that press
 * cycles seek, then video, then the plain screen. A release after the menu
 * has opened must not also count as that short press.
 */
export const CENTER_HOLD_MS = 500;

export type CenterGesturePhase = "idle" | "down" | "menu";

/** Now Playing screen reached by a short center press. */
export type NowPlayingCenterMode = "seek" | "video" | "normal";

/** Short center press on Now Playing: seek, then video, then the plain screen. */
export function nextNowPlayingCenterMode(
  mode: NowPlayingCenterMode
): NowPlayingCenterMode {
  if (mode === "seek") return "video";
  if (mode === "video") return "normal";
  return "seek";
}

export function centerPressDown(): CenterGesturePhase {
  return "down";
}

/** The hold threshold opens the menu at most once, and only from a press. */
export function centerPressHeld(phase: CenterGesturePhase): {
  phase: CenterGesturePhase;
  openMenu: boolean;
} {
  if (phase !== "down") return { phase, openMenu: false };
  return { phase: "menu", openMenu: true };
}

/**
 * Releasing before the hold threshold selects. On Now Playing, selection
 * cycles seek → video → the plain screen. Releasing after the menu opened
 * does not select.
 */
export function centerPressReleased(phase: CenterGesturePhase): {
  phase: CenterGesturePhase;
  select: boolean;
} {
  if (phase === "down") return { phase: "idle", select: true };
  return { phase: "idle", select: false };
}

export type AccelState = {
  direction: -1 | 0 | 1;
  aboveSince: number | null;
  lastAt: number | null;
};

export function initialAccelState(): AccelState {
  return { direction: 0, aboveSince: null, lastAt: null };
}

export function smoothWheelSpeed(
  previous: number | null,
  sampleDegPerSec: number,
  alpha: number = WHEEL_SPEED_EMA_ALPHA,
  maxDegPerSec: number = WHEEL_SPEED_MAX_DEG_PER_SEC
): number {
  const clamped = Math.min(maxDegPerSec, Math.max(0, sampleDegPerSec));
  if (previous == null) return clamped;
  return previous + alpha * (clamped - previous);
}

/**
 * True when the straight segment between two center-relative points passes
 * within `ratio * radius` of the wheel hub. The caller still advances its
 * last point so the next sample starts on the far side.
 */
export function segmentPassesNearHub(
  prev: { x: number; y: number },
  next: { x: number; y: number },
  radius: number,
  ratio: number = HUB_RADIUS_RATIO
): boolean {
  if (!(radius > 0)) return false;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) {
    t = (prev.x * dx + prev.y * dy) / len2;
    t = Math.max(0, Math.min(1, -t));
  }
  const closestX = prev.x + t * dx;
  const closestY = prev.y + t * dy;
  return Math.hypot(closestX, closestY) <= radius * ratio;
}

export type ReversalState = {
  sign: -1 | 0 | 1;
  pendingOppositeDeg: number;
};

export function initialReversalState(): ReversalState {
  return { sign: 0, pendingOppositeDeg: 0 };
}

/**
 * Opposite travel accumulates until `thresholdDeg`. The sample that crosses
 * the threshold flips the sign and is not forwarded.
 */
export function applyReversalHysteresis(
  state: ReversalState,
  signedDeltaDeg: number,
  thresholdDeg: number = REVERSAL_THRESHOLD_DEG
): { state: ReversalState; acceptedDeltaDeg: number } {
  if (signedDeltaDeg === 0) {
    return { state, acceptedDeltaDeg: 0 };
  }
  const sign: -1 | 1 = signedDeltaDeg > 0 ? 1 : -1;
  if (state.sign === 0 || state.sign === sign) {
    return {
      state: { sign, pendingOppositeDeg: 0 },
      acceptedDeltaDeg: signedDeltaDeg,
    };
  }
  const pending = state.pendingOppositeDeg + Math.abs(signedDeltaDeg);
  if (pending < thresholdDeg) {
    return {
      state: { sign: state.sign, pendingOppositeDeg: pending },
      acceptedDeltaDeg: 0,
    };
  }
  return {
    state: { sign, pendingOppositeDeg: 0 },
    acceptedDeltaDeg: 0,
  };
}

export function nextTierIndex(opts: {
  state: AccelState;
  direction: -1 | 1;
  speedDegPerSec: number;
  now: number;
  tierCount: number;
  minSpeed?: number;
  tierMs?: number;
  gapMs?: number;
}): { state: AccelState; index: number } {
  const minSpeed = opts.minSpeed ?? ACCEL_MIN_SPEED_DEG_PER_SEC;
  const tierMs = opts.tierMs ?? ACCEL_TIER_MS;
  const gapMs = opts.gapMs ?? ACCEL_GAP_RESET_MS;
  const speed = Math.min(
    WHEEL_SPEED_MAX_DEG_PER_SEC,
    Math.max(0, opts.speedDegPerSec)
  );
  const gap =
    opts.state.lastAt == null ? Number.POSITIVE_INFINITY : opts.now - opts.state.lastAt;
  const directionChanged =
    opts.state.direction !== 0 && opts.state.direction !== opts.direction;
  const slow = speed <= minSpeed;
  if (slow || directionChanged || gap > gapMs) {
    return {
      index: 0,
      state: {
        direction: opts.direction,
        aboveSince: slow ? null : opts.now,
        lastAt: opts.now,
      },
    };
  }
  const aboveSince = opts.state.aboveSince ?? opts.now;
  const index = Math.min(
    Math.max(0, opts.tierCount - 1),
    Math.floor((opts.now - aboveSince) / tierMs)
  );
  return {
    index,
    state: {
      direction: opts.direction,
      aboveSince,
      lastAt: opts.now,
    },
  };
}

export function nextListRowCount(
  state: AccelState,
  sample: { direction: -1 | 1; speedDegPerSec: number; now: number }
): { state: AccelState; rows: number } {
  const next = nextTierIndex({
    state,
    direction: sample.direction,
    speedDegPerSec: sample.speedDegPerSec,
    now: sample.now,
    tierCount: LIST_ROW_TIERS.length,
  });
  return { state: next.state, rows: LIST_ROW_TIERS[next.index] ?? 1 };
}

export function nextScrubStepSeconds(
  state: AccelState,
  sample: { direction: -1 | 1; speedDegPerSec: number; now: number }
): { state: AccelState; seconds: number } {
  const next = nextTierIndex({
    state,
    direction: sample.direction,
    speedDegPerSec: sample.speedDegPerSec,
    now: sample.now,
    tierCount: SCRUB_STEP_SECONDS.length,
  });
  return {
    state: next.state,
    seconds: SCRUB_STEP_SECONDS[next.index] ?? 1,
  };
}

/** Hold-to-seek on the prev/next sectors: 5s ×3, 10s ×3, then 20s. */
export function seekHoldStepSeconds(repeatIndex: number): number {
  if (repeatIndex < 3) return 5;
  if (repeatIndex < 6) return 10;
  return 20;
}

export function clampPlaybackSeconds(
  seconds: number,
  durationSeconds: number
): number {
  const lower = Math.max(0, seconds);
  if (durationSeconds > 0) return Math.min(durationSeconds, lower);
  return lower;
}

/**
 * Scrub marker: an 8px square rotated 45°, centered on the true playback
 * position. The ring is a 1px knockout in the LCD field color. The shadow
 * is painted on the square and then rotated with it, so the axis-aligned
 * half-extent is `(size/2 + ring) * √2`. That hang must stay inside the
 * Now Playing column's `px-2` gutter. The travel itself is not inset.
 */
export const SCRUB_DIAMOND_SIZE_PX = 8;
export const SCRUB_DIAMOND_RING_PX = 1;
/** Tailwind `px-2` on the Now Playing column. The diamond hangs into it. */
export const SCRUB_DIAMOND_COLUMN_GUTTER_PX = 8;

export function scrubDiamondHalfExtentPx(
  sizePx: number = SCRUB_DIAMOND_SIZE_PX,
  ringPx: number = SCRUB_DIAMOND_RING_PX
): number {
  return (sizePx / 2 + ringPx) * Math.SQRT2;
}

/**
 * Center of the diamond along the track, in CSS pixels. This is the tip of
 * the filled bar: 0 at the left end, the full width at the right end.
 */
export function scrubDiamondCenterPx(
  fraction: number,
  trackWidthPx: number
): number {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  return clamped * Math.max(0, trackWidthPx);
}

/** CSS `left` for a marker centered with `translateX(-50%)`. */
export function scrubDiamondLeftCss(fraction: number): string {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const percent = Math.round(clamped * 100 * 1000) / 1000;
  return `${percent}%`;
}

/**
 * Knockout ring. Modern stays white because backlight-off dims the whole
 * LCD with a filter. Classic lit uses the bottom of the LCD gradient, where
 * the bar sits. Classic unlit uses the unlit field; the screen filter tints
 * the ring with the background.
 */
export function scrubDiamondRingColor(
  isModernUi: boolean,
  backlightOn: boolean
): string {
  if (isModernUi) return "#ffffff";
  return backlightOn ? "#e0f0fc" : "#8a9da9";
}

export type ScrubSession = {
  preview: number;
  committed: number;
  lastInputAt: number | null;
  accel: AccelState;
};

export function initialScrubSession(seconds: number): ScrubSession {
  return {
    preview: seconds,
    committed: seconds,
    lastInputAt: null,
    accel: initialAccelState(),
  };
}

export function advanceScrubSession(
  session: ScrubSession,
  input: {
    direction: -1 | 1;
    speedDegPerSec: number;
    now: number;
    durationSeconds: number;
  }
): ScrubSession {
  const stepped = nextScrubStepSeconds(session.accel, {
    direction: input.direction,
    speedDegPerSec: input.speedDegPerSec,
    now: input.now,
  });
  const preview = clampPlaybackSeconds(
    session.preview + stepped.seconds * input.direction,
    input.durationSeconds
  );
  return {
    preview,
    committed: session.committed,
    lastInputAt: input.now,
    accel: stepped.state,
  };
}

/**
 * Commit the scrub preview once the wheel has been idle for `idleMs`.
 * A second idle check after a commit returns null.
 */
export function commitScrubIfIdle(
  session: ScrubSession,
  now: number,
  idleMs: number = SCRUB_COMMIT_IDLE_MS
): { session: ScrubSession; commitSeconds: number | null } {
  if (
    session.lastInputAt == null ||
    now - session.lastInputAt < idleMs ||
    session.preview === session.committed
  ) {
    return { session, commitSeconds: null };
  }
  return {
    commitSeconds: session.preview,
    session: { ...session, committed: session.preview },
  };
}

export type VolumeGestureState = {
  remainderDeg: number;
  sign: -1 | 0 | 1;
};

export function initialVolumeGestureState(): VolumeGestureState {
  return { remainderDeg: 0, sign: 0 };
}

/**
 * Map signed wheel degrees onto the shared iPod volume (0–1).
 * One volume unit (1% ) is {@link VOLUME_DEGREES_PER_UNIT} degrees.
 * A direction change drops the fractional leftover. Values clamp to 0–100.
 */
export function applyVolumeDegrees(
  volume01: number,
  state: VolumeGestureState,
  signedDegrees: number
): {
  volume01: number;
  state: VolumeGestureState;
  units: number;
  changed: boolean;
} {
  const currentUnits = Math.min(100, Math.max(0, volume01 * 100));
  if (signedDegrees === 0) {
    return {
      volume01: currentUnits / 100,
      state,
      units: currentUnits,
      changed: false,
    };
  }
  const sign: -1 | 1 = signedDegrees > 0 ? 1 : -1;
  let remainder = state.remainderDeg;
  if (state.sign !== 0 && state.sign !== sign) remainder = 0;
  const accumulated = remainder + signedDegrees;
  const unitsDelta = Math.trunc(accumulated / VOLUME_DEGREES_PER_UNIT);
  let nextRemainder = accumulated - unitsDelta * VOLUME_DEGREES_PER_UNIT;
  let nextUnits = currentUnits + unitsDelta;
  if (nextUnits >= 100) {
    nextUnits = 100;
    nextRemainder = 0;
  } else if (nextUnits <= 0) {
    nextUnits = 0;
    nextRemainder = 0;
  }
  return {
    volume01: nextUnits / 100,
    state: { remainderDeg: nextRemainder, sign },
    units: nextUnits,
    changed: Math.round(nextUnits) !== Math.round(currentUnits),
  };
}

export function menuSlideDurationMs(opts: {
  reducedMotion: boolean;
  fromPercent: number;
  toPercent: number;
  fullMs?: number;
}): number {
  if (opts.reducedMotion) return 0;
  const span = Math.abs(opts.toPercent - opts.fromPercent);
  return ((opts.fullMs ?? MENU_SLIDE_FULL_MS) * span) / 100;
}

/** Sine-like in-out from rest. Ease-out when a slide reverses mid-travel. */
export function menuSlideEase(reversingMidFlight: boolean): [number, number, number, number] {
  if (reversingMidFlight) return [0.22, 1, 0.36, 1];
  return [0.45, 0, 0.55, 1];
}

export function estimateSlidePercent(opts: {
  fromPercent: number;
  toPercent: number;
  startedAt: number;
  now: number;
  durationMs: number;
}): number {
  if (opts.durationMs <= 0) return opts.toPercent;
  const t = Math.max(0, Math.min(1, (opts.now - opts.startedAt) / opts.durationMs));
  return opts.fromPercent + (opts.toPercent - opts.fromPercent) * t;
}
