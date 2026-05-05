/** Timed calendar grid: 15-minute snap, single-day events (no overnight). */

export const GRID_SNAP_MINUTES = 15;
export const GRID_MIN_DURATION_MINUTES = 15;

export function timeStringToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function minutesToTimeString(totalMin: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(totalMin)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function snapMinutes(min: number, step = GRID_SNAP_MINUTES): number {
  return Math.round(min / step) * step;
}

export function defaultEndMinutes(startMin: number, endTime: string | undefined): number {
  if (endTime) return timeStringToMinutes(endTime);
  return Math.min(24 * 60, startMin + 60);
}
