/**
 * Hybrid logical clock timestamps for Cloud Sync v2.
 *
 * Format: `MMMMMMMMMMMMMM-CCCC-clientId`
 * - 14-digit zero-padded unix milliseconds (covers year 5138)
 * - 4-hex-digit counter that advances past any larger timestamp seen
 * - writer client id as the final tiebreaker
 *
 * Because the millisecond and counter segments are fixed width, plain string
 * comparison gives a total order that respects physical time, preserves
 * causality for clients that have observed newer values, and is
 * deterministic on ties.
 */

const MS_WIDTH = 14;
const COUNTER_WIDTH = 4;
const MAX_COUNTER = 0xffff;

export function formatHlc(ms: number, counter: number, clientId: string): string {
  const safeMs = Math.max(0, Math.floor(ms));
  const safeCounter = Math.min(Math.max(0, Math.floor(counter)), MAX_COUNTER);
  return `${safeMs.toString().padStart(MS_WIDTH, "0")}-${safeCounter
    .toString(16)
    .padStart(COUNTER_WIDTH, "0")}-${clientId}`;
}

export function parseHlcMs(t: string): number {
  const ms = Number.parseInt(t.slice(0, MS_WIDTH), 10);
  return Number.isFinite(ms) ? ms : 0;
}

export function parseHlcCounter(t: string): number {
  const counter = Number.parseInt(
    t.slice(MS_WIDTH + 1, MS_WIDTH + 1 + COUNTER_WIDTH),
    16
  );
  return Number.isFinite(counter) ? counter : 0;
}

export function compareHlc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isValidHlc(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^\d{14}-[0-9a-f]{4}-.+$/.test(value) && value.length <= 96;
}

/**
 * Generate the next HLC for `clientId`, strictly greater than `last` (the
 * largest timestamp this client has generated or observed) even when the
 * local wall clock is behind.
 */
export function nextHlc(
  last: string | null | undefined,
  clientId: string,
  nowMs: number = Date.now()
): string {
  if (!last || !isValidHlc(last)) {
    return formatHlc(nowMs, 0, clientId);
  }

  const lastMs = parseHlcMs(last);
  if (nowMs > lastMs) {
    return formatHlc(nowMs, 0, clientId);
  }

  const lastCounter = parseHlcCounter(last);
  if (lastCounter >= MAX_COUNTER) {
    return formatHlc(lastMs + 1, 0, clientId);
  }
  return formatHlc(lastMs, lastCounter + 1, clientId);
}

/** Build an HLC from a wall-clock timestamp. */
export function hlcFromTimestamp(
  timestamp: string | number | null | undefined,
  clientId: string
): string {
  let ms = 0;
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    ms = timestamp;
  } else if (typeof timestamp === "string" && timestamp.length > 0) {
    const parsed = new Date(timestamp).getTime();
    ms = Number.isFinite(parsed) ? parsed : 0;
  }
  return formatHlc(ms, 0, clientId);
}

/**
 * Clamp a client-supplied HLC so a wildly wrong clock cannot win conflicts
 * far into the future. Returns the original when within bounds.
 */
export function clampHlc(
  t: string,
  clientId: string,
  nowMs: number = Date.now(),
  maxSkewMs: number = 5 * 60 * 1000
): string {
  const ms = parseHlcMs(t);
  if (ms <= nowMs + maxSkewMs) {
    return t;
  }
  return formatHlc(nowMs + maxSkewMs, parseHlcCounter(t), clientId);
}
