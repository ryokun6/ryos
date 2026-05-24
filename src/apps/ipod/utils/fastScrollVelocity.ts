// Velocity-based detector for the iPod wheel's "scroll by letter"
// affordance. Kept as a pure, stateful helper so the threshold logic
// is unit-testable without mounting the full `useIpodLogic` hook.
//
// Semantics
// ---------
// Callers pass in a mutable ring buffer of timestamps for the most
// recent rotation events on an alphabetic menu, the current
// `Date.now()`, whether letter-jump mode is currently active, and a
// configuration object. The helper:
//
//   1. Appends `now` to the buffer and trims it to `windowSize`.
//   2. Returns the recommended state transition based on the time
//      span across the (full) window:
//        - "activate"   — was inactive, window span ≤ activateMaxMs
//        - "deactivate" — was active, window span ≥ deactivateMaxMs
//        - "none"       — neither edge crossed (or window not full)
//
// The asymmetric thresholds give natural hysteresis: a clearly rapid
// spin is required to enter letter-jump mode, but a moderate slow-down
// is enough to leave it. Slow browsing never activates because the
// inter-rotation interval keeps the window span above activateMaxMs
// regardless of how many rotations have happened in total.

export interface FastScrollVelocityConfig {
  windowSize: number;
  activateMaxMs: number;
  deactivateMaxMs: number;
}

export type FastScrollVelocityDecision = "activate" | "deactivate" | "none";

export function recordRotationAndEvaluate(
  timestamps: number[],
  now: number,
  active: boolean,
  config: FastScrollVelocityConfig
): FastScrollVelocityDecision {
  timestamps.push(now);
  if (timestamps.length > config.windowSize) {
    timestamps.shift();
  }
  if (timestamps.length < config.windowSize) {
    return "none";
  }
  const windowSpanMs = now - timestamps[0];
  if (!active && windowSpanMs <= config.activateMaxMs) {
    return "activate";
  }
  if (active && windowSpanMs >= config.deactivateMaxMs) {
    return "deactivate";
  }
  return "none";
}
