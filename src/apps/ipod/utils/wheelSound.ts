export const IPOD_WHEEL_SOUND_MIN_INTERVAL_MS = 30;

/**
 * A single touch-move can cross several wheel steps at once. Rate-limit the
 * 70 ms click sample so those steps do not create enough overlapping audio
 * sources to exhaust the mobile UI-sound pool.
 */
export function shouldPlayIpodWheelSound(
  lastPlayedAt: number | null,
  now: number,
  minimumIntervalMs: number = IPOD_WHEEL_SOUND_MIN_INTERVAL_MS
): boolean {
  return lastPlayedAt === null || now - lastPlayedAt >= minimumIntervalMs;
}

/** One extra click may be queued this far ahead. Anything later is dropped. */
export const IPOD_WHEEL_CLICK_MAX_LEAD_MS = 50;

/**
 * Several 15° quanta can land in one frame. Play at most one click now
 * (when the 30ms pool guard allows) and schedule at most one more inside
 * the lead window. The caller cancels that timer when the finger lifts so
 * a burst cannot click after the gesture has stopped.
 */
export function planWheelClicks(input: {
  quanta: number;
  lastPlayedAt: number | null;
  now: number;
  hasPending: boolean;
  minIntervalMs?: number;
  maxLeadMs?: number;
}): {
  playNow: boolean;
  scheduleDelayMs: number | null;
  nextLastPlayedAt: number | null;
} {
  const minIntervalMs = input.minIntervalMs ?? IPOD_WHEEL_SOUND_MIN_INTERVAL_MS;
  const maxLeadMs = input.maxLeadMs ?? IPOD_WHEEL_CLICK_MAX_LEAD_MS;
  if (input.quanta <= 0) {
    return {
      playNow: false,
      scheduleDelayMs: null,
      nextLastPlayedAt: input.lastPlayedAt,
    };
  }

  const playNow = shouldPlayIpodWheelSound(
    input.lastPlayedAt,
    input.now,
    minIntervalMs
  );
  const lastPlayedAt = playNow ? input.now : input.lastPlayedAt;
  const remaining = input.quanta - (playNow ? 1 : 0);
  let scheduleDelayMs: number | null = null;
  if (remaining > 0 && !input.hasPending) {
    const earliest = (lastPlayedAt ?? input.now) + minIntervalMs;
    const delay = Math.max(0, earliest - input.now);
    if (delay <= maxLeadMs) scheduleDelayMs = delay;
  }

  return {
    playNow,
    scheduleDelayMs,
    nextLastPlayedAt: lastPlayedAt,
  };
}
