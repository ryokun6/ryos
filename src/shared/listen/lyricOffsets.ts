import { clampLyricOffset } from "../songs/lyricOffsetWrite";

const TRACK_ID_RE = /^(?:[a-zA-Z0-9_-]{11}|am:[A-Za-z0-9._-]{1,64})$/;
const MAX_OFFSETS = 80;

export function normalizeLyricOffsetMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!TRACK_ID_RE.test(key) || typeof raw !== "number") continue;
    const clamped = clampLyricOffset(raw);
    if (clamped == null) continue;
    out[key] = clamped;
    if (Object.keys(out).length >= MAX_OFFSETS) break;
  }
  return out;
}

export function isSharedTrackId(trackId: string): boolean {
  return TRACK_ID_RE.test(trackId);
}
